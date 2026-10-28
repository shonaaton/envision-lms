import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { whatsappSession } from "@/lib/whatsappAccess";
import { WhatsAppTemplate } from "@/models/WhatsAppTemplate";
import { serializeLibraryTemplate, templateAccountFilter } from "@/lib/whatsappTemplateLibrary";
import { templateComponents, validateTemplateDraft } from "@/lib/whatsappTemplateRules";
import { whatsappGraph, whatsappMetaConfig, WhatsAppMetaError } from "@/lib/whatsappMeta";

export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await whatsappSession("manage");
  if (!user || user.role === "instructor") return NextResponse.json({ error: "You need WhatsApp management access." }, { status: 403 });
  if (!Types.ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
  const config = whatsappMetaConfig();
  if (!config.businessAccountId || !config.accessToken) return NextResponse.json({ error: "Connect the WhatsApp business account and Meta access token before submitting templates." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  await dbConnect();
  const existing: any = await WhatsAppTemplate.findOne({ _id: params.id, ...templateAccountFilter() }).lean();
  if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const validated = validateTemplateDraft(existing);
  if (!validated.draft) return NextResponse.json({ error: validated.error }, { status: 400 });
  let reserved: any;
  try {
    reserved = await WhatsAppTemplate.findOneAndUpdate({ _id: params.id, revision: Number(body.revision), status: { $in: ["DRAFT", "SUBMISSION_FAILED"] } }, { $set: { status: "SUBMITTING", businessAccountId: config.businessAccountId, submissionError: "", updatedBy: user.id, submittedAt: new Date() }, $inc: { revision: 1 } }, { new: true }).lean();
  } catch (error: any) {
    if (error.code === 11000) return NextResponse.json({ error: "This template name and language already exist on the connected account. Refresh Meta status." }, { status: 409 });
    throw error;
  }
  if (!reserved) return NextResponse.json({ error: "This draft changed or is already being submitted. Refresh its status before trying again." }, { status: 409 });
  try {
    const draft = validated.draft;
    const payload = await whatsappGraph(`${config.businessAccountId}/message_templates`, { method: "POST", body: JSON.stringify({ name: draft.name, language: draft.language, category: draft.category, components: templateComponents(draft) }) });
    if (!payload.id) throw new WhatsAppMetaError("Meta did not confirm the template ID. Refresh Meta status before submitting again.", 502, true);
    const record = await WhatsAppTemplate.findOneAndUpdate({ _id: reserved._id, status: "SUBMITTING" }, { $set: { metaId: String(payload.id), status: String(payload.status || "PENDING").toUpperCase(), category: payload.category || draft.category, statusObservedAt: new Date(), lastSyncedAt: new Date() } }, { new: true }).lean();
    return NextResponse.json({ ok: true, template: serializeLibraryTemplate(record), message: "Submitted to Meta. Approval status will update after review." });
  } catch (error) {
    const uncertain = !(error instanceof WhatsAppMetaError) || error.uncertain;
    const message = error instanceof Error ? error.message : "Could not submit this template.";
    await WhatsAppTemplate.updateOne({ _id: reserved._id, status: "SUBMITTING" }, { $set: { status: uncertain ? "SUBMISSION_UNKNOWN" : "SUBMISSION_FAILED", submissionError: message } });
    return NextResponse.json({ error: message, uncertain }, { status: error instanceof WhatsAppMetaError ? error.status : 502 });
  }
}
