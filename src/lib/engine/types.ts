export const ENGINE_PRIORITIES = [0, 1, 2, 3] as const;
export type EnginePriority = (typeof ENGINE_PRIORITIES)[number];

export const ENGINE_JOB_TYPES = [
  "COMPUTER_MOVE",
  "POSITION_ANALYSIS",
  "PGN_ANALYSIS",
  "CLASSROOM_ANALYSIS",
  "TOURNAMENT_BOT_MOVE",
] as const;
export type EngineJobType = (typeof ENGINE_JOB_TYPES)[number];

export const ENGINE_JOB_STATUSES = [
  "QUEUED",
  "ASSIGNED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type EngineJobStatus = (typeof ENGINE_JOB_STATUSES)[number];

export const ENGINE_WORK_TYPES = ["move", "analysis"] as const;
export type EngineWorkType = (typeof ENGINE_WORK_TYPES)[number];

export type EngineLine = {
  multipv: number;
  evaluation: {
    type: "cp" | "mate";
    value: number;
  };
  depth: number;
  nodes: number;
  nps?: number;
  pv: string[];
};

export type EngineResult = {
  bestMove?: string;
  evaluation?: {
    type: "cp" | "mate";
    value: number;
  };
  depth?: number;
  lines?: EngineLine[];
  raw?: unknown;
};

export type EnginePresetKey = "quick" | "normal" | "deep";

export type EngineJobSource =
  | "PLAY_VS_COMPUTER"
  | "ANALYSIS_BOARD"
  | "CLASSROOM"
  | "PGN_UPLOAD"
  | "TOURNAMENT_TEST";

export type EngineJobPayload = {
  source: EngineJobSource;
  fen: string;
  moves?: string[];
  pgn?: string;
  classroomId?: string;
  gameId?: string;
  tournamentId?: string;
  positionHash: string;
  dedupeKey: string;
  cacheKey?: string;
  clock?: {
    white: number;
    black: number;
    increment: number;
  };
  level?: number;
};

export type EngineSettings = {
  multiPv?: number;
  depth?: number;
  nodes?: number;
  moveTime?: number;
  skillLevel?: number;
};

export type EngineWorkerSnapshot = {
  workerId: string;
  workerName: string;
  cores: number;
  status: "online" | "offline" | "busy";
  currentJobId?: string;
  lastSeenAt?: Date | null;
};
