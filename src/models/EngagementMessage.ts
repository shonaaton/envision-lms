import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * The weekly engagement WhatsApp (lib/engagement): a progress digest or a
 * practice nudge, never both. The unique {student, weekKey} index IS the
 * one-message-a-week cap - a send is claimed by inserting this row first, so a
 * second sweep, a restart or a second instance can never send it twice.
 */
const EngagementMessageSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Academy date (YYYY-MM-DD) of the Monday that starts the week. */
    weekKey: { type: String, required: true, index: true },
    kind: { type: String, enum: ["digest", "nudge"], required: true },
    status: { type: String, enum: ["claimed", "sent", "failed", "template_pending"], default: "claimed", index: true },
    templateName: String,
    phone: String,
    bodyParameters: [String],
    attempts: { type: Number, default: 0 },
    error: String,
    metaMessageId: String,
    sentAt: Date,
    /** The numbers the message was built from, kept for the admin view. */
    snapshot: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

EngagementMessageSchema.index({ student: 1, weekKey: 1 }, { unique: true });

/** One row per week the sweep finished, so the hourly job knows the week is done. */
const EngagementWeekRunSchema = new Schema(
  {
    weekKey: { type: String, required: true, unique: true },
    startedAt: { type: Date, required: true },
    finishedAt: Date,
    summary: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export type EngagementMessageDoc = InferSchemaType<typeof EngagementMessageSchema> & { _id: any };
export const EngagementMessage = models.EngagementMessage || model("EngagementMessage", EngagementMessageSchema);
export const EngagementWeekRun = models.EngagementWeekRun || model("EngagementWeekRun", EngagementWeekRunSchema);
