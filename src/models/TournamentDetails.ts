import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * Retention > Tournament details. Each month the retention team (Muktara)
 * sends every student's family the chess tournaments near where they live.
 * One `TournamentDetailsSend` row per student per academy month says it went
 * out; a `TournamentDetailsRequest` asks Saptarshi for the tournaments of a
 * place nobody has details for yet. Rules: lib/retention/tournamentDetailsRules.ts.
 */
const TournamentDetailsSendSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Academy (IST) month, "YYYY-MM".
    monthKey: { type: String, required: true },
    sentAt: { type: Date, required: true },
    sentBy: { type: Schema.Types.ObjectId, ref: "User" },
    sentByName: String,
    // Which tournaments were sent, in the sender's words.
    note: { type: String, default: "" },
    // Where the family was on file when it went out.
    city: String,
    state: String,
    country: String,
  },
  { timestamps: true }
);
TournamentDetailsSendSchema.index({ student: 1, monthKey: 1 }, { unique: true });
TournamentDetailsSendSchema.index({ monthKey: 1 });

export const TOURNAMENT_REQUEST_STATUSES = ["open", "answered", "cancelled"] as const;

const TournamentDetailsRequestSchema = new Schema(
  {
    monthKey: { type: String, required: true, index: true },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    note: { type: String, default: "" },
    students: [{ type: Schema.Types.ObjectId, ref: "User" }],
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    requestedByName: String,
    status: { type: String, enum: TOURNAMENT_REQUEST_STATUSES, default: "open", index: true },
    reply: { type: String, default: "" },
    answeredAt: Date,
    answeredBy: { type: Schema.Types.ObjectId, ref: "User" },
    answeredByName: String,
  },
  { timestamps: true }
);

export type TournamentDetailsSendDoc = InferSchemaType<typeof TournamentDetailsSendSchema>;
export type TournamentDetailsRequestDoc = InferSchemaType<typeof TournamentDetailsRequestSchema>;

export const TournamentDetailsSend = models.TournamentDetailsSend || model("TournamentDetailsSend", TournamentDetailsSendSchema);
export const TournamentDetailsRequest = models.TournamentDetailsRequest || model("TournamentDetailsRequest", TournamentDetailsRequestSchema);
