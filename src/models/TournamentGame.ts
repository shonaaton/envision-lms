import { Schema, model, models, type InferSchemaType } from "mongoose";

const TournamentGameSchema = new Schema(
  {
    tournament: { type: Schema.Types.ObjectId, ref: "Tournament", required: true, index: true },
    source: { type: String, enum: ["swiss", "arena"], required: true, index: true },
    roundNumber: { type: Number, default: 0, index: true },
    tableNumber: { type: Number, default: 0 },
    whiteUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    blackUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    whiteExternalUsername: String,
    blackExternalUsername: String,
    whiteKey: { type: String, required: true, index: true },
    blackKey: { type: String, default: "", index: true },
    whiteName: { type: String, required: true },
    blackName: { type: String, default: "" },
    fen: { type: String, default: "start" },
    pgn: { type: String, default: "" },
    moveHistorySAN: [{ type: String }],
    moveHistoryUCI: [{ type: String }],
    initialClockMs: { type: Number, required: true },
    incrementMs: { type: Number, default: 0 },
    whiteClockMs: { type: Number, required: true },
    blackClockMs: { type: Number, required: true },
    turn: { type: String, enum: ["w", "b"], default: "w" },
    status: { type: String, enum: ["pending", "active", "completed", "aborted"], default: "active", index: true },
    result: { type: String, enum: ["*", "1-0", "0-1", "1/2-1/2"], default: "*", index: true },
    termination: {
      type: String,
      enum: ["ongoing", "checkmate", "stalemate", "repetition", "fifty_moves", "insufficient_material", "timeout", "resign", "draw_agreement", "bye", "manual"],
      default: "ongoing",
    },
    winnerKey: { type: String, default: "", index: true },
    lastMoveAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
  },
  { timestamps: true }
);

TournamentGameSchema.index({ tournament: 1, status: 1, roundNumber: 1 });

export type TournamentGameDoc = InferSchemaType<typeof TournamentGameSchema> & { _id: any };
export const TournamentGame = models.TournamentGame || model("TournamentGame", TournamentGameSchema);
