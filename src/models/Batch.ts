import { Schema, model, models, type InferSchemaType } from "mongoose";

const BatchSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    coach: { type: Schema.Types.ObjectId, ref: "User", index: true },
    students: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    studentEnrollments: [
      {
        student: { type: Schema.Types.ObjectId, ref: "User", index: true },
        enrolledAt: { type: Date, default: Date.now, index: true },
      },
    ],
    tags: [{ type: String, index: true }],
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    // Seats in a group batch. Eight is the academy standard, so it is the default
    // rather than a hardcoded constant - one differently sized batch should be a
    // data fix, not a deploy. Individual classes (names prefixed "PIC") ignore it.
    capacity: { type: Number, default: 8, min: 1, max: 100 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

BatchSchema.index({ name: "text", description: "text" });

export type BatchDoc = InferSchemaType<typeof BatchSchema> & { _id: any };
export const Batch = models.Batch || model("Batch", BatchSchema);
