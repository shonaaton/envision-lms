import { Schema, model, models, type InferSchemaType } from "mongoose";

const AchievementSchema = new Schema(
  {
    studentName: { type: String, required: true, index: true },
    studentPhotoUrl: String,
    achievementImageUrl: { type: String, required: true },
    tournamentName: { type: String, required: true, index: true },
    result: { type: String, required: true, index: true },
    category: { type: String, default: "Tournament", index: true },
    tournamentLocation: { type: String, default: "Not specified", index: true },
    year: { type: String, default: "Not specified", index: true },
    achievementLevel: {
      type: String,
      enum: ["District", "State", "National", "International", "Rating", "Other"],
      default: "Other",
      index: true,
    },
    shortDescription: { type: String, default: "" },
    isFeatured: { type: Boolean, default: false, index: true },
    displayOrder: { type: Number, default: 0, index: true },
    isPublished: { type: Boolean, default: true, index: true },
    sourceImageName: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

AchievementSchema.index({
  studentName: "text",
  tournamentName: "text",
  result: "text",
  category: "text",
  tournamentLocation: "text",
  shortDescription: "text",
});

export type AchievementDoc = InferSchemaType<typeof AchievementSchema> & { _id: any };
export const Achievement = models.Achievement || model("Achievement", AchievementSchema);
