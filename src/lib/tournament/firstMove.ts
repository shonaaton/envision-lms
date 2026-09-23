/**
 * First-move deadlines and no-shows.
 *
 * A board nobody starts must end, or a Swiss round never finishes. What it ends
 * as depends on who was there:
 *
 *   Arena  — White not moving aborts the board. Nobody is scored; both
 *            players go straight back into the pairing pool.
 *   Swiss  — the player to move who never moves forfeits to an opponent who
 *            showed up. White not moving with Black never having opened the
 *            board either is a double no-show: aborted, nobody scored. Black
 *            gets a deadline for their first move too, so a present White is
 *            not left waiting out Black's entire clock.
 *
 * Only the player *to move* can push their own deadline back by having the
 * board open, and only up to a cap. Previously either player's presence
 * extended it, so a waiting opponent kept an absent player's board alive
 * forever and the round never ended.
 */

export const FIRST_MOVE_GRACE_MS = 60 * 1000;
/** However long the player to move keeps the board open, the wait never exceeds this. */
export const FIRST_MOVE_MAX_WAIT_MS = 3 * 60 * 1000;

export type FirstMoveGame = {
  source?: string;
  status?: string;
  ply?: number;
  moveHistorySAN?: string[];
  firstMoveDeadlineAt?: Date | string | null;
  startedAt?: Date | string | null;
  createdAt?: Date | string | null;
  lastMoveAt?: Date | string | null;
  blackOnlineAt?: Date | string | null;
};

function time(value: any) {
  return value ? new Date(value).getTime() : 0;
}

function plyOf(game: FirstMoveGame) {
  return Number(game.ply ?? (game.moveHistorySAN || []).length ?? 0);
}

/** Which side still owes its first move, if either does. */
export function sideOwingFirstMove(game: FirstMoveGame): "white" | "black" | null {
  if (game.status !== "active") return null;
  const ply = plyOf(game);
  if (ply === 0) return "white";
  if (ply === 1 && game.source === "swiss") return "black";
  return null;
}

/** When the deadline for the side owing its first move started counting. */
function anchorOf(game: FirstMoveGame) {
  return plyOf(game) === 0 ? time(game.startedAt || game.createdAt) : time(game.lastMoveAt);
}

/**
 * The deadline after a presence ping from `color`, or null when it should not
 * move. Only the player to move extends it, never past the cap.
 */
export function extendedFirstMoveDeadline(game: FirstMoveGame, color: "white" | "black", now: number = Date.now()) {
  const owing = sideOwingFirstMove(game);
  if (!owing || owing !== color) return null;
  const current = time(game.firstMoveDeadlineAt);
  const anchor = anchorOf(game);
  const cap = anchor ? anchor + FIRST_MOVE_MAX_WAIT_MS : Infinity;
  const extended = Math.min(now + FIRST_MOVE_GRACE_MS, cap);
  return extended > current ? new Date(extended) : null;
}

export type NoShowOutcome =
  | { action: "none" }
  | { action: "abort"; absent: Array<"white" | "black"> }
  | { action: "forfeit"; winner: "white" | "black"; absent: Array<"white" | "black"> };

/** What to do with a board whose first-move deadline may have passed. */
export function noShowOutcome(game: FirstMoveGame, now: number = Date.now()): NoShowOutcome {
  const owing = sideOwingFirstMove(game);
  const deadline = time(game.firstMoveDeadlineAt);
  if (!owing || !deadline || deadline > now) return { action: "none" };

  if (game.source !== "swiss") return { action: "abort", absent: [] };
  if (owing === "black") return { action: "forfeit", winner: "white", absent: ["black"] };
  // White never moved. Black only earns the point by having turned up.
  if (game.blackOnlineAt) return { action: "forfeit", winner: "black", absent: ["white"] };
  return { action: "abort", absent: ["white", "black"] };
}
