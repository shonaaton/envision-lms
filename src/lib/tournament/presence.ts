/**
 * Who is in the tournament room right now.
 *
 * An Arena pairs only players who are present, as on Lichess. Before this,
 * every registered player was paired, so an absent player's opponent sat out
 * up to a minute (the first-move deadline) on a board nobody would play.
 *
 * A player is present while they hold an open tournament socket (the event
 * page or the play room, in any tab, visible or not), or for a short grace
 * after their last sign of life: the socket closing, or an HTTP state poll.
 * The poll is the fallback that keeps pairing working on a night the socket
 * cannot connect (7 Oct 2026); the grace covers a page change or a reconnect.
 *
 * In memory, on globalThis: the socket server, the route handlers and the
 * lifecycle worker run in the one server process but can load this module
 * more than once. After a restart the room fills again within seconds as
 * clients reconnect and poll.
 */

export const PRESENCE_GRACE_MS = 30_000;

type Entry = { sockets: number; seenAt: number };

declare global {
  // eslint-disable-next-line no-var
  var _tournamentPresence: Map<string, Map<string, Entry>> | undefined;
}

function store() {
  if (!globalThis._tournamentPresence) globalThis._tournamentPresence = new Map();
  return globalThis._tournamentPresence;
}

function entryFor(tournamentId: string, playerKey: string) {
  const id = String(tournamentId);
  let room = store().get(id);
  if (!room) {
    room = new Map();
    store().set(id, room);
  }
  let entry = room.get(playerKey);
  if (!entry) {
    entry = { sockets: 0, seenAt: 0 };
    room.set(playerKey, entry);
  }
  return entry;
}

export function playerSocketOpened(tournamentId: string, playerKey: string, now = Date.now()) {
  if (!tournamentId || !playerKey) return;
  const entry = entryFor(tournamentId, playerKey);
  entry.sockets += 1;
  entry.seenAt = now;
}

export function playerSocketClosed(tournamentId: string, playerKey: string, now = Date.now()) {
  if (!tournamentId || !playerKey) return;
  const entry = entryFor(tournamentId, playerKey);
  entry.sockets = Math.max(0, entry.sockets - 1);
  entry.seenAt = now;
}

/** An HTTP sign of life: the play room's state poll. */
export function playerSeen(tournamentId: string, playerKey: string, now = Date.now()) {
  if (!tournamentId || !playerKey) return;
  entryFor(tournamentId, playerKey).seenAt = now;
}

export function isPlayerPresent(tournamentId: string, playerKey: string, now = Date.now()) {
  const entry = store().get(String(tournamentId))?.get(playerKey);
  if (!entry) return false;
  return entry.sockets > 0 || now - entry.seenAt <= PRESENCE_GRACE_MS;
}

export function presentPlayerKeys(tournamentId: string, now = Date.now()) {
  const room = store().get(String(tournamentId));
  const keys = new Set<string>();
  if (!room) return keys;
  room.forEach((entry, key) => {
    if (entry.sockets > 0 || now - entry.seenAt <= PRESENCE_GRACE_MS) keys.add(key);
  });
  return keys;
}

/** Drop a finished event's room. */
export function forgetTournamentPresence(tournamentId: string) {
  store().delete(String(tournamentId));
}
