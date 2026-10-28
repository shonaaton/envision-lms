import { WhatsAppMessage } from "@/models/WhatsApp";
import { WhatsAppCampaignRecipient } from "@/models/WhatsAppWorkspace";

export async function syncCampaignDelivery(metaMessageId: string) {
  const message: any = await WhatsAppMessage.findOne({ metaMessageId, campaignRecipient: { $ne: null } }).select("campaignRecipient status error uncertain").lean();
  if (!message?.campaignRecipient) return;
  // A late receipt for an earlier attempt cannot overwrite a newer retry.
  await WhatsAppCampaignRecipient.updateOne({ _id: message.campaignRecipient, messageId: message._id }, { $set: { state: message.uncertain ? "unconfirmed" : message.status, error: message.error || "" } });
}
