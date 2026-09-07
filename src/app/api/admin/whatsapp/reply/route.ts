import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { findWhatsAppUserByPhone, normalizeWhatsAppNumber, sendWhatsAppTextMessage } from "@/lib/whatsappAutomation";
import { WhatsAppMessage } from "@/models/WhatsApp";

export const dynamic = "force-dynamic";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!canManageWhatsApp(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorId = (session!.user as any).id;

  const body = await req.json().catch(() => ({}));
  const phoneNumber = normalizeWhatsAppNumber(String(body.phoneNumber || body.to || ""));
  const text = String(body.text || "").trim();
  if (!phoneNumber || !text) return NextResponse.json({ error: "Phone number and message are required." }, { status: 400 });

  await dbConnect();
  const lastInbound: any = await WhatsAppMessage.findOne({ phoneNumber, direction: "inbound" }).sort({ receivedAt: -1, createdAt: -1 }).lean();
  const activeUntil = lastInbound ? new Date(new Date(lastInbound.receivedAt || lastInbound.createdAt).getTime() + CUSTOMER_SERVICE_WINDOW_MS) : null;
  if (!activeUntil || activeUntil.getTime() <= Date.now()) {
    return NextResponse.json({
      success: false,
      error: "WHATSAPP_WINDOW_CLOSED",
      message: "The 24-hour customer service window has expired.",
      requires_template: true,
      window_expired_at: activeUntil?.toISOString() || null,
    }, { status: 409 });
  }

  const matchedUser: any = await findWhatsAppUserByPhone(phoneNumber);
  const result = await sendWhatsAppTextMessage({
    to: phoneNumber,
    text,
    testMode: false,
    metadata: { kind: "manual_whatsapp_reply", source: "whatsapp_admin", actor: actorId },
  });
  await WhatsAppMessage.create({
    phoneNumber,
    contactName: matchedUser?.name || "",
    matchedUser: matchedUser?._id,
    direction: "outbound",
    messageType: "text",
    text,
    status: result.delivered ? "sent" : result.skipped ? "queued" : "failed",
    metaMessageId: result.metaMessageId || undefined,
    error: result.errorMessage || result.error || "",
    rawPayload: result.payload,
    sentAt: new Date(),
  });

  return NextResponse.json({ ok: result.ok, result });
}
