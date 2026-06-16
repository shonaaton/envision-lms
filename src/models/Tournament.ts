import { Schema, model, models, type InferSchemaType } from "mongoose";

const TournamentSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    description: String,
    type: { type: String, enum: ["swiss", "arena"], required: true, index: true },
    status: { type: String, enum: ["draft", "upcoming", "live", "completed", "cancelled"], default: "upcoming", index: true },
    arenaDurationMinutes: Number,
    rounds: Number,
    timeControlMinutes: { type: Number, required: true },
    incrementSeconds: { type: Number, default: 0 },
    breakBetweenRoundsMinutes: { type: Number, default: 0 },
    startAt: { type: Date, required: true, index: true },
    repeat: {
      enabled: { type: Boolean, default: false },
      untilDate: Date,
      selectedDays: [Number],
      repeatCount: Number,
      daily: { type: Boolean, default: false },
    },
    startingPosition: {
      type: { type: String, enum: ["normal", "custom"], default: "normal" },
      fen: String,
    },
    access: {
      allActiveStudents: { type: Boolean, default: false },
      includeCoaches: { type: Boolean, default: false },
      includeInactiveStudents: { type: Boolean, default: false },
      batches: [{ type: Schema.Types.ObjectId, ref: "Batch", index: true }],
      users: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    },
    participants: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    externalInvite: {
      enabled: { type: Boolean, default: false, index: true },
      token: { type: String, index: true },
      password: String,
      createdAt: Date,
    },
    externalParticipants: [{
      username: { type: String, required: true },
      joinedAt: { type: Date, default: Date.now },
    }],
    currentRound: { type: Number, default: 0 },
    startedAt: Date,
    endedAt: Date,
    arenaEndsAt: Date,
    standings: [
      {
        playerKey: { type: String, required: true, index: true },
        user: { type: Schema.Types.ObjectId, ref: "User", index: true },
        externalUsername: String,
        displayName: String,
        points: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        byes: { type: Number, default: 0 },
        gamesPlayed: { type: Number, default: 0 },
        buchholz: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        lastColor: { type: String, enum: ["white", "black", ""], default: "" },
        scoreHistory: [{ type: Number, default: 0 }],
      },
    ],
    roundsData: [
      {
        roundNumber: { type: Number, required: true },
        status: { type: String, enum: ["pending", "live", "completed"], default: "pending" },
        startedAt: Date,
        endedAt: Date,
        pairings: [
          {
            gameId: { type: Schema.Types.ObjectId, ref: "TournamentGame" },
            tableNumber: Number,
            whiteKey: String,
            blackKey: String,
            whiteName: String,
            blackName: String,
            result: { type: String, default: "*" },
            status: { type: String, enum: ["pending", "live", "completed"], default: "pending" },
          },
        ],
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    parentTournament: { type: Schema.Types.ObjectId, ref: "Tournament", index: true },
  },
  { timestamps: true }
);

export type TournamentDoc = InferSchemaType<typeof TournamentSchema> & { _id: any };
export const Tournament = models.Tournament || model("Tournament", TournamentSchema);
