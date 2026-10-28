import { WhatsAppMessage } from "@/models/WhatsApp";
import { WhatsAppConversation, WhatsAppInboxSync } from "@/models/WhatsAppConversation";

const inbound = { $and: [{ $eq: ["$direction", "inbound"] }, { $ne: ["$messageType", "reaction"] }] };
const outbound = { $and: [{ $eq: ["$direction", "outbound"] }, { $in: ["$status", ["accepted", "sent", "delivered", "read"]] }] };

/** Backfill once, then rebuild only phones changed since the previous poll.
 * This covers every producer (Meta, n8n, reminders and manual sends), including
 * existing history, without depending on a particular webhook entry point.
 */
export async function syncWhatsAppConversations() {
  await WhatsAppConversation.init();
  const startedAt = new Date();
  const checkpoint: any = await WhatsAppInboxSync.findById("inbox-v1").lean();
  // Overlap catches writes committing at the previous checkpoint boundary.
  const changed = checkpoint?.through
    ? { updatedAt: { $gte: new Date(new Date(checkpoint.through).getTime() - 10_000) } }
    : {};
  const phones = await WhatsAppMessage.distinct("phoneNumber", changed);
  if (phones.length) {
    const summaryFields = ["contactName", "profileName", "matchedUser", "latest", "lastMessageAt", "lastInboundAt", "lastInboundCreatedAt", "lastInboundId", "lastBusinessMessageAt", "inboundCount", "sentTemplateCount", "syncedAt"];
    await WhatsAppMessage.aggregate([
      { $match: { phoneNumber: { $in: phones } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: {
        _id: "$phoneNumber",
        contactName: { $max: "$contactName" },
        profileName: { $max: "$profileName" },
        matchedUser: { $max: "$matchedUser" },
        latest: { $first: { text: "$text", messageType: "$messageType", templateName: "$templateName", direction: "$direction", createdAt: "$createdAt", sentAt: "$sentAt", receivedAt: "$receivedAt", mediaId: "$mediaId", mediaMimeType: "$mediaMimeType", mediaFilename: "$mediaFilename", reactionEmoji: "$reactionEmoji", reactionTargetMessageId: "$reactionTargetMessageId", rawPayload: { templateVariables: "$rawPayload.templateVariables", bodyParameters: "$rawPayload.bodyParameters" } } },
        lastMessageAt: { $max: "$createdAt" },
        lastInboundAt: { $max: { $cond: [{ $eq: ["$direction", "inbound"] }, { $ifNull: ["$receivedAt", "$createdAt"] }, null] } },
        lastInboundCreatedAt: { $max: { $cond: [inbound, "$createdAt", null] } },
        lastInboundId: { $max: { $cond: [inbound, "$_id", null] } },
        lastBusinessMessageAt: { $max: { $cond: [outbound, "$createdAt", null] } },
        inboundCount: { $sum: { $cond: [inbound, 1, 0] } },
        sentTemplateCount: { $sum: { $cond: [{ $and: [{ $eq: ["$direction", "outbound"] }, { $eq: ["$messageType", "template"] }] }, 1, 0] } },
      } },
      { $set: { phoneNumber: "$_id", syncedAt: startedAt } },
      { $unset: "_id" },
      { $merge: {
        into: WhatsAppConversation.collection.name,
        on: "phoneNumber",
        // A slower, earlier refresh cannot overwrite a newer snapshot. Staff
        // resolution fields are deliberately preserved by this merge.
        whenMatched: [{ $set: Object.fromEntries(summaryFields.map((field) => [field, {
          $cond: [{ $gte: ["$$new.syncedAt", { $ifNull: ["$syncedAt", new Date(0)] }] }, `$$new.${field}`, `$${field}`],
        }])) }],
        whenNotMatched: "insert",
      } },
    ]).allowDiskUse(true);
  }
  await WhatsAppInboxSync.updateOne({ _id: "inbox-v1" }, { $max: { through: startedAt } }, { upsert: true });
}

export function isWhatsAppResolved(conversation: { lastInboundId?: unknown; resolvedThroughInboundId?: unknown; resolvedAt?: unknown }) {
  return Boolean(conversation.resolvedAt && String(conversation.lastInboundId || "") === String(conversation.resolvedThroughInboundId || ""));
}

export function needsWhatsAppReply(conversation: { lastInboundCreatedAt?: string | Date; lastBusinessMessageAt?: string | Date }, resolved: boolean) {
  return !resolved && Boolean(conversation.lastInboundCreatedAt) && new Date(conversation.lastInboundCreatedAt!).getTime() > new Date(conversation.lastBusinessMessageAt || 0).getTime();
}
