import { Schema, model, models } from "mongoose";

const PGNSchema = new Schema(
  {
    title: { type: String, required: true },
    white: String,
    black: String,
    event: String,
    site: String,
    round: String,
    result: String, // "1-0" | "0-1" | "1/2-1/2" | "*"
    eco: String,
    opening: { type: String, index: true },
    date: String,
    whiteElo: Number,
    blackElo: Number,
    moveCount: { type: Number, default: 0, index: true },
    initialFen: String,
    finalFen: String,
    sideToMove: { type: String, enum: ["white", "black"], index: true },
    hasAnnotations: { type: Boolean, default: false, index: true },
    hasVariations: { type: Boolean, default: false, index: true },
    commentsText: String,
    sourceFileName: String,
    description: String,
    pgn: { type: String, required: true },
    folder: { type: String, index: true },
    tags: [String],
    viewedCount: { type: Number, default: 0, index: true },
    lastOpenedAt: { type: Date, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    visibility: { type: String, enum: ["private", "shared", "classroom"], default: "private", index: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", index: true },
  },
  { timestamps: true }
);
PGNSchema.index({ title: "text", white: "text", black: "text", event: "text", opening: "text", eco: "text", tags: "text", commentsText: "text" });
PGNSchema.index({ uploadedBy: 1, createdAt: -1 });
PGNSchema.index({ visibility: 1, createdAt: -1 });

export const PGN = models.PGN || model("PGN", PGNSchema);
