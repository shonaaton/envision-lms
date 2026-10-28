import { Chess } from "chess.js";

/**
 * The question line shown above an exam position. Homework PGNs rarely carry
 * one, so when the PGN has no comment before its first move the line is
 * written from what the position itself says: who is to move, whether the
 * solution ends in mate, how long the line is and the topic's theme. Admins
 * can rewrite it on the paper.
 */

export const POSITION_QUESTION_MAX = 240;

const THEMES: [RegExp, string][] = [
  [/smother/, "Find the smothered mate."],
  [/back[\s-]*rank/, "Use the weak back rank."],
  [/windmill/, "Set up the windmill."],
  [/zwischen|in[\s-]*between|intermediate move/, "Find the in-between move."],
  [/discover/, "Find the discovered attack."],
  [/double (attack|check)/, "Find the double attack."],
  [/fork/, "Find the fork."],
  [/skewer/, "Find the skewer."],
  [/\bpin/, "Use the pin to win material."],
  [/decoy|attraction/, "Lure a piece onto a bad square."],
  [/deflect/, "Deflect the defender."],
  [/overload/, "Exploit the overloaded defender."],
  [/remov\w* (the )?(defender|guard)|undermin/, "Remove the defender."],
  [/interfer/, "Find the interference."],
  [/clearance/, "Clear the line with tempo."],
  [/x[\s-]*ray/, "Use the x-ray."],
  [/trap/, "Trap the piece."],
  [/promot|queening|passed pawn/, "Get the pawn through to promote."],
  [/stalemate/, "Find the saving stalemate idea."],
  [/sacrific|combination/, "Find the winning combination."],
  [/mate|checkmat|attack (on )?the king|king hunt/, "Find the attack on the king."],
  [/endgame|ending/, "Find the winning plan in this ending."],
  [/open(ing)?\b|develop/, "Find the best developing move."],
  [/defen[cs]e|defend/, "Find the best defence."],
  [/capture|winning material|hanging/, "Win material."],
];

/** A question written into the PGN: a `{comment}` before the first move. */
export function pgnLeadingComment(pgn: string) {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history({ verbose: true }) as any[];
    const startFen = history[0]?.before;
    const comment = (game.getComments() || []).find((item) => item.fen === startFen)?.comment;
    const clean = String(comment || "").replace(/\s+/g, " ").trim();
    return clean.length >= 4 ? clean.slice(0, POSITION_QUESTION_MAX) : "";
  } catch {
    return "";
  }
}

export function generatedPositionQuestion(input: { topicName?: string; studentColor?: "white" | "black"; solution?: string[] }) {
  const side = input.studentColor === "black" ? "Black" : "White";
  const solution = input.solution || [];
  const studentMoves = Math.max(1, Math.ceil(solution.length / 2));
  if (solution.length && /#$/.test(solution[solution.length - 1])) return `${side} to play and mate in ${studentMoves}.`;
  const topic = String(input.topicName || "").toLowerCase();
  const theme = THEMES.find(([pattern]) => pattern.test(topic))?.[1] || "Find the best move.";
  return `${side} to play. ${theme}${studentMoves > 1 ? ` Play the whole line (${studentMoves} moves).` : ""}`;
}

export function positionQuestionFor(input: { question?: string; pgn?: string; topicName?: string; studentColor?: "white" | "black"; solution?: string[] }) {
  const own = String(input.question || "").trim();
  if (own) return own;
  return (input.pgn && pgnLeadingComment(input.pgn)) || generatedPositionQuestion(input);
}

export function cleanPositionQuestion(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, POSITION_QUESTION_MAX);
}
