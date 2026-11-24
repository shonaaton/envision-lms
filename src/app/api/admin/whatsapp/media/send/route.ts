import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { whatsappSession, canAccessWhatsAppPhone } from "@/lib/whatsappAccess";
import { sendWhatsAppAttachment } from "@/lib/whatsappAttachmentSend";

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
  await dbConnect();
  if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
  return sendWhatsAppAttachment({ phoneNumber, caption, bytes, filename: file.name, requestId: form!.get("requestId"), actorId: user.id });
}
