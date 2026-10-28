import { Types } from "mongoose";
import { dbConnect } from "./db";
import { WhatsAppCampaign, WhatsAppCampaignRecipient } from "@/models/WhatsAppWorkspace";
import { WhatsAppConversation } from "@/models/WhatsAppConversation";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { normalizeWhatsAppRecipient, whatsAppPhoneVariants } from "./whatsappAutomation";
import { getApprovedLibraryTemplate, templateContentVersion } from "./whatsappTemplateLibrary";
import { renderTemplateBody, type LibraryTemplate } from "./whatsappTemplateRules";
import { sendLibraryTemplate } from "./whatsappLibrarySend";
import { withWhatsAppSendRequest } from "./whatsappSendRequest";
import { WhatsAppMetaError } from "./whatsappMeta";
import { syncCampaignDelivery } from "./whatsappCampaignDelivery";

// Loaded when first used: the scheduler in instrumentation.ts reaches this file,
// and Next.js compiles that for the Edge runtime too, where a static
// `import "crypto"` fails the dev server and the build (see lib/tempPasswords.ts).
function createHash(algorithm: string) {
  return (eval("require")("crypto") as typeof import("crypto")).createHash(algorithm);
}

export function templateContentKey(template: any) {
  return templateContentVersion(template);
}
const TOKENS = ["name", "parentName", "username", "batchName"];
export function personalizeWhatsAppValue(value: string, contact: Record<string, string>) {
  return value.replace(/\{([a-zA-Z]+)\}/g, (whole, key) => TOKENS.includes(key) ? contact[key] || "" : whole).trim();
}

export async function campaignPreview(input: any, template: LibraryTemplate) {
  const group = String(input.recipientGroup || "manual");
  if (!["manual", "students", "coaches", "users", "batch"].includes(group)) throw new WhatsAppMetaError("Choose a valid audience.", 400);
  const variableInputs = Array.isArray(input.variableInputs) ? input.variableInputs.map((value: unknown) => String(value || "").trim()) : [];
  if (variableInputs.length !== template.variables.length || variableInputs.some((value: string) => !value || value.length > 1024 || /\{(?!name\}|parentName\}|username\}|batchName\})[^}]*\}/.test(value))) throw new WhatsAppMetaError("Fill each template field. Available personalisation fields are {name}, {parentName}, {username} and {batchName}.", 400);
  let users: any[] = [], batchName = "";
  if (group === "batch") {
    if (!Types.ObjectId.isValid(input.batchId || "")) throw new WhatsAppMetaError("Choose a batch.", 400);
    const batch: any = await Batch.findOne({ _id: input.batchId, isActive: { $ne: false } }).select("name students").lean();
    if (!batch) throw new WhatsAppMetaError("Batch not found.", 404);
    batchName = batch.name;
    users = await User.find({ _id: { $in: batch.students }, isActive: { $ne: false } }).select("name parentName username phone countryCode engagementOptOut").lean();
  } else if (group !== "manual") {
    users = await User.find({ role: { $in: group === "students" ? ["student"] : group === "coaches" ? ["instructor"] : ["student", "instructor", "admin", "sub-admin"] }, isActive: { $ne: false }, branch: null }).select("name parentName username phone countryCode engagementOptOut").lean();
  } else {
    const numbers = Array.isArray(input.recipients) ? input.recipients : String(input.recipients || "").split(/[\s,]+/);
    if (numbers.length > 5000) throw new WhatsAppMetaError("Use up to 5000 recipient entries at a time.", 400);
    const normalized = numbers.filter(Boolean).map((phone: unknown) => normalizeWhatsAppRecipient(String(phone)));
    const matches: any[] = await User.find({ phone: { $in: [...new Set(normalized.flatMap(whatsAppPhoneVariants))] }, branch: null }).select("name parentName username phone countryCode engagementOptOut").lean();
    users = normalized.map((phone: string) => {
      const accounts = matches.filter((account) => normalizeWhatsAppRecipient(account.phone, account.countryCode) === phone);
      return { ...(accounts[0] || {}), phone, countryCode: "", engagementOptOut: { optedOut: accounts.some((account) => account.engagementOptOut?.optedOut) } };
    });
  }
  const recipients = new Map<string, { phoneNumber: string; name: string; userId?: unknown; values: string[]; preview: string }>();
  const excluded: { name: string; reason: string }[] = [];
  const optedOut = new Set(users.filter((user) => user.engagementOptOut?.optedOut).map((user) => normalizeWhatsAppRecipient(user.phone, user.countryCode)));
  for (const user of users) {
    const phoneNumber = normalizeWhatsAppRecipient(user.phone, user.countryCode);
    if (!/^\d{7,15}$/.test(phoneNumber)) { excluded.push({ name: user.name || user.phone || "Unknown", reason: "Missing or invalid phone number" }); continue; }
    if (template.category === "MARKETING" && optedOut.has(phoneNumber)) { excluded.push({ name: user.name || phoneNumber, reason: "Opted out of updates" }); continue; }
    const values = variableInputs.map((value: string) => personalizeWhatsAppValue(value, { name: user.name || "", parentName: user.parentName || "", username: user.username || "", batchName }));
    if (values.some((value: string) => !value)) { excluded.push({ name: user.name || phoneNumber, reason: "A personalisation field is missing. Use a fixed value or correct the LMS profile." }); continue; }
    const previous = recipients.get(phoneNumber);
    if (previous) { excluded.push({ name: user.name || phoneNumber, reason: "Duplicate phone number; this contact is already included" }); continue; }
    recipients.set(phoneNumber, { phoneNumber, name: user.name || phoneNumber, userId: user._id, values, preview: [template.header, renderTemplateBody(template.body, values), template.footer].filter(Boolean).join("\n") });
  }
  if (!recipients.size) throw new WhatsAppMetaError("No eligible recipients remain. Check numbers and personalisation values.", 400);
  if (recipients.size > 5000) throw new WhatsAppMetaError("Use a smaller audience of up to 5000 unique numbers.", 400);
  return { recipients: [...recipients.values()], excluded, variableInputs, group };
}

