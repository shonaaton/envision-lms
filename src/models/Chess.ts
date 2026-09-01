import { Schema, model, models, type InferSchemaType } from "mongoose";

const PlatformValues = ["CHESS_COM", "LICHESS"] as const;
const RatingTypeValues = ["rapid", "blitz", "bullet", "classical", "correspondence"] as const;
const ResultValues = ["win", "draw", "loss"] as const;
const ColorValues = ["white", "black"] as const;
const TimeControlValues = ["ultrabullet", "bullet", "blitz", "rapid", "classical", "correspondence", "unknown"] as const;
const SyncStatusValues = ["PENDING", "SYNCING", "COMPLETED", "FAILED"] as const;

const ChessProfileSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    settings: {
      minimumOpeningGames: { type: Number, default: 5 },
    },
  },
  { timestamps: true }
);

const ChessAccountSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    platform: { type: String, enum: PlatformValues, required: true, index: true },
    username: { type: String, required: true },
    normalizedUsername: { type: String, required: true, lowercase: true, trim: true, index: true },
    platformUserId: { type: String, index: true },
    verified: { type: Boolean, default: false, index: true },
    connectedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date, index: true },
    syncStatus: { type: String, enum: SyncStatusValues, default: "PENDING", index: true },
    isActive: { type: Boolean, default: true, index: true },
    lastError: String,
  },
  { timestamps: true }
);

ChessAccountSchema.index({ student: 1, platform: 1, isActive: 1 });
ChessAccountSchema.index({ platform: 1, normalizedUsername: 1 });

const ChessGameSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    chessAccount: { type: Schema.Types.ObjectId, ref: "ChessAccount", required: true, index: true },
    platform: { type: String, enum: PlatformValues, required: true, index: true },
    platformGameId: { type: String, index: true },
    playedAt: { type: Date, required: true, index: true },
    whiteUsername: { type: String, required: true },
    blackUsername: { type: String, required: true },
    whiteRating: Number,
    blackRating: Number,
    studentColor: { type: String, enum: ColorValues, required: true, index: true },
    studentRating: Number,
    opponentUsername: { type: String, required: true, index: true },
    opponentRating: Number,
    ratingChange: Number,
    result: { type: String, enum: ResultValues, required: true, index: true },
    termination: String,
    timeControl: String,
    timeControlCategory: { type: String, enum: TimeControlValues, default: "unknown", index: true },
    rated: { type: Boolean, default: false, index: true },
    opening: { type: String, index: true },
    eco: { type: String, index: true },
    pgn: String,
    gameUrl: String,
    gameHash: { type: String, required: true, index: true },
    moveCount: Number,
  },
  { timestamps: true }
);

ChessGameSchema.index({ student: 1, playedAt: -1 });
ChessGameSchema.index({ student: 1, platform: 1, timeControlCategory: 1, playedAt: -1 });
ChessGameSchema.index({ student: 1, result: 1, studentColor: 1 });
ChessGameSchema.index({ chessAccount: 1, platformGameId: 1 }, { unique: true, sparse: true });
ChessGameSchema.index({ chessAccount: 1, gameHash: 1 }, { unique: true });

const ChessRatingSnapshotSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    chessAccount: { type: Schema.Types.ObjectId, ref: "ChessAccount", required: true, index: true },
    platform: { type: String, enum: PlatformValues, required: true, index: true },
    ratingType: { type: String, enum: RatingTypeValues, required: true, index: true },
    rating: { type: Number, required: true },
    recordedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

ChessRatingSnapshotSchema.index({ student: 1, platform: 1, ratingType: 1, recordedAt: 1 });
ChessRatingSnapshotSchema.index({ chessAccount: 1, ratingType: 1, recordedAt: 1 }, { unique: true });

const ChessSyncJobSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    account: { type: Schema.Types.ObjectId, ref: "ChessAccount", required: true, index: true },
    platform: { type: String, enum: PlatformValues, required: true, index: true },
    status: { type: String, enum: SyncStatusValues, default: "PENDING", index: true },
    startedAt: Date,
    completedAt: Date,
    gamesFound: { type: Number, default: 0 },
    gamesImported: { type: Number, default: 0 },
    duplicatesSkipped: { type: Number, default: 0 },
    error: String,
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ChessSyncJobSchema.index({ account: 1, status: 1, createdAt: -1 });

const ChessAnalyticsSnapshotSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    period: { type: String, required: true, index: true },
    generatedAt: { type: Date, default: Date.now, index: true },
    analyticsJson: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const ChessGameAnalysisSchema = new Schema(
  {
    game: { type: Schema.Types.ObjectId, ref: "ChessGame", required: true, unique: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accuracy: Number,
    acpl: Number,
    inaccuracies: Number,
    mistakes: Number,
    blunders: Number,
    missedWins: Number,
    openingAccuracy: Number,
    middlegameAccuracy: Number,
    endgameAccuracy: Number,
    analysisVersion: String,
    engineDepth: Number,
  },
  { timestamps: true }
);

export type ChessProfileDoc = InferSchemaType<typeof ChessProfileSchema> & { _id: any };
export type ChessAccountDoc = InferSchemaType<typeof ChessAccountSchema> & { _id: any };
export type ChessGameDoc = InferSchemaType<typeof ChessGameSchema> & { _id: any };
export type ChessRatingSnapshotDoc = InferSchemaType<typeof ChessRatingSnapshotSchema> & { _id: any };
export type ChessSyncJobDoc = InferSchemaType<typeof ChessSyncJobSchema> & { _id: any };
export type ChessAnalyticsSnapshotDoc = InferSchemaType<typeof ChessAnalyticsSnapshotSchema> & { _id: any };
export type ChessGameAnalysisDoc = InferSchemaType<typeof ChessGameAnalysisSchema> & { _id: any };

export const ChessProfile = models.ChessProfile || model("ChessProfile", ChessProfileSchema);
export const ChessAccount = models.ChessAccount || model("ChessAccount", ChessAccountSchema);
export const ChessGame = models.ChessGame || model("ChessGame", ChessGameSchema);
export const ChessRatingSnapshot = models.ChessRatingSnapshot || model("ChessRatingSnapshot", ChessRatingSnapshotSchema);
export const ChessSyncJob = models.ChessSyncJob || model("ChessSyncJob", ChessSyncJobSchema);
export const ChessAnalyticsSnapshot = models.ChessAnalyticsSnapshot || model("ChessAnalyticsSnapshot", ChessAnalyticsSnapshotSchema);
export const ChessGameAnalysis = models.ChessGameAnalysis || model("ChessGameAnalysis", ChessGameAnalysisSchema);
