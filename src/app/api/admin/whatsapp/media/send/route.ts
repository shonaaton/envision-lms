import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { whatsappSession, canAccessWhatsAppPhone } from "@/lib/whatsappAccess";
import { validateWhatsAppUpload } from "@/lib/whatsappMediaRules";
import { whatsappGraph, whatsappMetaConfig, sendGraphMessage, WhatsAppMetaError } from "@/lib/whatsappMeta";
import { withWhatsAppSendRequest } from "@/lib/whatsappSendRequest";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { findWhatsAppUserByPhone } from "@/lib/whatsappAutomation";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await whatsappSession("create"); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 11 * 1024 * 1024) return NextResponse.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file"), phoneNumber = String(form?.get("phoneNumber") || ""), caption = String(form?.get("caption") || "").trim();
  if (!file || typeof file === "string" || !/^\d{7,15}$/.test(phoneNumber) || caption.length > 1024) return NextResponse.json({ error: "Choose a contact and file. Captions can contain up to 1024 characters." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = validateWhatsAppUpload(file.name, bytes);
  if (upload.error) return NextResponse.json({ error: upload.error }, { status: 400 });
  await dbConnect();
  if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
  return withWhatsAppSendRequest({ key: form!.get("requestId"), actorId: user.id, kind: "media", payload: { phoneNumber, caption, filename: upload.filename, hash: upload.hash } }, async () => {
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
    const message = await WhatsAppMessage.create({ phoneNumber, matchedUser: contact?._id, contactName: contact?.name || "", direction: "outbound", messageType: upload.kind, text: caption, mediaId, mediaFilename: upload.filename, mediaMimeType: upload.mime, status: outcome.status, metaMessageId: outcome.metaMessageId || undefined, uncertain: Boolean(outcome.uncertain), error: outcome.error || "", sentBy: user.id, sentAt: new Date() });
    return { body: { ok: outcome.ok, status: outcome.status, error: outcome.error || "", uncertain: Boolean(outcome.uncertain), retryable: !outcome.uncertain, messageId: String(message._id) }, status: outcome.ok ? 200 : 502 };
  });
}
