import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One stretch of time a student looked likely to leave, from the first day the
 * daily sweep saw it to the day it was settled. A student flagged again later
 * gets a new record, so "how many did we save" can be counted per episode.
 * Rules live in lib/retention/riskRules.ts; the sweep in retentionSweep.ts.
 */
const RetentionFlagSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
    level: { type: String, enum: ["watch", "at_risk", "high"], required: true, index: true },
    // The highest level the flag reached, so a downgrade does not hide how bad it got.
    peakLevel: { type: String, enum: ["watch", "at_risk", "high"] },
    reasons: [
      {
        _id: false,
        code: String,
        severity: String,
        label: String,
        detail: String,
        coachSafe: Boolean,
      },
    ],
    inWindow: { type: Boolean, default: false },
    firstFlaggedAt: { type: Date, required: true },
    lastEvaluatedAt: { type: Date, required: true },
    coachNotifiedAt: Date,
    contactLog: [
      {
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: "User" },
        byName: String,
        channel: { type: String, enum: ["call", "whatsapp", "email", "in_person", "other"], default: "call" },
        note: String,
      },
    ],
    resolution: {
      // stayed / paused / left: a person settled it. recovered: the signs cleared on their own.
      outcome: { type: String, enum: ["stayed", "paused", "left", "recovered", "false_alarm"] },
      note: String,
      by: { type: Schema.Types.ObjectId, ref: "User" },
      byName: String,
      at: Date,
      auto: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// At most one open flag per student; the sweep updates it in place.
RetentionFlagSchema.index({ student: 1 }, { unique: true, partialFilterExpression: { status: "open" }, name: "one_open_flag_per_student" });
RetentionFlagSchema.index({ status: 1, "resolution.at": -1 });

/** One row per academy day the sweep has run, so restarts and repeat sweeps do it once. */
const RetentionSweepRunSchema = new Schema(
  {
    dateKey: { type: String, required: true, unique: true },
    startedAt: { type: Date, required: true },
    finishedAt: Date,
    summary: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export type RetentionFlagDoc = InferSchemaType<typeof RetentionFlagSchema> & { _id: any };
export const RetentionFlag = models.RetentionFlag || model("RetentionFlag", RetentionFlagSchema);
export const RetentionSweepRun = models.RetentionSweepRun || model("RetentionSweepRun", RetentionSweepRunSchema);
