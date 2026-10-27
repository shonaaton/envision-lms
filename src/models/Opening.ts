import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * How far a user has got through one chapter of an opening course.
 *
 * Openings themselves are code (lib/openings/content), so they are referred to
 * by slug, not by id. `lastStep` lets the library offer "resume"; `completedAt`
 * is set once, the first time the chapter's last step is reached.
 */
const openingProgressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    opening: { type: String, required: true },
    chapter: { type: String, required: true },
    lastStep: { type: Number, default: 0 },
    completedAt: Date,
  },
  { timestamps: true }
);
openingProgressSchema.index({ user: 1, opening: 1, chapter: 1 }, { unique: true });

export type OpeningProgressDoc = InferSchemaType<typeof openingProgressSchema> & { _id: any };

export const OpeningProgress = models.OpeningProgress || model("OpeningProgress", openingProgressSchema);
