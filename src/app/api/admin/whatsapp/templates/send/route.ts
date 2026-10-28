import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { whatsappSession, canAccessWhatsAppPhone } from "@/lib/whatsappAccess";
import { getApprovedLibraryTemplate } from "@/lib/whatsappTemplateLibrary";
import { sendLibraryTemplate } from "@/lib/whatsappLibrarySend";
import { withWhatsAppSendRequest } from "@/lib/whatsappSendRequest";
import { WhatsAppMetaError } from "@/lib/whatsappMeta";

export async function POST(req: Request) {
  const user = await whatsappSession("create");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const phoneNumber = String(body.phoneNumber || "");
  if (!Types.ObjectId.isValid(body.templateId || "") || !/^\d{7,15}$/.test(phoneNumber) || !Array.isArray(body.values) || !/^[a-f0-9]{64}$/.test(body.contentVersion || "")) return NextResponse.json({ error: "Choose a template, contact and variable values, then review its latest preview." }, { status: 400 });
  await dbConnect();
  if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
  const values = body.values.map((value: unknown) => String(value || "").trim());
  return withWhatsAppSendRequest({ key: body.requestId, actorId: user.id, kind: "template", payload: { templateId: body.templateId, contentVersion: body.contentVersion, phoneNumber, values } }, async () => {
    try {
      const template = await getApprovedLibraryTemplate(body.templateId);
      if (body.contentVersion !== template.contentVersion) throw new WhatsAppMetaError("The template changed since this preview. Reopen the template to review its latest version before sending.", 409);
      const result = await sendLibraryTemplate({ template, phoneNumber, values, actorId: user.id });
      return { body: result, status: result.ok ? 200 : 502 };
    } catch (error) {
      if (!(error instanceof WhatsAppMetaError)) throw error;
      return { body: { ok: false, error: error.message, uncertain: error.uncertain, retryable: !error.uncertain }, status: error.status };
    }
  });
}
