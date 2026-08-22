import { Schema, model, models, type InferSchemaType } from "mongoose";

const EngineWorkerSchema = new Schema(
  {
    workerId: { type: String, required: true, unique: true, index: true },
    workerName: { type: String, required: true },
    keyHash: { type: String, required: true },
    enabled: { type: Boolean, default: true, index: true },
    cores: { type: Number, default: 1 },
    status: { type: String, enum: ["online", "offline", "busy"], default: "offline", index: true },
    currentJobId: String,
    lastSeenAt: Date,
    lastAcquireAt: Date,
    lastResultAt: Date,
    capabilities: {
      move: { type: Boolean, default: true },
      analysis: { type: Boolean, default: true },
    },
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export type EngineWorkerDoc = InferSchemaType<typeof EngineWorkerSchema> & { _id: any };
export const EngineWorker = models.EngineWorker || model("EngineWorker", EngineWorkerSchema);
