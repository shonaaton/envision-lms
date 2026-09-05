import type { Server as SocketIOServer } from "socket.io";
import { createCoalescer, type Coalescer } from "@/lib/tournament/coalesce";

declare global {
  var _tournamentSocketIo: SocketIOServer | undefined;
}

/**
 * Two rooms, deliberately.
 *
 * The tournament room carries lobby-level facts: pairings, standings deltas,
 * round transitions. The game room carries one board's moves and clock. A move
 * on board 17 reaches the two players and whoever is watching that board — not
 * everybody in the event.
 */
export function tournamentRoomName(tournamentId: string) {
  return `tournament:${String(tournamentId || "").trim()}`;
}

export function tournamentGameRoomName(gameId: string) {
  return `tournament-game:${String(gameId || "").trim()}`;
}

export function registerTournamentSocketServer(io: SocketIOServer) {
  global._tournamentSocketIo = io;
}

export function getTournamentSocketServer() {
  return global._tournamentSocketIo;
}

/* ------------------------------------------------------------------ */
/* Game-room events                                                    */
/* ------------------------------------------------------------------ */

export type GameMoveEvent = {
  gameId: string;
  ply: number;
  san: string;
  uci: string;
  fen: string;
  turn: "w" | "b";
  whiteClockMs: number;
  blackClockMs: number;
  lastMoveAt: number;
  status: string;
  result: string;
};

export type GameEndedEvent = {
  gameId: string;
  tournamentId: string;
  status: string;
  result: string;
  termination: string;
  winnerKey: string;
  fen: string;
  ply: number;
};

export type GameClockSyncEvent = {
  gameId: string;
  ply: number;
  whiteClockMs: number;
  blackClockMs: number;
  turn: "w" | "b";
  serverNow: number;
};

export type GameFlagEvent = {
  gameId: string;
  drawOfferBy?: string;
  berserkWhite?: boolean;
  berserkBlack?: boolean;
  whiteClockMs?: number;
  blackClockMs?: number;
};

function emitToGame(gameId: string, event: string, payload: unknown) {
  const io = getTournamentSocketServer();
  if (!io || !gameId) return;
  io.to(tournamentGameRoomName(gameId)).emit(event, payload);
}

function emitToTournament(tournamentId: string, event: string, payload: unknown) {
  const io = getTournamentSocketServer();
  if (!io || !tournamentId) return;
  io.to(tournamentRoomName(tournamentId)).emit(event, payload);
}

export function emitGameMove(payload: GameMoveEvent) {
  emitToGame(payload.gameId, "game:move", payload);
}

export function emitGameEnded(payload: GameEndedEvent) {
  emitToGame(payload.gameId, "game:ended", payload);
  // The lobby needs to know a board finished, but not the moves that got there.
  emitToTournament(payload.tournamentId, "tournament:game-ended", {
    gameId: payload.gameId,
    result: payload.result,
    termination: payload.termination,
    winnerKey: payload.winnerKey,
  });
}

export function emitGameClockSync(payload: GameClockSyncEvent) {
  emitToGame(payload.gameId, "game:clock-sync", payload);
}

export function emitGameFlags(payload: GameFlagEvent) {
  emitToGame(payload.gameId, "game:flags", payload);
}

/* ------------------------------------------------------------------ */
/* Tournament-room events                                              */
/* ------------------------------------------------------------------ */

export type PairingCreatedEvent = {
  tournamentId: string;
  gameId: string;
  roundNumber: number;
  tableNumber: number;
  whiteKey: string;
  blackKey: string;
  whiteName: string;
  blackName: string;
};

/**
 * A pairing pass in a large arena creates dozens of games at once. Emitting one
 * event per game would have every client react dozens of times, so pairings are
 * batched into a single event and each client picks out the one that is theirs
 * by player key.
 */
export function emitPairingsCreated(tournamentId: string, pairings: PairingCreatedEvent[]) {
  if (!pairings.length) return;
  emitToTournament(tournamentId, "tournament:pairing-created", { tournamentId, pairings, at: Date.now() });
}

/**
 * Compact leaderboard rows: `[playerKey, points, gamesPlayed, wins]`.
 *
 * Arrays rather than objects, and without score histories or tie-break
 * internals, because this goes to every connected client every time a board
 * finishes. A 200-player field costs a few kilobytes instead of tens.
 */
export type LeaderboardRow = [string, number, number, number];

export function toLeaderboardRows(standings: any[]): LeaderboardRow[] {
  return (standings || []).map((entry: any) => [
    String(entry.playerKey),
    Number(entry.points || 0),
    Number(entry.gamesPlayed || 0),
    Number(entry.wins || 0),
  ]);
}

declare global {
  var _tournamentLeaderboardCoalescers: Map<string, Coalescer<LeaderboardRow[]>> | undefined;
}

const leaderboardCoalescers = global._tournamentLeaderboardCoalescers ?? new Map<string, Coalescer<LeaderboardRow[]>>();
if (!global._tournamentLeaderboardCoalescers) global._tournamentLeaderboardCoalescers = leaderboardCoalescers;

/** Games finish continuously in a busy arena; one broadcast per second is plenty. */
const LEADERBOARD_MIN_INTERVAL_MS = 1000;

function leaderboardCoalescer(tournamentId: string) {
  const existing = leaderboardCoalescers.get(tournamentId);
  if (existing) return existing;
  const created = createCoalescer<LeaderboardRow[]>(LEADERBOARD_MIN_INTERVAL_MS, (rows) => {
    emitToTournament(tournamentId, "tournament:standing-updated", { tournamentId, rows, at: Date.now() });
  });
  leaderboardCoalescers.set(tournamentId, created);
  return created;
}

/**
 * Broadcast standings, coalescing bursts. Several games finishing in the same
 * second produce one leaderboard, not several, and the latest table always wins
 * so no client is left holding a stale one.
 */
export function emitStandingsUpdated(tournamentId: string, standings: any[]) {
  leaderboardCoalescer(String(tournamentId)).push(toLeaderboardRows(standings));
}

/** Send any pending leaderboard now — used when an event finishes. */
export function flushStandings(tournamentId: string) {
  leaderboardCoalescers.get(String(tournamentId))?.flush();
}

export function emitRoundCompleted(tournamentId: string, roundNumber: number, nextRoundAt?: number | null) {
  emitToTournament(tournamentId, "tournament:round-completed", { tournamentId, roundNumber, nextRoundAt: nextRoundAt || null });
}

export function emitRoundStarted(tournamentId: string, roundNumber: number) {
  emitToTournament(tournamentId, "tournament:round-started", { tournamentId, roundNumber });
}

export function emitTournamentStatus(tournamentId: string, status: string, extra: Record<string, unknown> = {}) {
  emitToTournament(tournamentId, "tournament:status", { tournamentId, status, at: Date.now(), ...extra });
}

export function emitTournamentEnded(tournamentId: string) {
  emitToTournament(tournamentId, "tournament:ended", { tournamentId, at: Date.now() });
}

/**
 * Coarse "something changed, reload" signal.
 *
 * Retained only for genuinely structural changes — participant lists, chat,
 * admin edits — where no targeted event exists and the payload would be the
 * whole document anyway. It is deliberately no longer emitted on moves.
 */
export function emitTournamentUpdate(tournamentId: string, reason = "changed") {
  emitToTournament(tournamentId, "tournament:update", { tournamentId, reason, at: Date.now() });
}
