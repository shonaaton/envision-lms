import { Schema, model, models } from "mongoose";

const PGNSchema = new Schema(
  {
    title: { type: String, required: true },
    white: String,
    black: String,
    event: String,
    result: String, // "1-0" | "0-1" | "1/2-1/2" | "*"
    eco: String,
    date: String,
    pgn: { type: String, required: true },
    folder: { type: String, index: true },
    tags: [String],
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    visibility: { type: String, enum: ["private", "shared", "classroom"], default: "private", index: true },
    classroom: { type: Schema.Types.ObjectId, ref: "Classroom", index: true },
  },
  { timestamps: true }
);
PGNSchema.index({ title: "text", white: "text", black: "text", event: "text" });

export const PGN = models.PGN || model("PGN", PGNSchema);
