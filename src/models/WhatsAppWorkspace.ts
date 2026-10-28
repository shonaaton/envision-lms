import { Schema, model, models } from "mongoose";

const ReplySchema = new Schema({
  title: { type: String, required: true }, category: { type: String, default: "General" }, body: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
const NoteSchema = new Schema({
  phoneNumber: { type: String, required: true, index: true }, body: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true }, requestId: { type: String, required: true },
}, { timestamps: true });
NoteSchema.index({ author: 1, requestId: 1 }, { unique: true });
NoteSchema.index({ phoneNumber: 1, _id: -1 });

const CampaignSchema = new Schema({
  name: { type: String, required: true }, templateId: { type: Schema.Types.ObjectId, ref: "WhatsAppTemplate", required: true },
  templateSnapshot: Schema.Types.Mixed,
  recipientGroup: String, variableInputs: [String],
  status: { type: String, enum: ["draft", "scheduled", "running", "retrying", "completed", "cancelled"], default: "draft", index: true },
  scheduledAt: { type: Date, index: true }, completedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  revision: { type: Number, default: 1 },
  requestId: { type: String, required: true },
  fingerprint: String,
  recipientCount: Number,
  previewReady: { type: Boolean, default: false },
  lastError: String,
}, { timestamps: true });
CampaignSchema.index({ createdBy: 1, requestId: 1 }, { unique: true });
CampaignSchema.index({ status: 1, scheduledAt: 1 });
const RecipientSchema = new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: "WhatsAppCampaign", required: true, index: true },
  phoneNumber: { type: String, required: true }, name: String, userId: { type: Schema.Types.ObjectId, ref: "User" },
  values: [String], preview: String,
  state: { type: String, enum: ["pending", "processing", "accepted", "queued", "sent", "delivered", "read", "failed", "unconfirmed", "cancelled"], default: "pending", index: true },
  attempt: { type: Number, default: 0 }, claimedAt: Date,
  messageId: { type: Schema.Types.ObjectId, ref: "WhatsAppMessage" }, metaMessageId: String, error: String,
}, { timestamps: true });
RecipientSchema.index({ campaignId: 1, phoneNumber: 1 }, { unique: true });
RecipientSchema.index({ campaignId: 1, state: 1, claimedAt: 1 });

export const WhatsAppSavedReply = models.WhatsAppSavedReply || model("WhatsAppSavedReply", ReplySchema);
export const WhatsAppPrivateNote = models.WhatsAppPrivateNote || model("WhatsAppPrivateNote", NoteSchema);
export const WhatsAppCampaign = models.WhatsAppCampaign || model("WhatsAppCampaign", CampaignSchema);
export const WhatsAppCampaignRecipient = models.WhatsAppCampaignRecipient || model("WhatsAppCampaignRecipient", RecipientSchema);
