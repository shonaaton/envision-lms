/**
 * Small Arena pairing inputs, as pure functions. The pairing itself follows
 * Lichess and lives in arenaLichess.ts.
 */

export type GameEdge = { whiteKey: string; blackKey: string; status: string; createdAt?: any; startedAt?: any };

/** Each player's most recent opponent (lila PairingRepo.lastOpponents). */
export function mostRecentOpponents(games: GameEdge[]) {
  const sorted = [...games]
    .filter((game) => game.blackKey)
    .sort((a, b) => new Date(b.createdAt || b.startedAt || 0).getTime() - new Date(a.createdAt || a.startedAt || 0).getTime());
  const map = new Map<string, string>();
  for (const game of sorted) {
    if (!map.has(game.whiteKey)) map.set(game.whiteKey, game.blackKey);
    if (!map.has(game.blackKey)) map.set(game.blackKey, game.whiteKey);
  }
  return map;
}

/**
 * When a player became free to be paired: their last game's end, or when they
 * joined or resumed, whichever is later (lila WaitingUsers keeps the time a
 * player started waiting).
 */
export function freeSinceMs(input: { lastGameEndedAt?: number | null; queuedAt?: number | null; joinedAt?: number | null; startedAt?: number | null }) {
  return Math.max(Number(input.lastGameEndedAt || 0), Number(input.queuedAt || 0), Number(input.joinedAt || 0), Number(input.startedAt || 0));
}
