import "server-only";

import { createClient, type RedisClientType } from "redis";
import type { EnginePriority, EngineResult } from "@/lib/engine/types";

const QUEUE_PREFIX = "engine:queue:";
const CACHE_PREFIX = "engine:cache:";
const LEASE_PREFIX = "engine:lease:";
const LEASE_SECONDS = 25;
type RedisClient = RedisClientType;

declare global {
  var _engineRedisPromise: Promise<RedisClient | null> | undefined;
  var _engineRedisUnavailableUntil: number | undefined;
}

function getUrl() { return String(process.env.REDIS_URL || "").trim(); }
export function isRedisConfigured() { return Boolean(getUrl()); }

async function getRedis(): Promise<RedisClient | null> {
  if (!getUrl() || Date.now() < (global._engineRedisUnavailableUntil || 0)) return null;
  if (global._engineRedisPromise) return global._engineRedisPromise;
  const client = createClient({ url: getUrl() }) as RedisClient;
  client.on("error", () => { global._engineRedisUnavailableUntil = Date.now() + 15_000; });
  global._engineRedisPromise = client.connect().then(() => client).catch(() => {
    global._engineRedisUnavailableUntil = Date.now() + 15_000;
    global._engineRedisPromise = undefined;
    return null;
  });
  return global._engineRedisPromise;
}

export async function enqueueEngineJob(jobId: string, priority: EnginePriority) {
  const redis = await getRedis(); if (!redis) return false;
  await redis.rPush(`${QUEUE_PREFIX}${priority}`, jobId); return true;
}

export async function dequeueEngineJob(priority: EnginePriority) {
  const redis = await getRedis(); if (!redis) return null;
  return redis.lPop(`${QUEUE_PREFIX}${priority}`);
}

export async function removeEngineJobFromQueues(jobId: string) {
  const redis = await getRedis(); if (!redis) return;
  await Promise.all(([0, 1, 2, 3] as EnginePriority[]).map((priority) => redis.lRem(`${QUEUE_PREFIX}${priority}`, 0, jobId)));
}

export async function readEngineCache(cacheKey: string) {
  const redis = await getRedis(); if (!redis) return null;
  const value = await redis.get(`${CACHE_PREFIX}${cacheKey}`);
  return value ? JSON.parse(value) as EngineResult : null;
}

export async function writeEngineCache(cacheKey: string, result: EngineResult, ttlSeconds: number) {
  const redis = await getRedis(); if (!redis) return false;
  await redis.set(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(result), { EX: ttlSeconds }); return true;
}

export async function claimEngineLease(jobId: string, workerId: string) {
  const redis = await getRedis(); if (!redis) return true;
  return (await redis.set(`${LEASE_PREFIX}${jobId}`, workerId, { NX: true, EX: LEASE_SECONDS })) === "OK";
}

export async function renewEngineLease(jobId: string, workerId: string) {
  const redis = await getRedis(); if (!redis) return true;
  const key = `${LEASE_PREFIX}${jobId}`; if ((await redis.get(key)) !== workerId) return false;
  await redis.expire(key, LEASE_SECONDS); return true;
}

export async function releaseEngineLease(jobId: string, workerId?: string) {
  const redis = await getRedis(); if (!redis) return;
  const key = `${LEASE_PREFIX}${jobId}`;
  if (!workerId || (await redis.get(key)) === workerId) await redis.del(key);
}

export async function getEngineRedisStatus() {
  if (!isRedisConfigured()) return { configured: false, status: "disabled" as const };
  const redis = await getRedis(); if (!redis) return { configured: true, status: "unhealthy" as const };
  try { await redis.ping(); return { configured: true, status: "healthy" as const }; }
  catch { return { configured: true, status: "unhealthy" as const };
  }
}
