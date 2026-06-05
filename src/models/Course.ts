import { Schema, model, models, type InferSchemaType } from "mongoose";

const CourseTopicSchema = new Schema(
  {
    name: { type: String, required: true },
    sessionCount: { type: Number, default: 1, min: 1 },
    description: String,
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const CourseLevelSchema = new Schema(
  {
    name: { type: String, required: true },
    sessionCount: { type: Number, default: 1, min: 1 },
    description: String,
    order: { type: Number, default: 0 },
    topics: [CourseTopicSchema],
  },
  { _id: true }
);

const CourseSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    description: String,
    category: { type: String, default: "General", index: true },
    level: { type: String, enum: ["beginner", "intermediate", "advanced", "mixed"], default: "beginner", index: true },
    totalSessions: { type: Number, default: 0 },
    levels: [CourseLevelSchema],
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

CourseSchema.index({ name: "text", description: "text", category: "text", "levels.name": "text", "levels.topics.name": "text" });

export type CourseDoc = InferSchemaType<typeof CourseSchema> & { _id: any };
export const Course = models.Course || model("Course", CourseSchema);
