import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Where a send to everyone has got to. Recipients are walked in `_id` order and
 * `cursor` is the last one finished, so a restart picks up where it stopped
 * instead of messaging the first few hundred families a second time.
 */
const DeliverySchema = new Schema(
  {
    status: { type: String, enum: ["none", "pending", "sending", "sent"], default: "none", index: true },
    claimedAt: Date,
    cursor: { type: Schema.Types.ObjectId },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    finishedAt: Date,
    announcement: { type: Schema.Types.ObjectId, ref: "Announcement" },
  },
  { _id: false }
);

/** Enough to put a class back exactly where it was if the holiday is called off. */
const HolidayMoveSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    sessionId: { type: String, required: true },
    topicName: String,
    fromScheduledFor: { type: Date, required: true },
    fromStartTime: String,
    fromDurationMinutes: Number,
    fromSubstituteCoach: { type: Schema.Types.ObjectId, ref: "User" },
    hadOriginalDate: { type: Boolean, default: false },
    toScheduledFor: { type: Date, required: true },
    toStartTime: String,
    toDurationMinutes: Number,
  },
  { _id: false }
);

const AcademyHolidaySchema = new Schema(
  {
    // IST calendar days, both inclusive.
    startKey: { type: String, required: true, index: true },
    endKey: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ["active", "cancelled"], default: "active", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancelledAt: Date,
    cancelMessage: String,

    moves: [HolidayMoveSchema],
    classroomEndDates: [
      new Schema(
        {
          classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true },
          from: Date,
          to: Date,
        },
        { _id: false }
      ),
    ],
    classroomCount: { type: Number, default: 0 },
    // Classes in the range that were left alone and need a person: one-off
    // classes, paused classrooms, a series with no usable class time.
    skipped: [{ type: Schema.Types.Mixed }],
    // Moves the cancellation could not undo because the class changed since.
    unrestored: [{ type: Schema.Types.Mixed }],
    restoredCount: { type: Number, default: 0 },

    announcement: { type: DeliverySchema, default: () => ({}) },
    cancelAnnouncement: { type: DeliverySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type AcademyHolidayDoc = InferSchemaType<typeof AcademyHolidaySchema> & { _id: any };
export const AcademyHoliday = models.AcademyHoliday || model("AcademyHoliday", AcademyHolidaySchema);
