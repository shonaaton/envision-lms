import { Chess } from "chess.js";
import { z } from "zod";
import { ENGINE_PRIORITIES, ENGINE_JOB_TYPES } from "@/lib/engine/types";

export const engineAnalyseRequestSchema = z.object({
  fen: z.string().min(1),
  preset: z.enum(["quick", "normal", "deep"]).optional(),
  multiPv: z.number().int().min(1).max(5).optional(),
  depth: z.number().int().min(1).max(24).optional(),
  nodes: z.number().int().min(1).max(5_000_000).optional(),
  moves: z.array(z.string().min(2).max(8)).max(300).optional(),
  source: z.enum(["ANALYSIS_BOARD", "CLASSROOM", "PGN_UPLOAD"]).default("ANALYSIS_BOARD"),
  classroomId: z.string().trim().min(1).optional(),
  gameId: z.string().trim().min(1).optional(),
});

export const engineMoveRequestSchema = z.object({
  fen: z.string().min(1),
  level: z.number().int().min(1).max(9).default(5),
  clock: z.object({
    white: z.number().int().min(0),
    black: z.number().int().min(0),
    increment: z.number().int().min(0).max(60_000),
  }).optional(),
  gameId: z.string().trim().min(1).optional(),
  tournamentId: z.string().trim().min(1).optional(),
  source: z.enum(["PLAY_VS_COMPUTER", "TOURNAMENT_TEST"]).default("PLAY_VS_COMPUTER"),
});

export const enginePgnRequestSchema = z.object({
  pgn: z.string().min(1),
  preset: z.enum(["quick", "normal", "deep"]).optional(),
  multiPv: z.number().int().min(1).max(3).optional(),
  depth: z.number().int().min(1).max(24).optional(),
  gameId: z.string().trim().min(1).optional(),
});

export const engineJobFilterSchema = z.object({
  type: z.enum(ENGINE_JOB_TYPES).optional(),
  priority: z.enum(ENGINE_PRIORITIES.map((value) => String(value)) as [string, ...string[]]).optional(),
});

export function validateFen(fen: string) {
  try {
    const chess = new Chess();
    chess.load(fen);
    return { ok: true as const, normalizedFen: chess.fen() };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Invalid FEN",
    };
  }
}
