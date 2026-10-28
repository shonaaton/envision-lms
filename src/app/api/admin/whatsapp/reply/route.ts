import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { findWhatsAppUserByPhone, normalizeWhatsAppNumber, sendWhatsAppTextMessage } from "@/lib/whatsappAutomation";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { withWhatsAppSendRequest } from "@/lib/whatsappSendRequest";
import { whatsappSession, canAccessWhatsAppPhone } from "@/lib/whatsappAccess";

export const dynamic = "force-dynamic";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const user = await whatsappSession("create");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorId = user.id;

  const body = await req.json().catch(() => ({}));
  const phoneNumber = normalizeWhatsAppNumber(String(body.phoneNumber || body.to || ""));
  const text = String(body.text || "").trim();
  if (!/^\d{7,15}$/.test(phoneNumber) || !text || text.length > 4096) return NextResponse.json({ error: "A valid phone number and a message of up to 4096 characters are required." }, { status: 400 });

  await dbConnect();
  if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
  return withWhatsAppSendRequest({ key: body.requestId, actorId: String(actorId), kind: "reply", payload: { phoneNumber, text } }, async () => {
    const lastInbound: any = await WhatsAppMessage.findOne({ phoneNumber, direction: "inbound" }).sort({ receivedAt: -1, createdAt: -1 }).lean();
    const activeUntil = lastInbound ? new Date(new Date(lastInbound.receivedAt || lastInbound.createdAt).getTime() + CUSTOMER_SERVICE_WINDOW_MS) : null;
    if (!activeUntil || activeUntil.getTime() <= Date.now()) {
      return { body: {
        success: false,
        error: "WHATSAPP_WINDOW_CLOSED",
        message: "The 24-hour customer service window has expired.",
        requires_template: true,
        window_expired_at: activeUntil?.toISOString() || null,
      }, status: 409 };
    }

    const matchedUser: any = await findWhatsAppUserByPhone(phoneNumber);
    const result = await sendWhatsAppTextMessage({
      to: phoneNumber,
      text,
      testMode: false,
      metadata: { kind: "manual_whatsapp_reply", source: "whatsapp_admin", actor: actorId },
    });
    const uncertain = ["whatsapp_n8n_failed", "whatsapp_failed"].includes(result.error || "");
    const message = await WhatsAppMessage.create({
      phoneNumber,
      contactName: matchedUser?.name || "",
      matchedUser: matchedUser?._id,
      direction: "outbound",
      messageType: "text",
      text,
      status: result.ok ? "accepted" : uncertain || result.skipped ? "queued" : "failed",
      uncertain,
      metaMessageId: result.metaMessageId || undefined,
      error: result.errorMessage || result.error || "",
      rawPayload: result.payload,
      sentBy: actorId,
      sentAt: new Date(),
    });

    return { body: { ok: result.ok, result, messageId: String(message._id), error: result.ok ? "" : uncertain ? "Delivery is unconfirmed. Check this conversation before sending again." : result.errorMessage || result.error || "Reply could not be sent.", retryable: !uncertain, uncertain }, status: result.ok ? 200 : 502 };
  });
}
