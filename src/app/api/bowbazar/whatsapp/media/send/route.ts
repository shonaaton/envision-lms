import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { storedFamilyNumber } from "@/lib/branch/whatsapp";
import { sendWhatsAppAttachment } from "@/lib/whatsappAttachmentSend";

export const dynamic = "force-dynamic";

/** Sends an image or document to a Bowbazar family inside the 24-hour window (same rules as the online inbox). */
export async function POST(req: Request) {
  const access = await requireBranchAccess("whatsapp");
  if (!access) return forbidden();
  if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024) return NextResponse.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file"), phone = String(form?.get("phoneNumber") || ""), caption = String(form?.get("caption") || "").trim();
  if (!file || typeof file === "string" || !phone || caption.length > 1024) return NextResponse.json({ error: "Choose a file. Captions can contain up to 1024 characters." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Files must be 10 MB or smaller." }, { status: 413 });
  try {
    const phoneNumber = await storedFamilyNumber(access.branch, phone);
    return await sendWhatsAppAttachment({ phoneNumber, caption, bytes: Buffer.from(await file.arrayBuffer()), filename: file.name, requestId: form!.get("requestId"), actorId: access.actorId });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
