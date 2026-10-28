import { Chess } from "chess.js";
import { normalizePermissiveFen } from "@/lib/pgnLibrary";

/**
 * A PGN quiz position: the start position plus the main line the student must
 * find, one move at a time, with the opponent's replies played automatically.
 *
 * Shared by the homework board (which checks moves in the browser) and the
 * exam (which checks every move on the server so the answer never reaches the
 * page). Both must agree on what "the right move" is, so both use this.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type PuzzleMove = { san: string; from: string; to: string; promotion: string };
export type PgnPuzzle = { start: string; moves: PuzzleMove[]; valid: boolean };

export function extractHeader(pgn: string, name: string) {
  return pgn.match(new RegExp(`\\[${name}\\s+"([^"]+)"\\]`))?.[1];
}

export function normalizeBoardResourceFen(value?: string | null) {
  if (!value || value === "start") return "";
  return normalizePermissiveFen(value) || String(value).trim();
}

export function buildGame(fen?: string) {
  try {
    if (fen && fen !== "start") return new Chess(fen);
  } catch {
    const normalizedFen = normalizeBoardResourceFen(fen);
    if (normalizedFen) {
      try {
        const chess = new Chess();
        chess.load(normalizedFen, { skipValidation: true });
        return chess;
      } catch {
        // Fall through to the normal starting board.
      }
    }
  }
  return new Chess();
}

export function parsePgnPuzzle(pgn: string): PgnPuzzle {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const moves = game.history({ verbose: true }) as any[];
    const headerFen = extractHeader(pgn, "FEN");
    return {
      start: moves[0]?.before || headerFen || START_FEN,
      moves: moves.map((move) => ({ san: move.san, from: move.from, to: move.to, promotion: move.promotion || "q" })),
      valid: true,
    };
  } catch {
    const fen = normalizeBoardResourceFen(extractHeader(pgn, "FEN"));
    return { start: fen || START_FEN, moves: [], valid: Boolean(fen) };
  }
}

/** The colour the student plays: whoever is to move in the start position. */
export function puzzleStudentColor(puzzle: PgnPuzzle): "white" | "black" {
  return puzzle.start.trim().split(/\s+/)[1] === "b" ? "black" : "white";
}

/** The board after the first `ply` moves of the solution. */
export function puzzleFenAt(puzzle: PgnPuzzle, ply: number) {
  const game = buildGame(puzzle.start);
  for (const move of puzzle.moves.slice(0, Math.max(0, ply))) {
    if (!game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" })) break;
  }
  return game.fen();
}

export type PuzzleMoveVerdict =
  | { legal: false }
  | { legal: true; correct: false; san: string }
  | { legal: true; correct: true; san: string; ply: number; fen: string; solved: boolean; reply: PuzzleMove | null };

/**
 * Judges one student move made at `ply` (always a student turn). A correct move
 * also plays the opponent's reply, so `ply` comes back pointing at the
 * student's next turn - or past the end, when the position is solved.
 */
export function judgePuzzleMove(puzzle: PgnPuzzle, ply: number, attempt: { from: string; to: string; promotion?: string }): PuzzleMoveVerdict {
  if (ply >= puzzle.moves.length) return { legal: false };
  const game = buildGame(puzzleFenAt(puzzle, ply));
  let move: any = null;
  try {
    move = game.move({ from: attempt.from, to: attempt.to, promotion: attempt.promotion || "q" });
  } catch {
    move = null;
  }
  if (!move) return { legal: false };
  const expected = puzzle.moves[ply];
  if (move.san !== expected.san) return { legal: true, correct: false, san: move.san };
  let nextPly = ply + 1;
  let reply: PuzzleMove | null = null;
  if (nextPly < puzzle.moves.length) {
    const candidate = puzzle.moves[nextPly];
    try {
      if (game.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion || "q" })) {
        reply = candidate;
        nextPly += 1;
      }
    } catch {
      // A broken reply ends the line here.
    }
  }
  return { legal: true, correct: true, san: move.san, ply: nextPly, fen: game.fen(), solved: nextPly >= puzzle.moves.length, reply };
}
