import { randomUUID } from "crypto";
import { Chess } from "chess.js";
import { EngineJob } from "@/models/EngineJob";
import { EngineWorker } from "@/models/EngineWorker";
import { dbConnect } from "@/lib/db";
import { ENGINE_CACHE_TTL_MS, ENGINE_LEASE_TTL_MS, ENGINE_MAX_ATTEMPTS, ENGINE_QUEUE_NAMES, ENGINE_WORKER_STALE_MS } from "@/lib/engine/config";
import { sha256 } from "@/lib/engine/hash";
import { claimEngineLease, dequeueEngineJob, enqueueEngineJob, getEngineRedisStatus, isRedisConfigured, readEngineCache, releaseEngineLease, removeEngineJobFromQueues, renewEngineLease, writeEngineCache } from "@/lib/engine/redis";
import type {
  EngineJobPayload,
  EngineJobStatus,
  EngineJobType,
  EnginePriority,
  EngineResult,
  EngineSettings,
  EngineWorkerSnapshot,
  EngineWorkType,
} from "@/lib/engine/types";

type QueueState = {
  queues: Record<EnginePriority, string[]>;
  cache: Map<string, { expiresAt: number; result: EngineResult }>;
};

declare global {
  var _engineQueueState: QueueState | undefined;
  var _engineMetrics: { cacheHits: number; cacheWrites: number } | undefined;
}

const queueState: QueueState = global._engineQueueState ?? {
  queues: { 0: [], 1: [], 2: [], 3: [] },
  cache: new Map<string, { expiresAt: number; result: EngineResult }>(),
};

if (!global._engineQueueState) global._engineQueueState = queueState;
const engineMetrics = global._engineMetrics ?? { cacheHits: 0, cacheWrites: 0 };
if (!global._engineMetrics) global._engineMetrics = engineMetrics;

function now() {
  return Date.now();
}

function pruneCache() {
  const timestamp = now();
  for (const [key, value] of queueState.cache.entries()) {
    if (value.expiresAt <= timestamp) queueState.cache.delete(key);
  }
}

function ensureQueuedMemory(jobId: string, priority: EnginePriority) {
  const queue = queueState.queues[priority];
  if (!queue.includes(jobId)) queue.push(jobId);
}

function dequeueMemory(jobId: string) {
  for (const priority of Object.keys(queueState.queues) as Array<`${EnginePriority}`>) {
    queueState.queues[Number(priority) as EnginePriority] = queueState.queues[Number(priority) as EnginePriority].filter((value) => value !== jobId);
  }
}

async function ensureQueued(jobId: string, priority: EnginePriority) {
  ensureQueuedMemory(jobId, priority);
  await enqueueEngineJob(jobId, priority);
}

async function dequeue(jobId: string) {
  dequeueMemory(jobId);
  await removeEngineJobFromQueues(jobId);
}

function canonicalMoves(moves?: string[]) {
  return Array.isArray(moves) ? moves.map((move) => String(move || "").trim()).filter(Boolean) : [];
}

export function buildPositionHash(fen: string, moves?: string[]) {
  return sha256(JSON.stringify({ fen: String(fen || "").trim(), moves: canonicalMoves(moves) }));
}

export function buildCacheKey(input: { fen: string; moves?: string[]; engine: EngineSettings; workType: EngineWorkType }) {
  return sha256(JSON.stringify({
    fen: String(input.fen || "").trim(),
    moves: canonicalMoves(input.moves),
    workType: input.workType,
    engine: input.engine,
    version: "stockfish-shared-v1",
  }));
}

export function buildDedupeKey(input: {
  type: EngineJobType;
  fen: string;
  moves?: string[];
  engine: EngineSettings;
  source: string;
  classroomId?: string;
  gameId?: string;
  tournamentId?: string;
}) {
  return sha256(JSON.stringify({
    type: input.type,
    source: input.source,
    classroomId: input.classroomId || "",
    gameId: input.gameId || "",
    tournamentId: input.tournamentId || "",
    fen: String(input.fen || "").trim(),
    moves: canonicalMoves(input.moves),
    engine: input.engine,
  }));
}

