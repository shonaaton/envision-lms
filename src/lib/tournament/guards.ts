/**
 * The conditional-update filters that make concurrent tournament writes safe.
 *
 * Every one of these is the *whole* of a safety guarantee: a move applies at
 * most once, a pairing pass has one writer, a Swiss round is generated once, a
 * result is recorded once. They were previously written inline at each call
 * site, where their exact shape was hard to see and impossible to test.
 *
 * Defining them here means the race tests drive the real filters rather than a
 * paraphrase of them.
 */

export type Filter = Record<string, any>;

/**
 * A move commits only if the game is still active, still on the same turn, and
 * still at the ply the client believed it was moving from.
 *
 * The `$exists` branch covers games created before `ply` was introduced: they
 * match on their first move after deploy and are guarded normally thereafter.
 */
export function moveGuard(gameId: unknown, turn: "w" | "b", currentPly: number): Filter {
  const plyGuard = currentPly === 0 ? [{ ply: currentPly }, { ply: { $exists: false } }] : [{ ply: currentPly }];
  return { _id: gameId, status: "active", turn, $or: plyGuard };
}

/** A game may be finished, by any route, only while it is still running. */
export function finishGameGuard(gameId: unknown): Filter {
  return { _id: gameId, status: "active" };
}

/** Each side may berserk once, and only before the game has left the start. */
export function berserkGuard(gameId: unknown, side: "white" | "black"): Filter {
  return { _id: gameId, status: "active", ...(side === "white" ? { berserkWhite: false } : { berserkBlack: false }) };
}

/** The pairing lock is free if nobody holds it or the holder's claim expired. */
export function acquirePairingLockGuard(tournamentId: unknown, at: Date): Filter {
  return {
    _id: tournamentId,
    $or: [{ "pairingLock.expiresAt": { $exists: false } }, { "pairingLock.expiresAt": { $lte: at } }],
  };
}

/** Only the holder may release it, so a late finisher cannot free someone else's lock. */
export function releasePairingLockGuard(tournamentId: unknown, token: string): Filter {
  return { _id: tournamentId, "pairingLock.token": token };
}

/**
 * Claiming round n requires the tournament still to be on round n-1. Two
 * callers racing to create the same round: the second matches nothing.
 */
export function claimRoundGuard(tournamentId: unknown, expectedCurrentRound: number, at: Date): Filter {
  return {
    _id: tournamentId,
    currentRound: expectedCurrentRound,
    $or: [{ "roundLock.expiresAt": { $exists: false } }, { "roundLock.expiresAt": { $lte: at } }],
  };
}

export function releaseRoundGuard(tournamentId: unknown, token: string): Filter {
  return { _id: tournamentId, "roundLock.token": token };
}

/* ------------------------------------------------------------------ */
/* Filter evaluation                                                   */
/* ------------------------------------------------------------------ */

function valueAtPath(document: any, path: string) {
  return path.split(".").reduce((current: any, key) => (current === undefined || current === null ? undefined : current[key]), document);
}

function matchesOperator(value: any, operator: string, operand: any): boolean {
  switch (operator) {
    case "$exists":
      return (value !== undefined) === Boolean(operand);
    case "$lte":
      return value !== undefined && value !== null && new Date(value).getTime() <= new Date(operand).getTime();
    case "$lt":
      return value !== undefined && value !== null && new Date(value).getTime() < new Date(operand).getTime();
    case "$gte":
      return value !== undefined && value !== null && new Date(value).getTime() >= new Date(operand).getTime();
    case "$ne":
      return String(value) !== String(operand);
    case "$in":
      return Array.isArray(operand) && operand.some((entry) => String(entry) === String(value));
    default:
      return false;
  }
}

/**
 * Evaluate one of the filters above against a document, using the subset of
 * MongoDB's query semantics they actually rely on.
 *
 * This exists so the race tests can run the real guards deterministically,
 * without a database and without sleeping and hoping a race occurs.
 */
export function matchesFilter(document: any, filter: Filter): boolean {
  if (!document) return false;

  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$or") {
      const branches = condition as Filter[];
      if (!branches.some((branch) => matchesFilter(document, branch))) return false;
      continue;
    }

    const value = valueAtPath(document, key);

    if (condition && typeof condition === "object" && !Array.isArray(condition) && !(condition instanceof Date)) {
      const operators = Object.entries(condition as Record<string, any>);
      if (operators.every(([operator]) => operator.startsWith("$"))) {
        if (!operators.every(([operator, operand]) => matchesOperator(value, operator, operand))) return false;
        continue;
      }
    }

    // Mongo treats a missing field and an explicit null as equal; nothing else
    // in these filters relies on loose comparison.
    if (condition === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }
    if (String(value) !== String(condition)) return false;
  }

  return true;
}
