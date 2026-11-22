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

// fishnetLevel is the Lichess AI level the server engine plays (fishnet 2.14 src/api.rs):
//   4 = Skill 3, depth 5, 200ms · 5 = Skill 7, depth 5, 300ms · 6 = Skill 11, depth 8, 400ms
//   8 = Skill 20, depth 22, 1s. Lichess rates those roughly 1700 / 2000 / 2300 / 2900 on its
//   own (inflated) scale, which lines up with Ember 1350 · Noir 1650 · Atlas 2000 over the board.
export const ENGINE_LEVELS: Record<number, { skillLevel: number; moveTime: number; depth: number; fishnetLevel: number }> = {
  1: { skillLevel: 1, moveTime: 80, depth: 4, fishnetLevel: 1 },
  2: { skillLevel: 3, moveTime: 100, depth: 5, fishnetLevel: 1 },
  3: { skillLevel: 6, moveTime: 150, depth: 6, fishnetLevel: 2 },
  4: { skillLevel: 10, moveTime: 250, depth: 7, fishnetLevel: 3 },
  5: { skillLevel: 13, moveTime: 400, depth: 8, fishnetLevel: 3 },
  6: { skillLevel: 14, moveTime: 850, depth: 8, fishnetLevel: 4 },
  7: { skillLevel: 17, moveTime: 1_200, depth: 10, fishnetLevel: 5 },
  8: { skillLevel: 20, moveTime: 1_800, depth: 12, fishnetLevel: 6 },
  9: { skillLevel: 20, moveTime: 2_800, depth: 16, fishnetLevel: 8 },
};

export const ENGINE_LEASE_TTL_MS = 20_000;
export const ENGINE_WORKER_STALE_MS = 45_000;
export const ENGINE_MAX_ATTEMPTS = 3;
export const ENGINE_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
