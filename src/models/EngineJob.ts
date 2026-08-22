import { Schema, model, models, type InferSchemaType } from "mongoose";

const EngineLineSchema = new Schema(
  {
    multipv: { type: Number, required: true },
    evaluation: {
      type: {
        type: String,
        enum: ["cp", "mate"],
        required: true,
      },
      value: { type: Number, required: true },
    },
    depth: { type: Number, required: true },
    nodes: { type: Number, required: true },
    nps: Number,
    pv: [{ type: String }],
  },
  { _id: false }
);

const EngineResultSchema = new Schema(
  {
    bestMove: String,
    evaluation: {
      type: {
        type: String,
        enum: ["cp", "mate"],
      },
      value: Number,
    },
    depth: Number,
    lines: [EngineLineSchema],
    raw: Schema.Types.Mixed,
  },
  { _id: false }
);

const EngineJobSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      enum: ["COMPUTER_MOVE", "POSITION_ANALYSIS", "PGN_ANALYSIS", "CLASSROOM_ANALYSIS", "TOURNAMENT_BOT_MOVE"],
      required: true,
      index: true,
    },
    priority: { type: Number, enum: [0, 1, 2, 3], required: true, index: true },
    source: {
      type: String,
      enum: ["PLAY_VS_COMPUTER", "ANALYSIS_BOARD", "CLASSROOM", "PGN_UPLOAD", "TOURNAMENT_TEST"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["QUEUED", "ASSIGNED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
      default: "QUEUED",
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    classroomId: { type: String, index: true },
    gameId: { type: String, index: true },
    tournamentId: { type: String, index: true },
    fen: { type: String, required: true },
    moves: [{ type: String }],
    pgn: String,
    positionHash: { type: String, required: true, index: true },
    dedupeKey: { type: String, required: true, index: true },
    cacheKey: { type: String, index: true },
    engine: {
      multiPv: Number,
      depth: Number,
      nodes: Number,
      moveTime: Number,
      skillLevel: Number,
    },
    workerId: { type: String, index: true },
    workerName: String,
    workType: { type: String, enum: ["move", "analysis"], required: true },
    leaseExpiresAt: Date,
    attempts: { type: Number, default: 0 },
    subscribers: [{ type: String }],
    lastError: String,
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    clock: {
      white: Number,
      black: Number,
      increment: Number,
    },
    level: Number,
    result: EngineResultSchema,
    rawWorkerPayload: Schema.Types.Mixed,
  },
  { timestamps: true }
);

EngineJobSchema.index({ status: 1, priority: 1, createdAt: 1 });
EngineJobSchema.index({ dedupeKey: 1, status: 1 });

export type EngineJobDoc = InferSchemaType<typeof EngineJobSchema> & { _id: any };
export const EngineJob = models.EngineJob || model("EngineJob", EngineJobSchema);
