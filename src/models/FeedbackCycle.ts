import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One monthly feedback round. Exists so the admins' single "review this
 * month's feedback" task has a record to point at, and so each month's open
 * and due dates are fixed once rather than recomputed.
 */
const FeedbackCycleSchema = new Schema(
  {
    month: { type: String, required: true, unique: true }, // "YYYY-MM"
    opensAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    lastSweepAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type FeedbackCycleDoc = InferSchemaType<typeof FeedbackCycleSchema> & { _id: any };
export const FeedbackCycle = models.FeedbackCycle || model("FeedbackCycle", FeedbackCycleSchema);