export async function reapExpiredLeases() {
  await dbConnect();
  const expired = await EngineJob.find({
    status: { $in: ["ASSIGNED", "RUNNING"] },
    leaseExpiresAt: { $lte: new Date() },
  }).lean();

  for (const job of expired) {
    if (Number(job.attempts || 0) >= ENGINE_MAX_ATTEMPTS) {
      await EngineJob.updateOne(
        { _id: job._id, status: { $in: ["ASSIGNED", "RUNNING"] } },
        {
          $set: {
            status: "FAILED" as EngineJobStatus,
            lastError: "Worker lease expired too many times.",
            completedAt: new Date(),
          },
          $unset: { workerId: 1, workerName: 1, leaseExpiresAt: 1 },
        }
      );
      continue;
    }

    await EngineJob.updateOne(
      { _id: job._id, status: { $in: ["ASSIGNED", "RUNNING"] } },
      {
        $set: { status: "QUEUED" as EngineJobStatus, lastError: "Worker lease expired. Job requeued." },
        $inc: { attempts: 1 },
        $unset: { workerId: 1, workerName: 1, leaseExpiresAt: 1, startedAt: 1 },
      }
    );
    void ensureQueued(job.jobId, Number(job.priority) as EnginePriority);
  }

  const staleCutoff = new Date(Date.now() - ENGINE_WORKER_STALE_MS);
  await EngineWorker.updateMany(
    { lastSeenAt: { $lt: staleCutoff } },
    { $set: { status: "offline" }, $unset: { currentJobId: 1 } }
  );
}

