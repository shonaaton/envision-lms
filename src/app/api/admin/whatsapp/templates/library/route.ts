import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { whatsappSession } from "@/lib/whatsappAccess";
import { WhatsAppTemplate } from "@/models/WhatsAppTemplate";
import { serializeLibraryTemplate, syncTemplateLibrary, templateAccount, templateAccountFilter } from "@/lib/whatsappTemplateLibrary";
import { templateComponents, validateTemplateDraft } from "@/lib/whatsappTemplateRules";
import { whatsappMetaConfig } from "@/lib/whatsappMeta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await whatsappSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const params = new URL(req.url).searchParams;
  let syncError = "";
  if (params.get("sync") === "1") {
    try { await syncTemplateLibrary(); } catch (error) { syncError = error instanceof Error ? error.message : "Could not refresh Meta status."; }
  }
  const records: any[] = await WhatsAppTemplate.find(templateAccountFilter()).sort({ updatedAt: -1 }).lean();
  const templates = records.map(serializeLibraryTemplate).filter((template) => params.get("approved") !== "1" && user.role !== "instructor" || template.sendable);
  const config = whatsappMetaConfig();
  return NextResponse.json({ ok: !syncError, templates, syncError, connectionReady: Boolean(config.businessAccountId && config.accessToken), sendingReady: Boolean(config.businessAccountId && config.accessToken && config.phoneNumberId) });
}

export async function POST(req: Request) {
  const user = await whatsappSession("manage");
  if (!user || user.role === "instructor") return NextResponse.json({ error: "You need WhatsApp management access." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const validated = validateTemplateDraft(body);
  if (!validated.draft) return NextResponse.json({ error: validated.error }, { status: 400 });
  await dbConnect();
  await WhatsAppTemplate.init();
  const draft = validated.draft;
  try {
    let record: any;
    if (body.id) {
      if (!Types.ObjectId.isValid(body.id)) return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
      record = await WhatsAppTemplate.findOneAndUpdate({ _id: body.id, ...templateAccountFilter(), status: { $in: ["DRAFT", "SUBMISSION_FAILED"] }, revision: Number(body.revision) }, { $set: { ...draft, components: templateComponents(draft), status: "DRAFT", submissionError: "", updatedBy: user.id }, $inc: { revision: 1 } }, { new: true }).lean();
      if (!record) return NextResponse.json({ error: "This draft changed or has already been submitted. Refresh before editing." }, { status: 409 });
    } else record = await WhatsAppTemplate.create({ ...draft, businessAccountId: templateAccount(), components: templateComponents(draft), createdBy: user.id, updatedBy: user.id });
    return NextResponse.json({ ok: true, template: serializeLibraryTemplate(record) }, { status: body.id ? 200 : 201 });
  } catch (error: any) {
    if (error.code === 11000) return NextResponse.json({ error: "A template with this name and language already exists. Choose another name." }, { status: 409 });
    throw error;
  }
}
