import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { krayaCallStatus, pushCallLog, pushLeadStageLabel, type PortalCallOutcome } from "@/lib/crm/client";
import { getStageCatalogue } from "@/lib/crm/catalogue";
import { toLeadView } from "@/lib/crm/leads";
import { recordPortalStageChange } from "@/lib/crm/mirror";
import { classifyCrmStage } from "@/lib/crm/stages";
import { closeDemoFromCrm, convertStudentFromCrm, reopenDemoFromCrm } from "@/lib/crm/sync";
import { logSalesAction, requireSalesViewer } from "@/lib/salesAudit";
import { CrmLead } from "@/models/CrmLead";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

export const dynamic = "force-dynamic";

const CALL_OUTCOMES = new Set(["connected", "no_answer", "busy", "wrong_number", "callback_requested", "not_interested"]);

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/**
 * The one write the sales team makes to the CRM.
 *
 * Three actions share this route: `stage` pushes to Kraya, `call` and `note` are
 * portal-only. Keeping calls and notes local is deliberate - Kraya's upsert
 * overwrites its `notes` field wholesale, so anything the portal sent there would
 * destroy whatever the CRM already held.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await requireSalesViewer("salesCrm", ["view", "stage", "note"]);
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String((body as any)?.action || "");

  await dbConnect();
  const record: any = await CrmLeadRecord.findById(params.id);
  if (!record) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  if (action === "stage") {
    if (!viewer.permissions.stage) {
      return NextResponse.json({ error: "You do not have permission to change lead stages." }, { status: 403 });
    }
    const stage = String((body as any)?.stage || "").trim();
    if (!stage) return NextResponse.json({ error: "A stage is required." }, { status: 400 });

    // Only stages the CRM has actually used are offered. Inventing a stage name
    // would be rejected by Kraya and would leave the mirror describing a stage
    // that does not exist in the pipeline.
    const catalogue = await getStageCatalogue();
    if (!catalogue.some((entry) => entry.stage === stage)) {
      return NextResponse.json({ error: "That stage is not in the CRM pipeline." }, { status: 400 });
    }
    if (record.stage === stage) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    // Captured before the push: `recordPortalStageChange` writes through its own
    // document instance, so this one still holds the pre-change stage afterwards
    // and `record.previousStage` would be one move too far back.
    const fromStage = String(record.stage || "");

    const push = await pushLeadStageLabel({
      crmLeadId: record.crmLeadId,
      name: record.name,
      phone: record.phone,
      email: record.email,
      // The literal pipeline label, not a DemoStage - the sales team moves leads
      // through stages the demo enum has no member for.
      stageLabel: stage,
      // `notes` is intentionally omitted - see the comment above.
    });

    if (!push.ok) {
      record.lastPushError = push.reason;
      await record.save().catch(() => undefined);
      return NextResponse.json({ error: push.reason }, { status: push.skipped ? 400 : 502 });
    }

    await recordPortalStageChange({
      crmLeadId: record.crmLeadId,
      stage,
      actorId: viewer.id,
      actorName: viewer.name,
    });

    // Echo suppression, the same guard the webhook relies on: marking the stage as
    // already pushed stops the booking write below bouncing it back to Kraya.
    if (record.portalUser) {
      await CrmLead.updateOne(
        { user: record.portalUser },
        { $set: { crmLeadId: record.crmLeadId, lastPushedStage: stage, lastPushedAt: new Date() } },
        { upsert: true },
      ).catch(() => undefined);
    }

    // Portal side-effects run through the same tested helpers the webhook uses, so
    // a stage moved from here behaves exactly as one moved inside Kraya. Anything
    // classified "ignore" - ordinary early-funnel movement - changes no booking.
    let applied: any = { applied: false };
    const kind = classifyCrmStage(stage);
    if (record.portalUser) {
      const userId = idOf(record.portalUser);
      const input = { userId, stageName: stage, crmLeadId: record.crmLeadId };
      if (kind === "closed") applied = await closeDemoFromCrm(input).catch(() => ({ error: true }));
      else if (kind === "converted") applied = await convertStudentFromCrm(input).catch(() => ({ error: true }));
      else if (kind === "demo") applied = await reopenDemoFromCrm(input).catch(() => ({ error: true }));
    }

    logSalesAction(viewer, `${viewer.name} moved lead ${record.name} to ${stage}`, {
      crmLeadId: record.crmLeadId,
      from: fromStage,
      to: stage,
      kind,
    });

    const fresh: any = await CrmLeadRecord.findById(params.id).lean();
    const groupByStage = new Map(catalogue.map((entry) => [entry.stage, entry.group]));
    return NextResponse.json({
      ok: true,
      kind,
      applied,
      lead: toLeadView(fresh, (value) => groupByStage.get(value) ?? "other"),
    });
  }

  if (action === "call" || action === "note") {
    if (!viewer.permissions.note) {
      return NextResponse.json({ error: "You do not have permission to log calls or notes." }, { status: 403 });
    }

    if (action === "call") {
      const raw = String((body as any)?.outcome || "connected");
      const outcome = (CALL_OUTCOMES.has(raw) ? raw : "connected") as PortalCallOutcome;
      const durationMinutes = Math.max(0, Number((body as any)?.durationMinutes || 0));
      const note = String((body as any)?.note || "").trim().slice(0, 2000);

      // Kraya rejects a "done" call with no notes, so the requirement is enforced
      // here rather than discovered as a 400 after the call is already logged.
      if (krayaCallStatus(outcome) === "done" && !note) {
        return NextResponse.json({ error: "A connected call needs a note before it can be logged." }, { status: 400 });
      }

      // Mirrored out to the CRM so both systems share one call history. The push
      // happens before the local write only so its result can be stored with the
      // call - a failure is recorded on the entry rather than losing the log.
      const push = await pushCallLog({
        crmLeadId: record.crmLeadId,
        phone: record.phone,
        outcome,
        durationMinutes,
        notes: note,
      });

      record.calls = [
        ...(record.calls || []),
        {
          at: new Date(),
          by: viewer.id,
          byName: viewer.name,
          outcome,
          durationMinutes,
          note,
          krayaCallId: push.ok ? push.callId : undefined,
          pushError: push.ok ? undefined : push.reason,
        },
      ];
    } else {
      const text = String((body as any)?.body || "").trim();
      if (!text) return NextResponse.json({ error: "A note cannot be empty." }, { status: 400 });
      record.internalNotes = [
        ...(record.internalNotes || []),
        { at: new Date(), by: viewer.id, byName: viewer.name, body: text.slice(0, 4000) },
      ];
    }

    await record.save();
    logSalesAction(viewer, `${viewer.name} logged a ${action} on lead ${record.name}`, { crmLeadId: record.crmLeadId });

    const catalogue = await getStageCatalogue();
    const groupByStage = new Map(catalogue.map((entry) => [entry.stage, entry.group]));
    const fresh: any = await CrmLeadRecord.findById(params.id).lean();
    return NextResponse.json({ ok: true, lead: toLeadView(fresh, (value) => groupByStage.get(value) ?? "other") });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