export async function createEngineJob(input: {
  type: EngineJobType;
  priority: EnginePriority;
  payload: EngineJobPayload;
  engine: EngineSettings;
  workType: EngineWorkType;
  userId?: string;
}) {
  await dbConnect();
  pruneCache();

  if (input.payload.cacheKey) {
    const cached = queueState.cache.get(input.payload.cacheKey);
    if (cached && cached.expiresAt > now()) {
      engineMetrics.cacheHits += 1;
      return { fromCache: true as const, result: cached.result };
    }
    const redisCached = await readEngineCache(input.payload.cacheKey);
    if (redisCached) {
      engineMetrics.cacheHits += 1;
      return { fromCache: true as const, result: redisCached };
    }
  }

  const existing = await EngineJob.findOne({
    dedupeKey: input.payload.dedupeKey,
    status: { $in: ["QUEUED", "ASSIGNED", "RUNNING"] },
  }).lean();
  if (existing) return { deduped: true as const, job: existing };

  const jobId = `eng_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = await EngineJob.create({
    jobId,
    type: input.type,
    priority: input.priority,
    source: input.payload.source,
    status: "QUEUED",
    userId: input.userId || undefined,
    classroomId: input.payload.classroomId,
    gameId: input.payload.gameId,
    tournamentId: input.payload.tournamentId,
    fen: input.payload.fen,
    moves: input.payload.moves || [],
    pgn: input.payload.pgn,
    positionHash: input.payload.positionHash,
    dedupeKey: input.payload.dedupeKey,
    cacheKey: input.payload.cacheKey,
    engine: input.engine,
    workType: input.workType,
    attempts: 0,
    clock: input.payload.clock,
    level: input.payload.level,
  });
  await ensureQueued(jobId, input.priority);
  return { created: true as const, job: created.toObject() };
}

export function normalizeEngineResult(payload: any): EngineResult {
  const lines = Array.isArray(payload?.lines)
    ? payload.lines
        .map((line: any, index: number) => {
          const scoreType = line?.evaluation?.type === "mate" || line?.score?.type === "mate" ? "mate" : "cp";
          const scoreValue = Number(
            line?.evaluation?.value
            ?? line?.score?.value
            ?? line?.score?.cp
            ?? line?.score?.mate
            ?? 0
          );
          return {
            multipv: Math.max(1, Number(line?.multipv ?? index + 1)),
            evaluation: { type: scoreType as "cp" | "mate", value: scoreValue },
            depth: Math.max(0, Number(line?.depth ?? payload?.depth ?? 0)),
            nodes: Math.max(0, Number(line?.nodes ?? payload?.nodes ?? 0)),
            nps: Number.isFinite(Number(line?.nps)) ? Number(line.nps) : undefined,
            pv: Array.isArray(line?.pv)
              ? line.pv.map((move: unknown) => String(move))
              : String(line?.pv || "").trim().split(/\s+/).filter(Boolean),
          };
        })
        .filter((line: any) => line.pv.length || line.depth || line.nodes)
    : [];

  const bestMove = String(
    payload?.bestMove
    ?? payload?.bestmove
    ?? payload?.move?.bestmove
    ?? ""
  ).trim();

  const topLine = lines[0];
  return {
    bestMove: bestMove || undefined,
    evaluation: topLine?.evaluation,
    depth: topLine?.depth ?? (Number(payload?.depth || 0) || undefined),
    lines,
    raw: payload,
  };
}

function toFishnetWork(job: any) {
  const payload: Record<string, unknown> = {
    type: job.workType,
    id: job.jobId,
  };
  if (job.workType === "move") {
    payload.level = Math.min(8, Math.max(1, Number(job.level || 5)));
    if (job.clock?.white !== undefined && job.clock?.black !== undefined) {
      payload.clock = {
        wtime: Number(job.clock.white || 0),
        btime: Number(job.clock.black || 0),
        inc: Number(job.clock.increment || 0),
      };
    }
  } else {
    const nodes = Number(job.engine?.nodes || 1_500_000);
    payload.nodes = {
      sf15: nodes,
      sf14: Math.ceil(nodes * 1.4),
      classical: Math.ceil(nodes * 2.7),
    };
    payload.timeout = Number(job.engine?.moveTime || 7_000);
    payload.depth = Number(job.engine?.depth || 0) || undefined;
    payload.multipv = Math.max(1, Number(job.engine?.multiPv || 1));
  }
  return {
    work: payload,
    game_id: job.gameId || job.classroomId || job.tournamentId || "",
    position: job.fen,
    variant: "standard",
    moves: canonicalMoves(job.moves).join(" "),
    skipPositions: [],
  };
}

export async function acquireEngineJob(worker: { workerId: string; workerName: string; cores: number }) {
  await reapExpiredLeases();
  await dbConnect();

  for (const priority of [0, 1, 2, 3] as EnginePriority[]) {
    const queue = queueState.queues[priority];
    while (queue.length || isRedisConfigured()) {
      const jobId = (isRedisConfigured() ? await dequeueEngineJob(priority) : null) || queue.shift();
      if (!jobId) break;
      dequeueMemory(jobId);
      const job = await EngineJob.findOne({ jobId }).lean() as any;
      if (!job || job.status !== "QUEUED") continue;

      const leaseExpiresAt = new Date(Date.now() + ENGINE_LEASE_TTL_MS);
      if (!(await claimEngineLease(jobId, worker.workerId))) continue;
      const claim = await EngineJob.findOneAndUpdate(
        { _id: job._id, status: "QUEUED" },
        {
          $set: {
            status: "ASSIGNED",
            workerId: worker.workerId,
            workerName: worker.workerName,
            leaseExpiresAt,
            startedAt: new Date(),
          },
          $inc: { attempts: 1 },
        },
        { new: true }
      ).lean() as any;
      if (!claim) {
        await releaseEngineLease(jobId, worker.workerId);
        continue;
      }

      await EngineWorker.updateOne(
        { workerId: worker.workerId },
        {
          $set: {
            workerName: worker.workerName,
            cores: worker.cores,
            status: "busy",
            currentJobId: claim.jobId,
            lastSeenAt: new Date(),
            lastAcquireAt: new Date(),
          },
        }
      );

      return claim ? toFishnetWork(claim) : null;
    }
  }

  await EngineWorker.updateOne(
    { workerId: worker.workerId },
    {
      $set: {
        workerName: worker.workerName,
        cores: worker.cores,
        status: "online",
        lastSeenAt: new Date(),
        lastAcquireAt: new Date(),
      },
      $unset: { currentJobId: 1 },
    }
  );
  return null;
}

export async function touchJobLease(jobId: string, workerId: string) {
  await dbConnect();
  await EngineJob.updateOne(
    { jobId, workerId, status: { $in: ["ASSIGNED", "RUNNING"] } },
    { $set: { status: "RUNNING", leaseExpiresAt: new Date(Date.now() + ENGINE_LEASE_TTL_MS) } }
  );
  await renewEngineLease(jobId, workerId);
  await EngineWorker.updateOne({ workerId }, { $set: { lastSeenAt: new Date(), status: "busy" } });
}

export async function completeEngineJob(jobId: string, workerId: string, payload: unknown) {
  await dbConnect();
  const job = await EngineJob.findOne({ jobId }).lean() as any;
  if (!job) return { ok: false as const, status: 404, error: "Job not found." };
  if (job.status === "COMPLETED") return { ok: true as const, ignored: true };
  if (job.status === "CANCELLED") return { ok: true as const, ignored: true };
  if (job.workerId && job.workerId !== workerId) return { ok: false as const, status: 409, error: "Job belongs to another worker." };

  const result = normalizeEngineResult(payload);
  const updated = await EngineJob.findOneAndUpdate(
    { _id: job._id, status: { $in: ["ASSIGNED", "RUNNING"] } },
    {
      $set: {
        status: "COMPLETED",
        result,
        rawWorkerPayload: payload,
        completedAt: new Date(),
      },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true }
  ).lean() as any;

  await EngineWorker.updateOne(
    { workerId },
    {
      $set: { status: "online", lastSeenAt: new Date(), lastResultAt: new Date() },
      $unset: { currentJobId: 1 },
    }
  );
  await releaseEngineLease(jobId, workerId);

  if (!updated) return { ok: true as const, ignored: true };

  if (updated.cacheKey) {
    queueState.cache.set(updated.cacheKey, { expiresAt: Date.now() + ENGINE_CACHE_TTL_MS, result });
    engineMetrics.cacheWrites += 1;
    await writeEngineCache(updated.cacheKey, result, Math.ceil(ENGINE_CACHE_TTL_MS / 1000));
  }
  await dequeue(jobId);
  await releaseEngineLease(jobId, workerId);
  return { ok: true as const, job: updated };
}

export async function cancelEngineJob(jobId: string) {
  await dbConnect();
  const updated = await EngineJob.findOneAndUpdate(
    { jobId, status: { $in: ["QUEUED", "ASSIGNED", "RUNNING"] } },
    {
      $set: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true }
  ).lean() as any;
  await dequeue(jobId);
  if (updated?.workerId) {
    await releaseEngineLease(jobId, updated.workerId);
    await EngineWorker.updateOne(
      { workerId: updated.workerId },
      { $set: { status: "online", lastSeenAt: new Date() }, $unset: { currentJobId: 1 } }
    );
  }
  return updated;
}

export async function failEngineJob(jobId: string, workerId: string, error: string) {
  await dbConnect();
  const updated = await EngineJob.findOneAndUpdate(
    { jobId, workerId, status: { $in: ["ASSIGNED", "RUNNING"] } },
    {
      $set: {
        status: "FAILED",
        lastError: error,
        completedAt: new Date(),
      },
      $unset: { leaseExpiresAt: 1 },
    },
    { new: true }
  ).lean() as any;
  await dequeue(jobId);
  await releaseEngineLease(jobId, workerId);
  await EngineWorker.updateOne(
    { workerId },
    { $set: { status: "online", lastSeenAt: new Date() }, $unset: { currentJobId: 1 } }
  );
  return updated;
}

export async function getEngineJob(jobId: string) {
  await dbConnect();
  return EngineJob.findOne({ jobId }).lean() as any;
}

export async function getEngineStatus() {
  await reapExpiredLeases();
  await dbConnect();
  const [workers, queueCounts, activeWorkers] = await Promise.all([
    EngineWorker.find({}).sort({ workerName: 1 }).lean(),
    Promise.all(([0, 1, 2, 3] as EnginePriority[]).map(async (priority) => ({
      priority,
      count: await EngineJob.countDocuments({ priority, status: "QUEUED" }),
    }))),
    EngineWorker.countDocuments({ status: "busy" }),
  ]);
  const [completed, failed, cancelled, total] = await Promise.all([
    EngineJob.countDocuments({ status: "COMPLETED" }),
    EngineJob.countDocuments({ status: "FAILED" }),
    EngineJob.countDocuments({ status: "CANCELLED" }),
    EngineJob.countDocuments({}),
  ]);

  const workerSnapshots: EngineWorkerSnapshot[] = workers.map((worker: any) => ({
    workerId: worker.workerId,
    workerName: worker.workerName,
    cores: Number(worker.cores || 1),
    status: worker.status || "offline",
    currentJobId: worker.currentJobId || undefined,
    lastSeenAt: worker.lastSeenAt || null,
  }));

  return {
    redis: await getEngineRedisStatus(),
    status: "healthy",
    queue: Object.fromEntries(queueCounts.map((item) => [ENGINE_QUEUE_NAMES[item.priority], item.count])),
    jobs: { total, completed, failed, cancelled },
    cache: { hits: engineMetrics.cacheHits, writes: engineMetrics.cacheWrites },
    workers: {
      available: workers.filter((worker: any) => worker.status === "online").length,
      busy: activeWorkers,
      offline: workers.filter((worker: any) => worker.status === "offline").length,
      items: workerSnapshots,
    },
  };
}

export function parsePgnToMoves(pgn: string) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return (chess.history({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>).map(
    (move) => `${move.from}${move.to}${move.promotion || ""}`
  );
}
