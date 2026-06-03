import { Schema, model, models, type InferSchemaType } from "mongoose";

const AttendanceSchema = new Schema(
  {
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", required: true, index: true },
    sessionDate: { type: Date, required: true, index: true },
    records: [
      {
        student: { type: Schema.Types.ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["present", "absent", "late", "excused"], default: "absent" },
        note: String,
      },
    ],
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
AttendanceSchema.index({ classroom: 1, sessionDate: 1 }, { unique: true });

export type AttendanceDoc = InferSchemaType<typeof AttendanceSchema> & { _id: any };
export const Attendance = models.Attendance || model("Attendance", AttendanceSchema);
