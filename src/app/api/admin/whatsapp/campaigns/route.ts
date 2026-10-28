import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { whatsappSession } from "@/lib/whatsappAccess";
import { WhatsAppCampaign, WhatsAppCampaignRecipient } from "@/models/WhatsAppWorkspace";
import { Batch } from "@/models/Batch";
import { saveCampaignPreview, templateContentKey, resumeWhatsAppCampaignRetry } from "@/lib/whatsappCampaigns";
import { getApprovedLibraryTemplate } from "@/lib/whatsappTemplateLibrary";
import { WhatsAppMetaError } from "@/lib/whatsappMeta";
import { parseAcademyDateTimeLocal } from "@/lib/academyTime";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const user = await whatsappSession("manage"); if (!user || user.role === "instructor") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect(); const params = new URL(req.url).searchParams;
  if (params.get("batches") === "1") { const batches: any[] = await Batch.find({ isActive: { $ne: false } }).select("name").sort({ name: 1 }).lean(); return NextResponse.json({ batches: batches.map((batch) => ({ id: String(batch._id), name: batch.name })) }); }
  const id = params.get("id");
  if (id) {
    if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid broadcast." }, { status: 400 });
    const campaign: any = await WhatsAppCampaign.findById(id).lean(); if (!campaign) return NextResponse.json({ error: "Broadcast not found." }, { status: 404 });
    const page = Math.max(1, Math.min(10000, Math.floor(Number(params.get("page")) || 1)));
    const [recipients, counts]: any[] = await Promise.all([
      WhatsAppCampaignRecipient.find({ campaignId: id }).sort({ _id: 1 }).skip((page - 1) * 100).limit(100).lean(),
      WhatsAppCampaignRecipient.aggregate([{ $match: { campaignId: new Types.ObjectId(id) } }, { $group: { _id: "$state", count: { $sum: 1 } } }]),
    ]);
    return NextResponse.json({ campaign: { ...campaign, id: String(campaign._id) }, recipients: recipients.map((recipient: any) => ({ ...recipient, id: String(recipient._id) })), counts: Object.fromEntries(counts.map((row: any) => [row._id, row.count])), page });
  }
  const before = params.get("before");
  if (before && !Types.ObjectId.isValid(before)) return NextResponse.json({ error: "Invalid broadcast cursor." }, { status: 400 });
  const campaigns: any[] = await WhatsAppCampaign.find(before ? { _id: { $lt: new Types.ObjectId(before) } } : {}).sort({ _id: -1 }).limit(51).lean();
  return NextResponse.json({ campaigns: campaigns.slice(0, 50).map((campaign) => ({ id: String(campaign._id), name: campaign.name, status: campaign.status, scheduledAt: campaign.scheduledAt, recipientCount: campaign.recipientCount, createdAt: campaign.createdAt, lastError: campaign.lastError })), nextCursor: campaigns.length > 50 ? String(campaigns[49]._id) : null });
}
export async function POST(req: Request) {
  const user = await whatsappSession("manage"); if (!user || user.role === "instructor") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({})); await dbConnect();
  try {
    if (body.action === "preview") return NextResponse.json({ ok: true, ...await saveCampaignPreview(body, user.id) });
    if (!Types.ObjectId.isValid(body.campaignId || "")) return NextResponse.json({ error: "Choose a broadcast preview." }, { status: 400 });
    const campaign: any = await WhatsAppCampaign.findById(body.campaignId).lean(); if (!campaign) return NextResponse.json({ error: "Broadcast not found." }, { status: 404 });
    if (body.action === "cancel") {
      await WhatsAppCampaign.updateOne({ _id: campaign._id, status: { $in: ["draft", "scheduled", "running"] } }, { $set: { status: "cancelled" }, $inc: { revision: 1 } });
      await WhatsAppCampaignRecipient.updateMany({ campaignId: campaign._id, state: "pending" }, { $set: { state: "cancelled" } });
      await WhatsAppCampaignRecipient.updateMany({ campaignId: campaign._id, state: "processing" }, { $set: { state: "unconfirmed", error: "Cancellation was requested while this message was processing. Check its delivery result." } });
      return NextResponse.json({ ok: true, message: "Remaining sends cancelled. Messages already processing may still complete." });
    }
    if (!["start", "retry_failed"].includes(body.action)) return NextResponse.json({ error: "Unsupported broadcast action." }, { status: 400 });
    const template = await getApprovedLibraryTemplate(String(campaign.templateId));
    if (templateContentKey(template) !== templateContentKey(campaign.templateSnapshot)) return NextResponse.json({ error: "The template changed after preview. Create a new preview before sending." }, { status: 409 });
    if (body.action === "retry_failed") {
      if (!["completed", "cancelled"].includes(campaign.status)) return NextResponse.json({ error: "Wait for the current broadcast to finish before retrying failed recipients." }, { status: 409 });
      // Acquire a campaign-level lock before resetting rows. A repeated retry
      // click must never reset a newly failed second attempt in a running job.
      if (await WhatsAppCampaignRecipient.exists({ campaignId: campaign._id, state: "processing" })) return NextResponse.json({ error: "A send is still processing. Wait for its result before retrying failures." }, { status: 409 });
      const claimed = await WhatsAppCampaign.updateOne({ _id: campaign._id, revision: Number(body.revision), status: { $in: ["completed", "cancelled"] } }, { $set: { status: "retrying", previewReady: false }, $inc: { revision: 1 } });
      if (!claimed.matchedCount) return NextResponse.json({ error: "Broadcast changed. Refresh its status." }, { status: 409 });
      const retryCount = await resumeWhatsAppCampaignRetry(campaign._id);
      return NextResponse.json({ ok: true, retryCount });
    }
    const scheduledAt = body.scheduledAt ? parseAcademyDateTimeLocal(body.scheduledAt) : new Date();
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) return NextResponse.json({ error: "Choose a future time in IST, or send now." }, { status: 400 });
    if (!campaign.previewReady || await WhatsAppCampaignRecipient.countDocuments({ campaignId: campaign._id }) !== campaign.recipientCount) return NextResponse.json({ error: "Preview is incomplete. Create a new preview." }, { status: 409 });
    const armed = await WhatsAppCampaign.updateOne({ _id: campaign._id, revision: Number(body.revision), status: "draft", previewReady: true }, { $set: { status: "scheduled", scheduledAt }, $inc: { revision: 1 } });
    return NextResponse.json(armed.matchedCount ? { ok: true, scheduledAt, message: "Broadcast scheduled. Progress will update as messages are processed." } : { error: "This preview has already been scheduled or changed. Refresh its status." }, { status: armed.matchedCount ? 200 : 409 });
  } catch (error) {
    if (error instanceof WhatsAppMetaError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