export async function saveCampaignPreview(input: any, actorId: string) {
  if (!Types.ObjectId.isValid(input.templateId || "") || !/^[\w-]{16,100}$/.test(input.requestId || "")) throw new WhatsAppMetaError("Choose an approved template and provide a request ID.", 400);
  const name = String(input.name || "").trim();
  if (!name || name.length > 100) throw new WhatsAppMetaError("Give the broadcast a name of up to 100 characters.", 400);
  const template = await getApprovedLibraryTemplate(input.templateId);
  const snapshot = await campaignPreview(input, template);
  const fingerprint = createHash("sha256").update(JSON.stringify({ name, template: templateContentKey(template), recipients: snapshot.recipients })).digest("hex");
  await Promise.all([WhatsAppCampaign.init(), WhatsAppCampaignRecipient.init()]);
  let campaign: any;
  try { campaign = await WhatsAppCampaign.create({ name, templateId: template.id, templateSnapshot: template, recipientGroup: snapshot.group, variableInputs: snapshot.variableInputs, createdBy: actorId, requestId: input.requestId, fingerprint, recipientCount: snapshot.recipients.length }); }
  catch (error: any) {
    if (error.code !== 11000) throw error;
    campaign = await WhatsAppCampaign.findOne({ createdBy: actorId, requestId: input.requestId }).lean();
    if (campaign?.fingerprint !== fingerprint) throw new WhatsAppMetaError("This preview request was already used with another audience. Create a new preview.", 409);
  }
  if (campaign.status === "draft") {
    await WhatsAppCampaignRecipient.bulkWrite(snapshot.recipients.map((recipient) => ({ updateOne: { filter: { campaignId: campaign._id, phoneNumber: recipient.phoneNumber }, update: { $setOnInsert: { campaignId: campaign._id, ...recipient } }, upsert: true } })));
    await WhatsAppCampaign.updateOne({ _id: campaign._id, status: "draft" }, { $set: { previewReady: true } });
  }
  return { campaignId: String(campaign._id), revision: campaign.revision, recipientCount: snapshot.recipients.length, recipients: snapshot.recipients.slice(0, 100), excluded: snapshot.excluded, template };
}

export async function resumeWhatsAppCampaignRetry(campaignId: unknown) {
  if (!(await WhatsAppCampaign.exists({ _id: campaignId, status: "retrying" }))) return 0;
  const retried = await WhatsAppCampaignRecipient.updateMany({ campaignId, state: "failed" }, { $set: { state: "pending", error: "", claimedAt: null }, $inc: { attempt: 1 }, $unset: { messageId: 1, metaMessageId: 1 } });
  await WhatsAppCampaign.updateOne({ _id: campaignId, status: "retrying" }, { $set: { status: "scheduled", scheduledAt: new Date(), previewReady: true, lastError: "" } });
  return retried.modifiedCount;
}

