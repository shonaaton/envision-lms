import { NextResponse } from "next/server";
import { validateWhatsAppUpload } from "@/lib/whatsappMediaRules";
import { whatsappGraph, whatsappMetaConfig, sendGraphMessage, WhatsAppMetaError } from "@/lib/whatsappMeta";
import { withWhatsAppSendRequest } from "@/lib/whatsappSendRequest";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { findWhatsAppUserByPhone } from "@/lib/whatsappAutomation";

/**
 * Sends a file or image inside the 24-hour reply window and stores it in the
 * shared inbox. Shared by the online inbox and the Bowbazar WhatsApp screen;
 * callers check access and size first. Returns the HTTP response. `phoneNumber` is the stored spelling.
 */
export async function sendWhatsAppAttachment(input: { phoneNumber: string; caption: string; bytes: Buffer; filename: string; requestId: unknown; actorId: string }) {
  const { phoneNumber, caption, bytes } = input;
  const upload = validateWhatsAppUpload(input.filename, bytes);
  if (upload.error) return NextResponse.json({ error: upload.error }, { status: 400 });
  return withWhatsAppSendRequest({ key: input.requestId, actorId: input.actorId, kind: "media", payload: { phoneNumber, caption, filename: upload.filename, hash: upload.hash } }, async () => {
    const lastInbound: any = await WhatsAppMessage.findOne({ phoneNumber, direction: "inbound" }).sort({ receivedAt: -1, createdAt: -1 }).lean();
    if (!lastInbound || new Date(lastInbound.receivedAt || lastInbound.createdAt).getTime() + 24 * 3600_000 <= Date.now()) return { body: { ok: false, error: "The reply window has expired. Send an approved template instead.", retryable: true }, status: 409 };
    let mediaId = "";
    let outcome: any;
    try {
      const { phoneNumberId } = whatsappMetaConfig();
      if (!phoneNumberId) throw new WhatsAppMetaError("The WhatsApp sending number is not configured.", 503);
      const payload = new FormData(); payload.set("messaging_product", "whatsapp"); payload.set("type", upload.mime!); payload.set("file", new Blob([new Uint8Array(bytes)], { type: upload.mime }), upload.filename!);
      // An uncertain upload has not sent a customer message and can be retried.
      let uploaded: any;
      try { uploaded = await whatsappGraph(`${phoneNumberId}/media`, { method: "POST", body: payload }, 40_000); }
      catch (error) { if (error instanceof WhatsAppMetaError) throw new WhatsAppMetaError(error.message, error.status, false, error.code); throw error; }
      mediaId = String(uploaded.id || "");
      if (!mediaId) throw new WhatsAppMetaError("Meta did not confirm the file upload. No message was sent.", 502);
      const result = await sendGraphMessage({ to: phoneNumber, type: upload.kind, [upload.kind!]: { id: mediaId, ...(caption ? { caption } : {}), ...(upload.kind === "document" ? { filename: upload.filename } : {}) } });
      outcome = { ok: true, ...result };
    } catch (error) {
      if (!(error instanceof WhatsAppMetaError)) throw error;
      outcome = { ok: false, status: error.uncertain ? "queued" : "failed", uncertain: error.uncertain, error: error.message };
    }
    const contact: any = await findWhatsAppUserByPhone(phoneNumber);
    const message = await WhatsAppMessage.create({ phoneNumber, matchedUser: contact?._id, contactName: contact?.name || "", direction: "outbound", messageType: upload.kind, text: caption, mediaId, mediaFilename: upload.filename, mediaMimeType: upload.mime, status: outcome.status, metaMessageId: outcome.metaMessageId || undefined, uncertain: Boolean(outcome.uncertain), error: outcome.error || "", sentBy: input.actorId, sentAt: new Date() });
    return { body: { ok: outcome.ok, status: outcome.status, error: outcome.error || "", uncertain: Boolean(outcome.uncertain), retryable: !outcome.uncertain, messageId: String(message._id) }, status: outcome.ok ? 200 : 502 };
  });
}
