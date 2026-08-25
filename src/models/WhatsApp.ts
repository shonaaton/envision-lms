import { Schema, model, models, type InferSchemaType } from "mongoose";

const WhatsAppMessageSchema = new Schema(
  {
    phoneNumber: { type: String, required: true, index: true },
    waId: { type: String, index: true },
    contactName: { type: String, default: "" },
    profileName: { type: String, default: "" },
    matchedUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true, index: true },
    messageType: { type: String, default: "text", index: true },
    text: { type: String, default: "" },
    templateName: { type: String, default: "", index: true },
    templateLanguage: { type: String, default: "" },
    status: {
      type: String,
      enum: ["received", "queued", "accepted", "sent", "delivered", "read", "failed"],
      default: "received",
      index: true,
    },
    metaMessageId: { type: String, unique: true, sparse: true, index: true },
    error: { type: String, default: "" },
    rawPayload: { type: Schema.Types.Mixed },
    sentAt: { type: Date },
    receivedAt: { type: Date },
  },
  { timestamps: true }
);

WhatsAppMessageSchema.index({ phoneNumber: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ direction: 1, templateName: 1, createdAt: -1 });

export type WhatsAppMessageDoc = InferSchemaType<typeof WhatsAppMessageSchema> & { _id: any };
export const WhatsAppMessage = models.WhatsAppMessage || model("WhatsAppMessage", WhatsAppMessageSchema);
