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

type Entry = { sockets: number; seenAt: number; leaveTimer?: ReturnType<typeof setTimeout> | null };

/** Told when a player arrives in or leaves a room, so pages can show who is online. */
export type PresenceNotifier = (tournamentId: string, playerKey: string, online: boolean) => void;

declare global {
  // eslint-disable-next-line no-var
  var _tournamentPresence: Map<string, Map<string, Entry>> | undefined;
  // eslint-disable-next-line no-var
  var _tournamentPresenceNotifier: PresenceNotifier | undefined;
}

/** The socket server registers this once; nothing is sent without it. */
export function setPresenceNotifier(notifier: PresenceNotifier | undefined) {
  globalThis._tournamentPresenceNotifier = notifier;
}

function notify(tournamentId: string, playerKey: string, online: boolean) {
  try {
    globalThis._tournamentPresenceNotifier?.(String(tournamentId), playerKey, online);
  } catch {
    // Showing a dot must never break pairing or a socket handler.
  }
}

function wasPresent(entry: Entry, now: number) {
  return entry.sockets > 0 || (entry.seenAt > 0 && now - entry.seenAt <= PRESENCE_GRACE_MS);
}

/**
 * With no socket left, a player drops out once the grace runs out. Nothing
 * else happens at that moment, so a timer checks and announces it.
 */
function armLeaveCheck(tournamentId: string, playerKey: string, entry: Entry) {
  if (entry.leaveTimer) clearTimeout(entry.leaveTimer);
  entry.leaveTimer = null;
  if (entry.sockets > 0) return;
  const timer = setTimeout(() => {
    entry.leaveTimer = null;
    if (!isPlayerPresent(tournamentId, playerKey)) notify(tournamentId, playerKey, false);
  }, PRESENCE_GRACE_MS + 500);
  (timer as any).unref?.();
  entry.leaveTimer = timer;
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
  const arrived = !wasPresent(entry, now);
  // Logged only on arrival, so pairing gaps can be explained afterwards.
  if (arrived) console.info(`[tournament] presence ${tournamentId} ${playerKey} entered the room`);
  entry.sockets += 1;
  entry.seenAt = now;
  armLeaveCheck(tournamentId, playerKey, entry);
  if (arrived) notify(tournamentId, playerKey, true);
}

export function playerSocketClosed(tournamentId: string, playerKey: string, now = Date.now()) {
  if (!tournamentId || !playerKey) return;
  const entry = entryFor(tournamentId, playerKey);
  entry.sockets = Math.max(0, entry.sockets - 1);
  entry.seenAt = now;
  if (entry.sockets === 0) console.info(`[tournament] presence ${tournamentId} ${playerKey} closed their last connection (present ${PRESENCE_GRACE_MS / 1000}s more)`);
  armLeaveCheck(tournamentId, playerKey, entry);
}

/** An HTTP sign of life: the play room's state poll. */
export function playerSeen(tournamentId: string, playerKey: string, now = Date.now()) {
  if (!tournamentId || !playerKey) return;
  const entry = entryFor(tournamentId, playerKey);
  const arrived = !wasPresent(entry, now);
  entry.seenAt = now;
  armLeaveCheck(tournamentId, playerKey, entry);
  if (arrived) notify(tournamentId, playerKey, true);
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
  store().get(String(tournamentId))?.forEach((entry) => {
    if (entry.leaveTimer) clearTimeout(entry.leaveTimer);
  });
  store().delete(String(tournamentId));
}
