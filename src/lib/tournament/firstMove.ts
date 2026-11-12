/**
 * First-move deadlines and no-shows, as Lichess does it.
 *
 * lila Game.timeForFirstMove gives each side a fixed time to make its first
 * move: 11 / 16 / 21 / 25 / 30 seconds in tournaments, by speed (see
 * lichessRules.firstMoveSeconds). White's starts when the board appears;
 * Black's when White moves. It is not extended for having the board open.
 *
 * lila Finisher.noStart: tournament games cannot be aborted, so the player who
 * did not move loses and the opponent wins - in Arena and Swiss alike - and
 * the player who did not move is taken out of pairing (paused here) until
 * they come back. Only that player is paused.
 */

/** Fallback when a game has no clock to derive the time from (lila's slowest tournament value). */
export const FIRST_MOVE_GRACE_MS = 30 * 1000;

export type FirstMoveGame = {
  source?: string;
  status?: string;
  ply?: number;
  turn?: "w" | "b";
  moveHistorySAN?: string[];
  firstMoveDeadlineAt?: Date | string | null;
  startedAt?: Date | string | null;
  createdAt?: Date | string | null;
  lastMoveAt?: Date | string | null;
  whiteOnlineAt?: Date | string | null;
  blackOnlineAt?: Date | string | null;
};

function time(value: any) {
  return value ? new Date(value).getTime() : 0;
}

function plyOf(game: FirstMoveGame) {
  return Number(game.ply ?? (game.moveHistorySAN || []).length ?? 0);
}

/** Which side still owes its first move, if either does (lila playerWhoDidNotMove). */
export function sideOwingFirstMove(game: FirstMoveGame): "white" | "black" | null {
  if (game.status !== "active") return null;
  const ply = plyOf(game);
  if (ply >= 2) return null;
  const turn = game.turn ?? (ply === 0 ? "w" : "b");
  return turn === "w" ? "white" : "black";
}

export type NoShowOutcome =
  | { action: "none" }
  | { action: "forfeit"; winner: "white" | "black"; absent: Array<"white" | "black"> };

/** What to do with a board whose first-move deadline may have passed. */
export function noShowOutcome(game: FirstMoveGame, now: number = Date.now()): NoShowOutcome {
  const owing = sideOwingFirstMove(game);
  const deadline = time(game.firstMoveDeadlineAt);
  if (!owing || !deadline || deadline > now) return { action: "none" };
  return { action: "forfeit", winner: owing === "white" ? "black" : "white", absent: [owing] };
}
