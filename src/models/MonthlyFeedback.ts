import { Schema, model, models, type InferSchemaType } from "mongoose";

export const FEEDBACK_STATUSES = ["pending", "draft", "submitted", "changes_requested", "approved", "sent", "skipped"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * One coach's monthly progress report on one student.
 *
 * Created empty ("pending") by the monthly sweep, filled by the coach, approved
 * by an admin, then emailed to the family ("sent"). Names, course and the
 * month's attendance are snapshotted at creation so the report still reads
 * correctly after a rename, a batch move or a deleted classroom.
 *
 * `internalNote` is for the academy only. It is never serialized to a student
 * and never rendered into the parent email - see `serializeFeedback()`.
 */
const MonthlyFeedbackSchema = new Schema(
  {
    month: { type: String, required: true, index: true }, // "YYYY-MM", academy time
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", index: true },
    cycle: { type: Schema.Types.ObjectId, ref: "FeedbackCycle", index: true },

    tier: { type: String, default: "beginner" },
    questionSetVersion: { type: Number, default: 1 },

    studentName: { type: String, default: "" },
    coachName: { type: String, default: "" },
    courseName: { type: String, default: "" },
    levelName: { type: String, default: "" },

    stats: {
      classesScheduled: { type: Number, default: 0 },
      classesAttended: { type: Number, default: 0 },
      topicsCovered: [{ type: String }],
    },

    // skill key -> 1..5, including "effort"
    ratings: { type: Map, of: Number, default: {} },
    highlights: [{ type: String }],
    focusAreas: [{ type: String }],
    parentNote: { type: String, default: "" },
    internalNote: { type: String, default: "" },

    status: { type: String, enum: FEEDBACK_STATUSES, default: "pending", index: true },
    skipReason: { type: String, default: "" },
    dueAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    emailTo: { type: String, default: "" },
    emailError: { type: String, default: "" },
  },
  { timestamps: true }
);

MonthlyFeedbackSchema.index({ month: 1, student: 1, coach: 1 }, { unique: true });
MonthlyFeedbackSchema.index({ coach: 1, month: 1, status: 1 });
MonthlyFeedbackSchema.index({ student: 1, status: 1, month: -1 });

export type MonthlyFeedbackDoc = InferSchemaType<typeof MonthlyFeedbackSchema> & { _id: any };
export const MonthlyFeedback = models.MonthlyFeedback || model("MonthlyFeedback", MonthlyFeedbackSchema);
