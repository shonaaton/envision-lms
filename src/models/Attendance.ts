import { Schema, model, models, type InferSchemaType } from "mongoose";

const AttendanceSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    scheduledSessionId: { type: String, index: true },
    sessionDate: { type: Date, required: true, index: true },
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    coachStatus: { type: String, enum: ["present", "absent", "late", "rescheduled", "cancelled", "pending"], default: "pending" },
    teachingMinutes: { type: Number, default: 0 },
    records: [
      {
        student: { type: Schema.Types.ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["present", "absent", "late", "excused"], default: "absent" },
        note: String,
      },
    ],
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
AttendanceSchema.index({ classroom: 1, scheduledSessionId: 1, sessionDate: 1 }, { unique: true });

export type AttendanceDoc = InferSchemaType<typeof AttendanceSchema> & { _id: any };
export const Attendance = models.Attendance || model("Attendance", AttendanceSchema);
