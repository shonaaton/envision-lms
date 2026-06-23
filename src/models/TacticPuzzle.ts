import { Schema, model, models, type InferSchemaType } from "mongoose";

const TacticPuzzleSchema = new Schema(
  {
    source: { type: String, enum: ["lichess", "manual"], default: "lichess", index: true },
    externalId: { type: String, index: true },
    fen: { type: String, required: true },
    moves: [{ type: String, required: true }],
    rating: { type: Number, default: 1000, index: true },
    ratingDeviation: { type: Number, default: 0 },
    popularity: { type: Number, default: 0 },
    nbPlays: { type: Number, default: 0 },
    themes: [{ type: String, index: true }],
    gameUrl: String,
    openingTags: [{ type: String }],
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

TacticPuzzleSchema.index({ source: 1, externalId: 1 }, { unique: true, sparse: true });
TacticPuzzleSchema.index({ rating: 1, popularity: -1 });

const TacticAttemptSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    puzzle: { type: Schema.Types.ObjectId, ref: "TacticPuzzle", index: true },
    puzzleExternalId: String,
    solved: { type: Boolean, default: false, index: true },
    submittedMoves: [String],
    mistakes: { type: Number, default: 0 },
    hintsUsed: { type: Number, default: 0 },
    timeSeconds: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    themes: [String],
    xp: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type TacticPuzzleDoc = InferSchemaType<typeof TacticPuzzleSchema> & { _id: any };
export type TacticAttemptDoc = InferSchemaType<typeof TacticAttemptSchema> & { _id: any };

export const TacticPuzzle = models.TacticPuzzle || model("TacticPuzzle", TacticPuzzleSchema);
export const TacticAttempt = models.TacticAttempt || model("TacticAttempt", TacticAttemptSchema);
