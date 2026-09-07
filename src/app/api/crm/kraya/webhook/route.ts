import crypto from "crypto";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { findUserForCrmContact, emailKey, phoneKey } from "@/lib/crm/identity";
import { classifyCrmStage } from "@/lib/crm/stages";
import { closeDemoFromCrm, convertStudentFromCrm, reopenDemoFromCrm } from "@/lib/crm/sync";
import { CrmLead } from "@/models/CrmLead";

export const dynamic = "force-dynamic";

const SECRET_HEADER = "x-kraya-webhook-secret";
/** The CRM retries at 30s and 60s; ignore a repeat of the same stage inside that window. */
const INBOUND_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function verifySecret(provided: string | null) {
  const expected = String(process.env.KRAYA_WEBHOOK_SECRET || "").trim();
  if (!expected) return false;
  const supplied = String(provided || "").trim();
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  // timingSafeEqual throws on a length mismatch, so compare lengths separately.
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export async function POST(req: Request) {
  if (!verifySecret(req.headers.get(SECRET_HEADER))) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const crmLeadId = payload?.lead_id != null ? String(payload.lead_id) : "";
  const stageName = String(payload?.stage || "").trim();
  const phone = String(payload?.phone || "").trim();
  const email = String(payload?.email || "").trim();

  if (!stageName) {
    // Nothing to act on, but a non-200 would trigger the CRM retry cycle.
    return NextResponse.json({ ok: true, ignored: "No stage in payload." });
  }

  try {
    await dbConnect();
    const kind = classifyCrmStage(stageName);
    const user: any = await findUserForCrmContact({ phone, email });

    const matchers = [
      ...(crmLeadId ? [{ crmLeadId }] : []),
      ...(user?._id ? [{ user: user._id }] : []),
      ...(phoneKey(phone) ? [{ phoneKey: phoneKey(phone) }] : []),
      ...(emailKey(email) ? [{ emailKey: emailKey(email) }] : []),
    ];
    if (!matchers.length) {
      // No lead id and no contact details: nothing identifies this lead, and an
      // empty $or is a Mongo error that would put the CRM into its retry cycle.
      return NextResponse.json({ ok: true, ignored: "Payload has no lead id, phone or email." });
    }

    const lead = (await CrmLead.findOne({ $or: matchers })) || new CrmLead({});

    const isRepeat =
      lead.lastInboundStage === stageName &&
      lead.lastInboundAt &&
      Date.now() - new Date(lead.lastInboundAt).getTime() < INBOUND_DEDUPE_WINDOW_MS;

    if (crmLeadId) lead.crmLeadId = crmLeadId;
    if (payload?.name) lead.name = String(payload.name);
    if (payload?.pipeline) lead.pipeline = String(payload.pipeline);
    if (phoneKey(phone)) lead.phoneKey = phoneKey(phone);
    if (emailKey(email)) lead.emailKey = emailKey(email);
    if (user?._id) lead.user = user._id;
    lead.lastInboundStage = stageName;
    lead.lastInboundStageKind = kind;
    lead.lastInboundAt = new Date();

    // Echo suppression: record the CRM stage as already pushed so the booking
    // write below does not bounce the same stage straight back to the CRM.
    if (kind === "converted") lead.lastPushedStage = "CURRENT_STUDENT";

    lead.history = [...(Array.isArray(lead.history) ? lead.history : []), {
      direction: "inbound" as const,
      stage: stageName,
      ok: true,
      note: `${payload?.event_type || "update"}${user ? "" : " (no matching portal account)"}`,
      at: new Date(),
    }].slice(-40);
    await lead.save().catch(() => undefined);

    if (!user?._id) {
      return NextResponse.json({ ok: true, matched: false, stage: stageName, kind });
    }
    if (isRepeat) {
      return NextResponse.json({ ok: true, matched: true, stage: stageName, kind, deduped: true });
    }

    const userId = idOf(user._id);
    if (kind === "closed") {
      const result = await closeDemoFromCrm({ userId, stageName, crmLeadId });
      return NextResponse.json({ ok: true, matched: true, stage: stageName, kind, ...result });
    }
    if (kind === "converted") {
      const result = await convertStudentFromCrm({ userId, stageName, crmLeadId });
      return NextResponse.json({ ok: true, matched: true, stage: stageName, kind, ...result });
    }

    if (kind === "demo") {
      // The portal owns demo stages, so this never overwrites a running demo -
      // `reopenDemoFromCrm` no-ops unless the only demo on file is a closed one.
      // That makes closure reversible: sales can revive a lead they wrote off.
      // The reopened booking then pushes its true state (Demo Requested) back,
      // and the resulting webhook finds an active demo and stops there.
      const result = await reopenDemoFromCrm({ userId, stageName, crmLeadId });
      return NextResponse.json({ ok: true, matched: true, stage: stageName, kind, ...result });
    }

    // "ignore": early-funnel or unrecognised stages, which change nothing here.
    return NextResponse.json({ ok: true, matched: true, stage: stageName, kind, applied: false });
  } catch (error) {
    console.error("Kraya webhook failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
