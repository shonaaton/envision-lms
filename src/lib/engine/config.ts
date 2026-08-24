import type { EnginePriority, EnginePresetKey } from "@/lib/engine/types";

export const ENGINE_QUEUE_NAMES: Record<EnginePriority, string> = {
  0: "critical",
  1: "realtime",
  2: "normal",
  3: "batch",
};

export const ENGINE_PRESETS: Record<EnginePresetKey, { nodes: number; multiPv: number; depth?: number }> = {
  quick: { nodes: 100_000, multiPv: 1, depth: 12 },
  normal: { nodes: 500_000, multiPv: 3, depth: 16 },
  deep: { nodes: 2_000_000, multiPv: 3, depth: 20 },
};

export const ENGINE_LEVELS: Record<number, { skillLevel: number; moveTime: number; depth: number }> = {
  1: { skillLevel: 1, moveTime: 80, depth: 4 },
  2: { skillLevel: 3, moveTime: 100, depth: 5 },
  3: { skillLevel: 6, moveTime: 150, depth: 6 },
  4: { skillLevel: 10, moveTime: 250, depth: 7 },
  5: { skillLevel: 13, moveTime: 400, depth: 8 },
  6: { skillLevel: 16, moveTime: 600, depth: 10 },
  7: { skillLevel: 19, moveTime: 900, depth: 12 },
  8: { skillLevel: 20, moveTime: 1_500, depth: 14 },
  9: { skillLevel: 20, moveTime: 3_500, depth: 16 },
};

export const ENGINE_LEASE_TTL_MS = 20_000;
export const ENGINE_WORKER_STALE_MS = 45_000;
export const ENGINE_MAX_ATTEMPTS = 3;
export const ENGINE_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
