import { Schema, model, models, type InferSchemaType } from "mongoose";

const SlotSchema = new Schema(
  {
    startTime: { type: String, required: true }, // "17:00"
    durationMinutes: { type: Number, default: 60 },
  },
  { _id: false }
);

const DayScheduleSchema = new Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0=Sun
    slots: [SlotSchema],
  },
  { _id: false }
);

const ClassroomSchema = new Schema(
  {
    title: { type: String, required: true, index: true },
    description: { type: String },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    meetingProvider: {
      type: String,
      enum: ["chessplay", "lichess", "zoom", "meet", "other"],
      default: "chessplay",
    },
    meetingUrl: { type: String },

    // Series
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    instructor: { type: Schema.Types.ObjectId, ref: "User", index: true }, // legacy alias
    students: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    batches: [{ type: Schema.Types.ObjectId, ref: "Batch", index: true }],

    // Schedule
    startDate: Date,
    endDate: Date,
    frequency: { type: String, enum: ["weekly", "biweekly", "custom"], default: "weekly" },
    repeatEvery: { type: Number, default: 1 },
    daysOfWeek: [DayScheduleSchema],
    endCondition: { type: String, enum: ["on_date", "after_n_sessions", "never"], default: "on_date" },
    endAfterSessions: { type: Number },

    feePerMonth: { type: Number, default: 0 }, // paise
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export type ClassroomDoc = InferSchemaType<typeof ClassroomSchema> & { _id: any };
export const Classroom = models.Classroom || model("Classroom", ClassroomSchema);
