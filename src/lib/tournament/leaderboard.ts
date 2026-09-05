/**
 * Applying compact leaderboard broadcasts to a client's standings table.
 *
 * The server sends rows as `[playerKey, points, gamesPlayed, wins]` rather than
 * whole standing documents, because this goes to every connected client each
 * time a board finishes. The client already knows each player's name and
 * rating, so it merges the numbers into what it has and takes the server's row
 * order as the ranking.
 */

export type LeaderboardRow = [string, number, number, number];

export function applyLeaderboardRows<T extends { playerKey: string }>(standings: T[], rows: LeaderboardRow[]): T[] {
  if (!rows?.length) return standings;
  const known = new Map(standings.map((entry) => [entry.playerKey, entry]));

  const merged = rows.map(([playerKey, points, gamesPlayed, wins]) => {
    const existing = known.get(playerKey);
    known.delete(playerKey);
    // A player we have never seen (joined since our last full load) still gets
    // a row, so the ranking stays complete until the next full refresh.
    return { ...(existing || ({ playerKey, displayName: playerKey } as unknown as T)), points, gamesPlayed, wins };
  });

  // Anyone the broadcast omitted keeps their last known values, appended after
  // the ranked rows rather than silently disappearing from the table.
  return [...merged, ...Array.from(known.values())] as T[];
}

export function rankOf(standings: Array<{ playerKey: string }>, playerKey: string) {
  if (!playerKey) return 0;
  const index = standings.findIndex((entry) => entry.playerKey === playerKey);
  return index < 0 ? 0 : index + 1;
}

export type PairingAnnouncement = {
  gameId: string;
  roundNumber: number;
  tableNumber: number;
  whiteKey: string;
  blackKey: string;
  whiteName: string;
  blackName: string;
};

/** Whether a batch of new pairings contains one for this player. */
export function findMyPairing(pairings: PairingAnnouncement[], playerKey: string) {
  if (!playerKey) return null;
  return pairings.find((pairing) => pairing.whiteKey === playerKey || pairing.blackKey === playerKey) || null;
}

/**
 * Fold newly announced pairings into a list of live boards, so a waiting player
 * sees the arena filling up without refetching anything.
 */
export function mergeLiveGames<T extends { _id: any; tableNumber?: number }>(liveGames: T[], pairings: PairingAnnouncement[], limit = 24): T[] {
  if (!pairings.length) return liveGames;
  const seen = new Set(liveGames.map((game) => String(game._id)));
  const added = pairings
    .filter((pairing) => !seen.has(String(pairing.gameId)))
    .map(
      (pairing) =>
        ({
          _id: pairing.gameId,
          tableNumber: pairing.tableNumber,
          roundNumber: pairing.roundNumber,
          whiteKey: pairing.whiteKey,
          blackKey: pairing.blackKey,
          whiteName: pairing.whiteName,
          blackName: pairing.blackName,
          status: "active",
          result: "*",
        }) as unknown as T
    );
  return [...liveGames, ...added]
    .sort((a, b) => Number(a.tableNumber || 0) - Number(b.tableNumber || 0))
    .slice(0, limit);
}
