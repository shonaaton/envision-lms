import { Schema, model, models } from "mongoose";

// Inbox metadata is independent of the size of a message-history page.
const ConversationSchema = new Schema({
  phoneNumber: { type: String, required: true, unique: true },
  contactName: String,
  profileName: String,
  matchedUser: { type: Schema.Types.ObjectId, ref: "User" },
  linkedManually: { type: Boolean, default: false },
  linkedUser: { type: Schema.Types.ObjectId, ref: "User" },
  displayName: String,
  assignedTo: { type: Schema.Types.ObjectId, ref: "User", index: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: "User" },
  assignedAt: Date,
  followUpAt: { type: Date, index: true },
  followUpBy: { type: Schema.Types.ObjectId, ref: "User" },
  followUpNote: String,
  followUpNotifiedAt: Date,
  latest: Schema.Types.Mixed,
  lastMessageAt: Date,
  lastInboundAt: Date,
  lastInboundCreatedAt: Date,
  lastInboundId: Schema.Types.ObjectId,
  lastBusinessMessageAt: Date,
  inboundCount: { type: Number, default: 0 },
  sentTemplateCount: { type: Number, default: 0 },
  resolvedThroughInboundId: Schema.Types.ObjectId,
  resolvedAt: Date,
  syncedAt: Date,
});
ConversationSchema.index({ lastMessageAt: -1 });

const ReadStateSchema = new Schema({
  actorId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  readInboundCount: { type: Number, default: 0 },
  readThroughInboundId: Schema.Types.ObjectId,
}, { timestamps: true });
ReadStateSchema.index({ actorId: 1, phoneNumber: 1 }, { unique: true });

const SyncSchema = new Schema({ _id: String, through: Date });

export const WhatsAppConversation = models.WhatsAppConversation || model("WhatsAppConversation", ConversationSchema);
export const WhatsAppReadState = models.WhatsAppReadState || model("WhatsAppReadState", ReadStateSchema);
export const WhatsAppInboxSync = models.WhatsAppInboxSync || model("WhatsAppInboxSync", SyncSchema);
