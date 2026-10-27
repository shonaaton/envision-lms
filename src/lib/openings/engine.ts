import { Chess } from "chess.js";
import type { OpeningArrow, OpeningChapter, OpeningHighlight, OpeningStep } from "./types";

/**
 * Turns a chapter's steps into the positions the player shows.
 *
 * Pure and free of the database, so the content test, the server pages and
 * anything in the browser get the same answer. An authoring mistake (an illegal
 * move, a quiz answer that is not legal, an arrow to "z9") stops the replay and
 * is reported, instead of the board silently stopping halfway.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type EcoName = { eco: string; name: string };
/** Names a position by its FEN, or returns null when lichess has no name for it. */
export type EcoLookup = (fen: string) => EcoName | null;

export type FrameMove = { san: string; from: string; to: string; label: string };

export type ChapterFrame = {
  index: number;
  kind: OpeningStep["kind"];
  title?: string;
  text: string;
  /** The position to show. For a quiz, the position once the answer is played. */
  fen: string;
  /** The move that produced `fen`, for move and quiz steps. */
  move?: FrameMove;
  arrows: OpeningArrow[];
  highlights: OpeningHighlight[];
  quiz?: { prompt: string; hint?: string; answers: string[]; beforeFen: string };
  points?: string[];
  /** The most specific lichess name reached so far along the line. */
  opening?: EcoName;
};

export type ChapterTimeline = {
  /** The position after the setup moves, before step one. */
  startFen: string;
  setup: FrameMove[];
  frames: ChapterFrame[];
  error?: string;
};

const SQUARE = /^[a-h][1-8]$/;

/** "Nf3+" and "Nf3" are the same answer; so are "e8=Q#" and "e8=Q". */
export function normalizeSan(san: string) {
  return san.trim().replace(/[+#!?]+$/g, "");
}

function moveLabel(fenBefore: string, san: string) {
  const [, turn, , , , fullmove] = fenBefore.split(" ");
  return turn === "w" ? `${fullmove}. ${san}` : `${fullmove}... ${san}`;
}

function play(game: Chess, san: string): FrameMove | null {
  const before = game.fen();
  try {
    const played: any = game.move(san);
    if (!played) return null;
    return { san: String(played.san), from: String(played.from), to: String(played.to), label: moveLabel(before, String(played.san)) };
  } catch {
    return null;
  }
}

function checkMarks(step: OpeningStep, where: string): string | undefined {
  for (const [from, to] of step.arrows || []) {
    if (!SQUARE.test(from) || !SQUARE.test(to)) return `${where}: arrow ${from}-${to} is not between two squares.`;
  }
  for (const [square] of step.highlights || []) {
    if (!SQUARE.test(square)) return `${where}: "${square}" is not a square.`;
  }
  return undefined;
}

export function buildChapterTimeline(chapter: OpeningChapter, ecoAt?: EcoLookup): ChapterTimeline {
  const game = new Chess();
  let opening: EcoName | undefined;
  const name = () => {
    const found = ecoAt?.(game.fen());
    if (found) opening = found;
    return opening;
  };

  const setup: FrameMove[] = [];
  for (const san of chapter.setupMoves || []) {
    const played = play(game, san);
    if (!played) return { startFen: game.fen(), setup, frames: [], error: `Setup move ${san} is not legal after ${setup.map((m) => m.san).join(" ") || "the start"}.` };
    setup.push(played);
    name();
  }
  const startFen = game.fen();

  const frames: ChapterFrame[] = [];
  for (const [index, step] of chapter.steps.entries()) {
    const where = `Step ${index + 1} (${step.kind})`;
    const markError = checkMarks(step, where);
    if (markError) return { startFen, setup, frames, error: markError };

    const base = {
      index,
      kind: step.kind,
      title: step.title,
      text: step.text,
      arrows: step.arrows || [],
      highlights: step.highlights || [],
    };

    if (step.kind === "move") {
      const played = play(game, step.move);
      if (!played) return { startFen, setup, frames, error: `${where}: ${step.move} is not legal here.` };
      frames.push({ ...base, fen: game.fen(), move: played, opening: name() });
      continue;
    }

    if (step.kind === "quiz") {
      if (!step.answer.length) return { startFen, setup, frames, error: `${where}: the quiz has no answer.` };
      const beforeFen = game.fen();
      for (const answer of step.answer) {
        const probe = new Chess(beforeFen);
        if (!play(probe, answer)) return { startFen, setup, frames, error: `${where}: answer ${answer} is not legal here.` };
      }
      const played = play(game, step.answer[0])!;
      frames.push({
        ...base,
        fen: game.fen(),
        move: played,
        quiz: { prompt: step.prompt, hint: step.hint, answers: step.answer.map(normalizeSan), beforeFen },
        opening: name(),
      });
      continue;
    }

    frames.push({
      ...base,
      fen: game.fen(),
      points: step.kind === "summary" ? step.points : undefined,
      opening: name() ?? opening,
    });
  }

  return { startFen, setup, frames };
}

/** Whether a move the student played answers the quiz. */
export function answersQuiz(frame: ChapterFrame, san: string) {
  return Boolean(frame.quiz?.answers.includes(normalizeSan(san)));
}