export async function processWhatsAppCampaigns(authorize?: (actor: any) => Promise<boolean>) {
  await dbConnect();
  const retrying: any[] = await WhatsAppCampaign.find({ status: "retrying" }).select("_id").limit(5).lean();
  for (const campaign of retrying) await resumeWhatsAppCampaignRetry(campaign._id);
  const due: any[] = await WhatsAppCampaign.find({ status: { $in: ["scheduled", "running"] }, scheduledAt: { $lte: new Date() }, previewReady: true }).sort({ scheduledAt: 1 }).limit(5).lean();
  let processed = 0;
  for (const campaign of due) {
    const actor: any = await User.findById(campaign.createdBy).select("role isActive isPaused branch").lean();
    if (!actor || actor.isActive === false || actor.isPaused === true || actor.branch || !["admin", "sub-admin"].includes(actor.role) || authorize && !(await authorize({ ...actor, id: String(actor._id) }))) {
      await WhatsAppCampaign.updateOne({ _id: campaign._id }, { $set: { status: "cancelled", lastError: "The scheduling staff account no longer has access to send broadcasts." } });
      await WhatsAppCampaignRecipient.updateMany({ campaignId: campaign._id, state: "pending" }, { $set: { state: "cancelled" } }); continue;
    }
    let template: LibraryTemplate;
    try {
      template = await getApprovedLibraryTemplate(String(campaign.templateId));
      if (templateContentKey(template) !== templateContentKey(campaign.templateSnapshot)) throw new WhatsAppMetaError("The template changed after preview. Create a new broadcast preview.", 409);
    } catch (error) {
      await WhatsAppCampaign.updateOne({ _id: campaign._id }, { $set: { lastError: error instanceof Error ? error.message : "Could not check template approval." } });
      continue; // A sync outage must never be mistaken for confirmed send failures.
    }
    const armed = await WhatsAppCampaign.updateOne({ _id: campaign._id, status: { $in: ["scheduled", "running"] } }, { $set: { status: "running", lastError: "" } });
    if (!armed.matchedCount) continue;
    for (let index = 0; index < 25 && processed < 50; index++) {
      if (!(await WhatsAppCampaign.exists({ _id: campaign._id, status: "running" }))) break;
      const recipient: any = await WhatsAppCampaignRecipient.findOneAndUpdate({ campaignId: campaign._id, $or: [{ state: "pending" }, { state: "processing", claimedAt: { $lt: new Date(Date.now() - 10 * 60_000) } }] }, { $set: { state: "processing", claimedAt: new Date() } }, { sort: { _id: 1 }, new: true }).lean();
      if (!recipient) break;
      if (template.category === "MARKETING" && await User.exists({ phone: { $in: whatsAppPhoneVariants(recipient.phoneNumber) }, branch: null, "engagementOptOut.optedOut": true })) {
        await WhatsAppCampaignRecipient.updateOne({ _id: recipient._id, attempt: recipient.attempt }, { $set: { state: "cancelled", error: "Contact opted out of updates after this preview was saved." } });
        processed++; continue;
      }
      const response = await withWhatsAppSendRequest({ key: `${recipient._id}-${recipient.attempt || 0}`, actorId: String(campaign.createdBy), kind: "campaign", payload: { campaignId: String(campaign._id), phoneNumber: recipient.phoneNumber, values: recipient.values, templateId: template.id } }, async () => {
        const result = await sendLibraryTemplate({ template, phoneNumber: recipient.phoneNumber, values: recipient.values, actorId: String(campaign.createdBy), campaignRecipient: recipient._id });
        return { body: result, status: result.ok ? 200 : 502 };
      });
      const result = await response.json();
      await WhatsAppCampaignRecipient.updateOne({ _id: recipient._id, attempt: recipient.attempt }, { $set: { state: result.ok ? result.status || "accepted" : result.uncertain || result.retryable === false ? "unconfirmed" : "failed", error: result.error || "", ...(result.messageId ? { messageId: result.messageId } : {}), ...(result.metaMessageId ? { metaMessageId: result.metaMessageId } : {}) } });
      if (result.metaMessageId) await syncCampaignDelivery(result.metaMessageId);
      processed++;
    }
    if (!(await WhatsAppCampaignRecipient.exists({ campaignId: campaign._id, state: { $in: ["pending", "processing"] } }))) await WhatsAppCampaign.updateOne({ _id: campaign._id, status: "running" }, { $set: { status: "completed", completedAt: new Date() } });
  }
  return { processed };
}

export async function processWhatsAppFollowUps() {
  await dbConnect();
  const due: any[] = await WhatsAppConversation.find({ followUpAt: { $lte: new Date(), $ne: null }, followUpNotifiedAt: null }).limit(100).lean();
  for (const conversation of due) {
    if (!conversation.followUpBy) continue;
    const id = new Types.ObjectId(createHash("sha256").update(`wa-followup:${conversation.phoneNumber}:${new Date(conversation.followUpAt).toISOString()}:${conversation.followUpBy}`).digest("hex").slice(0, 24));
    await Notification.updateOne({ _id: id }, { $setOnInsert: { user: conversation.followUpBy, type: "whatsapp_follow_up", title: "WhatsApp follow-up due", message: conversation.followUpNote || `Follow up with ${conversation.displayName || conversation.contactName || "+" + conversation.phoneNumber}.`, metadata: { href: `/admin/whatsapp/${conversation.phoneNumber}`, phoneNumber: conversation.phoneNumber } } }, { upsert: true });
    await WhatsAppConversation.updateOne({ _id: conversation._id, followUpAt: conversation.followUpAt, followUpBy: conversation.followUpBy }, { $set: { followUpNotifiedAt: new Date() } });
  }
  return { notified: due.length };
}
