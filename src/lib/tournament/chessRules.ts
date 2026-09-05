import { Chess } from "chess.js";

/**
 * Game position handling.
 *
 * The previous implementation rebuilt `new Chess(fen)` on every move, which
 * discarded position history. That made threefold repetition undetectable and
 * reduced stored PGN to a single move. Everything here replays the recorded SAN
 * history instead, so chess.js has the context its draw rules need.
 */

export type TerminationReason =
  | "checkmate"
  | "stalemate"
  | "repetition"
  | "fifty_moves"
  | "insufficient_material";

export type DetectedResult = {
  result: "1-0" | "0-1" | "1/2-1/2";
  termination: TerminationReason;
  winnerColor: "white" | "black" | "";
};

export const STANDARD_START_FEN = new Chess().fen();

function isStandardStart(fen?: string | null) {
  const value = String(fen || "").trim();
  return !value || value === "start" || value === STANDARD_START_FEN;
}

/**
 * Rebuild a game from its move history. `startFen` supports the custom starting
 * position feature; standard games pass nothing.
 *
 * Throws if the history is not replayable, which means the stored history and
 * the stored FEN have diverged and the game needs manual attention.
 */
export function replayGame(moveHistorySAN: string[] | null | undefined, startFen?: string | null): Chess {
  const chess = isStandardStart(startFen) ? new Chess() : new Chess(String(startFen));
  for (const san of moveHistorySAN || []) {
    const move = chess.move(san);
    if (!move) throw new Error(`Unreplayable move history at "${san}".`);
  }
  return chess;
}

/**
 * Load a game position, preferring a full replay and falling back to the stored
 * FEN when the history cannot be replayed. The fallback keeps a damaged game
 * playable; it loses only repetition detection for that game.
 */
export function loadGamePosition(game: {
  moveHistorySAN?: string[] | null;
  fen?: string | null;
  startFen?: string | null;
}): { chess: Chess; replayed: boolean } {
  try {
    return { chess: replayGame(game.moveHistorySAN, game.startFen), replayed: true };
  } catch {
    const fen = String(game.fen || "");
    return { chess: isStandardStart(fen) ? new Chess() : new Chess(fen), replayed: false };
  }
}

function halfmoveClock(chess: Chess) {
  return Number(String(chess.fen()).split(" ")[4] || 0);
}

/**
 * Detect a finished game. Gated on `isGameOver`/`isDraw` so no draw condition
 * can be silently omitted, then attributed to a specific reason.
 */
export function detectTermination(chess: Chess): DetectedResult | null {
  if (chess.isCheckmate()) {
    return chess.turn() === "w"
      ? { result: "0-1", termination: "checkmate", winnerColor: "black" }
      : { result: "1-0", termination: "checkmate", winnerColor: "white" };
  }
  if (!chess.isDraw()) return null;
  const termination: TerminationReason = chess.isStalemate()
    ? "stalemate"
    : chess.isInsufficientMaterial()
      ? "insufficient_material"
      : chess.isThreefoldRepetition()
        ? "repetition"
        : halfmoveClock(chess) >= 100
          ? "fifty_moves"
          : "repetition";
  return { result: "1/2-1/2", termination, winnerColor: "" };
}

export type PgnHeaders = {
  event?: string;
  site?: string;
  date?: Date | string;
  round?: string | number;
  white?: string;
  black?: string;
  result?: string;
  timeControl?: string;
  termination?: string;
  startFen?: string | null;
};

/** Build a complete, importable PGN from the replayed game. */
export function buildPgn(moveHistorySAN: string[] | null | undefined, headers: PgnHeaders) {
  const chess = replayGame(moveHistorySAN, headers.startFen);
  const date = headers.date ? new Date(headers.date) : null;
  const tags: Array<[string, string]> = [
    ["Event", String(headers.event || "Tournament")],
    ["Site", String(headers.site || "Envision Chess Academy")],
    ["Date", date ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}` : "????.??.??"],
    ["Round", String(headers.round ?? "-")],
    ["White", String(headers.white || "?")],
    ["Black", String(headers.black || "?")],
    ["Result", String(headers.result || "*")],
  ];
  if (headers.timeControl) tags.push(["TimeControl", String(headers.timeControl)]);
  if (headers.termination) tags.push(["Termination", String(headers.termination)]);
  if (!isStandardStart(headers.startFen)) {
    tags.push(["SetUp", "1"]);
    tags.push(["FEN", String(headers.startFen)]);
  }
  for (const [key, value] of tags) chess.header(key, value);
  return chess.pgn();
}
