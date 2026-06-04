import { Schema, model, models, type InferSchemaType } from "mongoose";

const AskCoachConversationSchema = new Schema(
  {
    type: { type: String, enum: ["direct", "batch"], required: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    student: { type: Schema.Types.ObjectId, ref: "User", index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    batch: { type: Schema.Types.ObjectId, ref: "Batch", index: true },
    title: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: "" },
  },
  { timestamps: true }
);

AskCoachConversationSchema.index({ type: 1, student: 1, coach: 1 }, { sparse: true });
AskCoachConversationSchema.index({ type: 1, batch: 1 }, { sparse: true });

const AskCoachMessageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: "AskCoachConversation", required: true, index: true },
    type: { type: String, enum: ["direct", "batch"], required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", index: true },
    batch: { type: Schema.Types.ObjectId, ref: "Batch", index: true },
    body: { type: String, required: true },
    readBy: [{ user: { type: Schema.Types.ObjectId, ref: "User" }, readAt: Date }],
    flagged: { type: Boolean, default: false, index: true },
    flagReasons: [String],
    status: { type: String, enum: ["sent", "flagged", "hidden", "deleted"], default: "sent", index: true },
    moderationStatus: { type: String, enum: ["none", "pending", "approved", "hidden", "deleted", "reviewed"], default: "none", index: true },
    moderationHistory: [
      {
        action: String,
        by: { type: Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

AskCoachMessageSchema.index({ body: "text" });

export type AskCoachConversationDoc = InferSchemaType<typeof AskCoachConversationSchema> & { _id: any };
export type AskCoachMessageDoc = InferSchemaType<typeof AskCoachMessageSchema> & { _id: any };

export const AskCoachConversation =
  models.AskCoachConversation || model("AskCoachConversation", AskCoachConversationSchema);
export const AskCoachMessage = models.AskCoachMessage || model("AskCoachMessage", AskCoachMessageSchema);
