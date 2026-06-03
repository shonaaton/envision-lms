import { Schema, model, models, type InferSchemaType } from "mongoose";

const ClassroomSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    instructor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    students: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    schedule: [
      {
        dayOfWeek: { type: Number, min: 0, max: 6 }, // 0=Sun
        startTime: String, // "18:00"
        endTime: String,   // "19:00"
        meetingUrl: String, // zoom / lichess study URL
      },
    ],
    feePerMonth: { type: Number, default: 0 }, // in paise
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type ClassroomDoc = InferSchemaType<typeof ClassroomSchema> & { _id: any };
export const Classroom = models.Classroom || model("Classroom", ClassroomSchema);
