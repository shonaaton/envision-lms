import { Tournament } from "@/models/Tournament";

/**
 * Shared reads for the requests a live tournament sends every few seconds
 * (moves, presence, state polls).
 *
 * At 25 boards those requests arrive several times a second, and each one used
 * to re-read the same tournament fields and the same student record. On the
 * production database every read is a network round trip and counts against
 * the cluster's operation limit, so the lag grew with the number of boards.
 */

declare global {
  // eslint-disable-next-line no-var
  var _tournamentHotPathCache: Map<string, { at: number; value: Promise<any> }> | undefined;
}

function cache() {
  return (globalThis._tournamentHotPathCache ??= new Map());
}

/**
 * Read once and share for `ttlMs`. Callers arriving while the read is in flight
 * wait for that same read instead of starting their own. A failed read is not
 * kept.
 */
export function sharedRead<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const store = cache();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  if (store.size > 2000) {
    for (const [entryKey, entry] of store) if (now - entry.at > 60_000) store.delete(entryKey);
  }
  const value = load().catch((error) => {
    if (store.get(key)?.value === value) store.delete(key);
    throw error;
  });
  store.set(key, { at: now, value });
  return value;
}

/** Forget cached reads for a tournament, after a change that must show at once. */
export function forgetTournamentHotPath(tournamentId: string) {
  const prefix = `t:${tournamentId}:`;
  for (const key of cache().keys()) if (key.startsWith(prefix)) cache().delete(key);
}

/**
 * The guest invite token, which is all a move or presence request needs from
 * the tournament. It only changes when an admin regenerates the invite link;
 * 30 seconds of a superseded token being honoured is harmless (the guest
 * cookie is still signed and checked against the seat).
 */
export function tournamentInviteToken(tournamentId: string): Promise<{ exists: boolean; token: string }> {
  return sharedRead(`t:${tournamentId}:invite`, 30_000, async () => {
    const tournament: any = await Tournament.findById(tournamentId).select("externalInvite.token").lean();
    return { exists: Boolean(tournament), token: String(tournament?.externalInvite?.token || "") };
  });
}

/**
 * Whether a signed-in student is still active, from the session `auth()` just
 * built. `auth()` re-reads the account on every request (through the
 * permission cache, which any deactivation clears), so this is the same answer
 * `isCurrentStudent` gets from a second, uncached read of the same user.
 */
export function sessionStudentIsActive(session: any) {
  const user = session?.user;
  return Boolean(user) && user.role === "student" && user.isActive !== false;
}
