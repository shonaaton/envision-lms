import { Chess } from "chess.js";
import mongoose from "mongoose";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import {
  notifyExternalTournamentParticipant,
  notifyExternalTournamentParticipants,
  notifyTournamentUsers,
} from "@/lib/tournamentNotifications";
import { buildPgn, detectTermination, loadGamePosition, STANDARD_START_FEN } from "@/lib/tournament/chessRules";
import {
  computeStandings,
  CURRENT_RULES_VERSION,
  FORFEIT_TERMINATION,
  normalizeRulesVersion,
  type ScoredGame,
  type ScoringOptions,
  type StandingEntry,
} from "@/lib/tournament/scoring";
import { berserkClock, clocksRunning, formatTimeControl, resolveTimeControl, timeControlToMs } from "@/lib/tournament/timeControl";
import { toScoredGame } from "@/lib/tournament/gameRecord";
import {
  acquirePairingLockGuard,
  claimRoundGuard,
  finishGameGuard,
  moveGuard,
  releasePairingLockGuard,
  releaseRoundGuard,
} from "@/lib/tournament/guards";
import { buildArenaPairings, freeSinceMs, mostRecentOpponents, pairingHistory, resolveColors } from "@/lib/tournament/pairing";
import { pairSwissRound, swissHistoriesFromGames, type SwissPlayer } from "@/lib/tournament/swiss";
import { FIRST_MOVE_GRACE_MS, noShowOutcome } from "@/lib/tournament/firstMove";
import {
  emitGameEnded,
  emitGameMove,
  emitPairingsCreated,
  emitRoundStarted,
  emitStandingsUpdated,
  type PairingCreatedEvent,
} from "@/lib/tournamentSocketServer";

export type TournamentLike = any;
export type TournamentGameLike = any;

const PAIRING_LOCK_MS = 20_000;
const ROUND_LOCK_MS = 30_000;

type TournamentPlayer = {
  key: string;
  userId?: string;
  externalUsername?: string;
  name: string;
  rating: number;
};

export class MoveConflictError extends Error {
  code = "move_conflict";
  constructor(message = "This position has already moved on.") {
    super(message);
    this.name = "MoveConflictError";
  }
}

export class IllegalMoveError extends Error {
  code = "illegal_move";
  constructor(message = "Illegal move.") {
    super(message);
    this.name = "IllegalMoveError";
  }
}

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export function isPlayingStatus(status: any) {
  return ["live", "playing"].includes(String(status || ""));
}

export function isFinishedStatus(status: any) {
  return ["completed", "finished"].includes(String(status || ""));
}

export function playerKeyForUser(userId: string) {
  return `user:${userId}`;
}

export function playerKeyForExternal(username: string) {
  return `external:${String(username).trim().toLowerCase()}`;
}

/**
 * Run a whole-document tournament update, starting again from a fresh load if
 * another writer saved first.
 *
 * Boards in a Swiss round often finish together, and each completion saves the
 * rebuilt standings and round state. Mongoose's version check rejects all but
 * the first of those saves; the rejected ones used to surface as a failed move
 * or resignation for the player. Every step here is derived from the games and
 * idempotent, so redoing it from a fresh copy is always correct.
 */
export async function withVersionRetry<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof mongoose.Error.VersionError) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Players and participant state                                       */
/* ------------------------------------------------------------------ */

export function getTournamentPlayers(tournament: TournamentLike): TournamentPlayer[] {
  const standingMap = new Map<string, any>((tournament.standings || []).map((entry: any) => [entry.playerKey, entry]));
  const internal = (tournament.participants || []).map((item: any) => ({
    key: playerKeyForUser(objectId(item)),
    userId: objectId(item),
    name: item?.username || item?.name || standingMap.get(playerKeyForUser(objectId(item)))?.displayName || "Student",
    rating: Number(item?.rating || standingMap.get(playerKeyForUser(objectId(item)))?.rating || 0),
  }));
  const external = (tournament.externalParticipants || []).map((item: any) => ({
    key: playerKeyForExternal(item.username),
    externalUsername: item.username,
    name: item.displayName || item.username || standingMap.get(playerKeyForExternal(item.username))?.displayName || "Guest",
    rating: Number(standingMap.get(playerKeyForExternal(item.username))?.rating || 0),
  }));
  return [...internal, ...external];
}

export function ensureTournamentStandings(tournament: TournamentLike) {
  const byKey = new Map<string, any>((tournament.standings || []).map((entry: any) => [entry.playerKey, entry]));
  tournament.standings = getTournamentPlayers(tournament).map((player) => {
    const existing = byKey.get(player.key);
    return {
      playerKey: player.key,
      user: player.userId || undefined,
      externalUsername: player.externalUsername || undefined,
      displayName: player.name,
      rating: Number(player.rating || existing?.rating || 0),
      points: Number(existing?.points || 0),
      wins: Number(existing?.wins || 0),
      draws: Number(existing?.draws || 0),
      losses: Number(existing?.losses || 0),
      byes: Number(existing?.byes || 0),
      gamesPlayed: Number(existing?.gamesPlayed || 0),
      buchholz: Number(existing?.buchholz || 0),
      sonnebornBerger: Number(existing?.sonnebornBerger || 0),
      streak: Number(existing?.streak || 0),
      onStreak: Boolean(existing?.onStreak),
      lastColor: String(existing?.lastColor || ""),
      lastFloat: existing?.lastFloat || null,
      scoreHistory: Array.isArray(existing?.scoreHistory) ? existing.scoreHistory : [],
      recentResults: Array.isArray(existing?.recentResults) ? existing.recentResults : [],
    };
  });
  return tournament.standings;
}

function participantStateMap(tournament: TournamentLike) {
  return new Map<string, any>((tournament.participantStates || []).map((entry: any) => [entry.playerKey, entry]));
}

function normalizeParticipantStates(tournament: TournamentLike) {
  const existing = participantStateMap(tournament);
  const now = new Date();
  tournament.participantStates = getTournamentPlayers(tournament).map((player) => {
    const current = existing.get(player.key);
    return {
      playerKey: player.key,
      status: current?.status || "joined",
      joinedAt: current?.joinedAt || now,
      queuedAt: current?.queuedAt,
      pausedAt: current?.pausedAt,
      lastSeenAt: current?.lastSeenAt,
    };
  });
  return tournament.participantStates;
}

export function setTournamentPlayerState(
  tournament: TournamentLike,
  playerKey: string,
  status: "joined" | "queued" | "playing" | "paused" | "withdrawn"
) {
  normalizeParticipantStates(tournament);
  const now = new Date();
  const states = tournament.participantStates || [];
  const index = states.findIndex((entry: any) => entry.playerKey === playerKey);
  const next = {
    ...(index >= 0 ? (states[index].toObject ? states[index].toObject() : states[index]) : { playerKey, joinedAt: now }),
    playerKey,
    status,
    queuedAt: status === "queued" ? now : index >= 0 ? states[index]?.queuedAt : undefined,
    pausedAt: status === "paused" ? now : index >= 0 ? states[index]?.pausedAt : undefined,
    lastSeenAt: now,
  };
  if (index >= 0) states[index] = next;
  else states.push(next);
  tournament.participantStates = states;
  return next;
}

/**
 * Whether a player may be given a new board.
 *
 * Availability is *derived*: a player is available unless they opted out. It is
 * deliberately not read from a stored "queued"/"playing" flag — keeping those
 * flags accurate under concurrency was the source of the pairing races, and
 * having an active game is a fact the games collection already knows.
 */
export function isAvailableForPairing(state: any) {
  const status = String(state?.status || "joined");
  return status !== "paused" && status !== "withdrawn";
}

/* ------------------------------------------------------------------ */
/* Clocks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Authoritative clock, derived rather than stored. Nothing writes a clock value
 * every second; the remaining time plus the timestamp of the last move is
 * enough to compute the truth at any instant.
 */
export function estimateClock(game: TournamentGameLike, at: number = Date.now()) {
  if (!clocksRunning(game)) return { whiteClockMs: Number(game.whiteClockMs || 0), blackClockMs: Number(game.blackClockMs || 0) };
  const since = new Date(game.lastMoveAt || game.startedAt || at).getTime();
  const elapsed = Math.max(0, at - since);
  if (game.turn === "w") {
    return { whiteClockMs: Math.max(0, Number(game.whiteClockMs || 0) - elapsed), blackClockMs: Number(game.blackClockMs || 0) };
  }
  return { whiteClockMs: Number(game.whiteClockMs || 0), blackClockMs: Math.max(0, Number(game.blackClockMs || 0) - elapsed) };
}

/* ------------------------------------------------------------------ */
/* Standings                                                           */
/* ------------------------------------------------------------------ */

export function scoringOptionsFor(tournament: TournamentLike): ScoringOptions {
  const rulesVersion = normalizeRulesVersion(tournament?.rulesVersion);
  // Arena standings freeze at the scheduled end, not at whatever moment the
  // expiry happens to be noticed. The table is the same however late the
  // observation is.
  const cutoff =
    tournament?.type === "arena" && tournament?.arenaEndsAt
      ? new Date(tournament.arenaEndsAt).getTime()
      : Number.POSITIVE_INFINITY;
  return {
    rulesVersion,
    type: tournament?.type === "arena" ? "arena" : "swiss",
    arenaStreaks: tournament?.arenaStreaks !== false,
    earlyDrawMoveLimit: Math.max(0, Number(tournament?.earlyDrawMoveLimit ?? 10)),
    drawStreakLimit: Math.max(0, Number(tournament?.drawStreakLimit ?? 2)),
    berserkMinPlies: Math.max(0, Number(tournament?.berserkMinPlies ?? 7)),
    scoringCutoff: cutoff,
  };
}

/**
 * Full standings rebuild.
 *
 * Correct by construction and safe to re-run, so it doubles as the audit and
 * repair tool. It reads only completed games, through an index, projecting the
 * handful of fields scoring needs — it never loads move histories.
 */
export async function recalculateTournamentStandings(tournament: TournamentLike) {
  ensureTournamentStandings(tournament);
  const games = await TournamentGame.find(
    { tournament: tournament._id, status: "completed" },
    "source status result termination whiteKey blackKey ply moveHistorySAN berserkWhite berserkBlack endedAt createdAt updatedAt"
  ).lean();

  const players = (tournament.standings || []).map((entry: any) => ({
    playerKey: entry.playerKey,
    user: entry.user ? objectId(entry.user) : undefined,
    externalUsername: entry.externalUsername || undefined,
    displayName: entry.displayName,
    rating: Number(entry.rating || 0),
  }));

  tournament.standings = computeStandings(players, games.map(toScoredGame), scoringOptionsFor(tournament));
  return tournament.standings;
}

/* ------------------------------------------------------------------ */
/* Game creation                                                       */
/* ------------------------------------------------------------------ */

function startingFenFor(tournament: TournamentLike) {
  if (tournament.startingPosition?.type === "custom" && tournament.startingPosition?.fen) {
    return String(tournament.startingPosition.fen);
  }
  return "";
}

async function createGame(
  tournament: TournamentLike,
  input: {
    source: "swiss" | "arena";
    roundNumber: number;
    tableNumber: number;
    white: any;
    black?: any | null;
    bye?: boolean;
    /** Collector for the batched pairing broadcast. */
    announce?: PairingCreatedEvent[];
  }
) {
  const control = resolveTimeControl(tournament);
  const { initialMs, incrementMs } = timeControlToMs(control);
  const startFen = startingFenFor(tournament);
  const chess = startFen ? new Chess(startFen) : new Chess();

  const game = await TournamentGame.create({
    tournament: tournament._id,
    source: input.source,
    roundNumber: input.roundNumber,
    tableNumber: input.tableNumber,
    whiteUser: input.white.user || undefined,
    blackUser: input.black?.user || undefined,
    whiteExternalUsername: input.white.externalUsername || undefined,
    blackExternalUsername: input.black?.externalUsername || undefined,
    whiteKey: input.white.playerKey,
    blackKey: input.black?.playerKey || "",
    whiteName: input.white.displayName,
    blackName: input.black?.displayName || "",
    whiteRating: Number(input.white.rating || 0),
    blackRating: Number(input.black?.rating || 0),
    fen: chess.fen(),
    startFen,
    ply: 0,
    initialClockMs: initialMs,
    incrementMs,
    whiteIncrementMs: incrementMs,
    blackIncrementMs: incrementMs,
    whiteClockMs: initialMs,
    blackClockMs: initialMs,
    turn: chess.turn(),
    status: input.bye ? "completed" : "active",
    result: input.bye ? "1-0" : "*",
    termination: input.bye ? "bye" : "ongoing",
    winnerKey: input.bye ? input.white.playerKey : "",
    firstMoveDeadlineAt: input.bye ? undefined : new Date(Date.now() + FIRST_MOVE_GRACE_MS),
    endedAt: input.bye ? new Date() : undefined,
  });

  if (!input.bye) {
    // The pairing event is emitted by the caller, once for the whole batch.
    input.announce?.push({
      tournamentId: String(tournament._id),
      gameId: String(game._id),
      roundNumber: input.roundNumber,
      tableNumber: input.tableNumber,
      whiteKey: input.white.playerKey,
      blackKey: input.black?.playerKey || "",
      whiteName: input.white.displayName,
      blackName: input.black?.displayName || "",
    });
    await notifyTournamentUsers(tournament, {
      users: [objectId(input.white.user), objectId(input.black?.user)].filter(Boolean),
      type: "tournament.game_ready",
      title: "Tournament game ready",
      message: `Board ${input.tableNumber}: ${input.white.displayName} vs ${input.black?.displayName}.`,
      href: `/tournaments/${objectId(tournament)}/play`,
    });
  }
  return game;
}

/* ------------------------------------------------------------------ */
/* Moves and results                                                   */
/* ------------------------------------------------------------------ */

/**
 * Apply one move.
 *
 * The write is a compare-and-set on `ply`, so a retried request, a double tap
 * or two racing tabs can only ever land one move. A caller that holds a stale
 * position is rejected rather than allowed to overwrite a newer one.
 */
export async function applyGameMove(
  game: TournamentGameLike,
  move: { from: string; to: string; promotion?: string },
  options: { expectedPly?: number } = {}
) {
  const currentPly = Number(game.ply ?? (game.moveHistorySAN || []).length ?? 0);
  if (options.expectedPly !== undefined && Number(options.expectedPly) !== currentPly) {
    throw new MoveConflictError("Your board was out of date. It has been resynchronised.");
  }

  const now = Date.now();
  const clocks = estimateClock(game, now);
  if (game.turn === "w" && clocks.whiteClockMs <= 0) throw new Error("White ran out of time.");
  if (game.turn === "b" && clocks.blackClockMs <= 0) throw new Error("Black ran out of time.");

  const { chess } = loadGamePosition({
    moveHistorySAN: game.moveHistorySAN,
    fen: game.fen,
    startFen: game.startFen,
  });

  let result: any = null;
  try {
    result = chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  } catch {
    result = null;
  }
  if (!result) throw new IllegalMoveError();

  // The first move of each side is free; see clocksRunning.
  const elapsed = clocksRunning(game) ? Math.max(0, now - new Date(game.lastMoveAt || game.startedAt || now).getTime()) : 0;
  const increment = Number((game.turn === "w" ? game.whiteIncrementMs : game.blackIncrementMs) ?? game.incrementMs ?? 0);
  const movedClockMs = Math.max(0, Number(game.turn === "w" ? game.whiteClockMs : game.blackClockMs) - elapsed + increment);

  const finished = detectTermination(chess);
  const nextPly = currentPly + 1;

  const update: Record<string, any> = {
    fen: chess.fen(),
    turn: chess.turn(),
    ply: nextPly,
    moveHistorySAN: [...(game.moveHistorySAN || []), result.san],
    moveHistoryUCI: [...(game.moveHistoryUCI || []), `${result.from}${result.to}${result.promotion || ""}`],
    lastMoveAt: new Date(now),
    drawOfferBy: "",
    [game.turn === "w" ? "whiteClockMs" : "blackClockMs"]: movedClockMs,
  };
  const unset: Record<string, any> = { firstMoveDeadlineAt: 1 };
  // Black owes a first move too; see lib/tournament/firstMove.ts.
  if (nextPly === 1 && !detectTermination(chess)) {
    update.firstMoveDeadlineAt = new Date(now + FIRST_MOVE_GRACE_MS);
    delete unset.firstMoveDeadlineAt;
  }

  if (finished) {
    update.status = "completed";
    update.result = finished.result;
    update.termination = finished.termination;
    update.winnerKey = finished.winnerColor === "white" ? game.whiteKey : finished.winnerColor === "black" ? game.blackKey : "";
    update.endedAt = new Date(now);
  }

  const updated: any = await TournamentGame.findOneAndUpdate(
    moveGuard(game._id, game.turn, currentPly),
    { $set: update, $unset: unset },
    { new: true }
  );
  if (!updated) throw new MoveConflictError("That move was already played.");

  // PGN is rebuilt from the full history, so it is a complete, importable game
  // rather than the single-move fragment the FEN-only engine used to produce.
  try {
    // Stored without tournament metadata; the export routes add the full
    // header block, where the tournament is actually in hand.
    updated.pgn = buildPgn(updated.moveHistorySAN, {
      round: updated.roundNumber || "-",
      white: updated.whiteName,
      black: updated.blackName,
      result: updated.result || "*",
      startFen: updated.startFen || null,
      date: updated.startedAt,
    });
    await TournamentGame.updateOne({ _id: updated._id }, { $set: { pgn: updated.pgn } });
  } catch {
    // A malformed PGN must never block a legal move.
  }

  emitGameMove({
    gameId: String(updated._id),
    ply: nextPly,
    san: result.san,
    uci: `${result.from}${result.to}${result.promotion || ""}`,
    fen: updated.fen,
    turn: updated.turn,
    whiteClockMs: Number(updated.whiteClockMs || 0),
    blackClockMs: Number(updated.blackClockMs || 0),
    lastMoveAt: now,
    status: updated.status,
    result: updated.result,
    firstMoveDeadlineAt: updated.firstMoveDeadlineAt ? new Date(updated.firstMoveDeadlineAt).getTime() : null,
  });

  if (finished) {
    emitGameEnded({
      gameId: String(updated._id),
      tournamentId: String(updated.tournament),
      status: updated.status,
      result: updated.result,
      termination: updated.termination,
      winnerKey: updated.winnerKey || "",
      fen: updated.fen,
      ply: nextPly,
    });
  }

  return updated;
}

/**
 * Finish a game for a reason outside the moves — resignation, agreement, flag
 * fall, an admin correction. Idempotent: a game that is already finished is
 * returned untouched, so a duplicate request cannot re-award anything.
 */
export async function completeGame(
  game: TournamentGameLike,
  input: { result: "1-0" | "0-1" | "1/2-1/2"; termination: any; winnerKey?: string }
) {
  const updated: any = await TournamentGame.findOneAndUpdate(
    finishGameGuard(game._id),
    {
      $set: {
        status: "completed",
        result: input.result,
        termination: input.termination,
        winnerKey: input.winnerKey || "",
        endedAt: new Date(),
        drawOfferBy: "",
      },
    },
    { new: true }
  );
  if (!updated) return game;

  emitGameEnded({
    gameId: String(updated._id),
    tournamentId: String(updated.tournament),
    status: updated.status,
    result: updated.result,
    termination: updated.termination,
    winnerKey: updated.winnerKey || "",
    fen: updated.fen,
    ply: Number(updated.ply || 0),
  });
  return updated;
}

/** Abort a game so that neither side is scored. Also idempotent. */
export async function abortGame(game: TournamentGameLike, termination: "abandoned" | "manual" = "abandoned") {
  const updated: any = await TournamentGame.findOneAndUpdate(
    finishGameGuard(game._id),
    { $set: { status: "aborted", result: "*", termination, winnerKey: "", endedAt: new Date(), drawOfferBy: "" } },
    { new: true }
  );
  if (!updated) return game;
  emitGameEnded({
    gameId: String(updated._id),
    tournamentId: String(updated.tournament),
    status: updated.status,
    result: "*",
    termination: updated.termination,
    winnerKey: "",
    fen: updated.fen,
    ply: Number(updated.ply || 0),
  });
  return updated;
}

/**
 * Flag fall and abandoned boards.
 *
 * Only the chess clock can lose a game. A player whose phone slept, whose
 * network dropped or who backgrounded the tab is not forfeited — their clock is
 * already running, which produces the right outcome on its own.
 */
export async function enforceTournamentGameTimeouts(tournament: TournamentLike) {
  // Runs on every lifecycle tick against every live board, so it reads only the
  // fields a flag-fall decision needs — never the move histories.
  const activeGames: any[] = await TournamentGame.find(
    { tournament: tournament._id, status: "active" },
    "source whiteKey blackKey whiteUser blackUser turn whiteClockMs blackClockMs lastMoveAt startedAt createdAt status ply firstMoveDeadlineAt blackOnlineAt tournament fen"
  ).lean();
  const now = Date.now();
  const ended: any[] = [];
  const absent: Array<{ key: string; user?: string }> = [];

  for (const game of activeGames) {
    const noShow = noShowOutcome(game, now);
    if (noShow.action !== "none") {
      const result =
        noShow.action === "abort"
          ? await abortGame(game, "abandoned")
          : await completeGame(game, {
              result: noShow.winner === "white" ? "1-0" : "0-1",
              termination: FORFEIT_TERMINATION,
              winnerKey: noShow.winner === "white" ? game.whiteKey : game.blackKey,
            });
      if (result?.status !== "active" && result !== game) {
        ended.push(result);
        for (const side of noShow.absent) {
          absent.push({
            key: side === "white" ? game.whiteKey : game.blackKey,
            user: objectId(side === "white" ? game.whiteUser : game.blackUser) || undefined,
          });
        }
      }
      continue;
    }

    const clocks = estimateClock(game, now);
    if (clocks.whiteClockMs <= 0 || clocks.blackClockMs <= 0) {
      const whiteFlagged = clocks.whiteClockMs <= 0;
      const result = await completeGame(game, {
        result: whiteFlagged ? "0-1" : "1-0",
        termination: "timeout",
        winnerKey: whiteFlagged ? game.blackKey : game.whiteKey,
      });
      if (result?.status === "completed") ended.push(result);
    }
  }

  if (absent.length) await sitOutNoShows(tournament, absent);
  return ended;
}

/**
 * A player who missed a board is taken out of the next pairings, so they are
 * not paired — and forfeited, or handed another abandoned board — again and
 * again. They stay in the standings and can return from the play page at any
 * time.
 */
async function sitOutNoShows(tournament: TournamentLike, absent: Array<{ key: string; user?: string }>) {
  const now = new Date();
  for (const player of absent) {
    await Tournament.updateOne(
      { _id: tournament._id, "participantStates.playerKey": player.key },
      { $set: { "participantStates.$.status": "paused", "participantStates.$.pausedAt": now } }
    );
  }
  const users = absent.map((player) => player.user).filter(Boolean) as string[];
  if (users.length) {
    await notifyTournamentUsers(tournament, {
      users,
      type: "tournament.missed_game",
      title: "You missed a tournament game",
      message:
        tournament.type === "arena"
          ? `You did not start your game in ${tournament.name}, so you have been paused. Open the tournament and resume to keep playing.`
          : `You did not start your game in ${tournament.name}, so you will sit out the next round. Open the tournament to rejoin.`,
      href: `/tournaments/${objectId(tournament)}/play`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Arena pairing                                                       */
/* ------------------------------------------------------------------ */

async function acquirePairingLock(tournamentId: string) {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const claimed = await Tournament.updateOne(
    acquirePairingLockGuard(tournamentId, new Date()),
    { $set: { pairingLock: { token, expiresAt: new Date(Date.now() + PAIRING_LOCK_MS) } } }
  );
  return claimed.modifiedCount ? token : "";
}

async function releasePairingLock(tournamentId: string, token: string) {
  if (!token) return;
  await Tournament.updateOne(releasePairingLockGuard(tournamentId, token), { $unset: { pairingLock: 1 } });
}

/**
 * Create every arena pairing that is currently possible.
 *
 * Owns its own document from load to save: it takes the tournament id, not a
 * caller's in-memory document, so it can never discard a caller's unsaved work
 * and a caller can never overwrite what it commits.
 */
export async function syncArenaPairings(tournamentId: string) {
  const id = String(tournamentId);
  const token = await acquirePairingLock(id);
  if (!token) return { created: 0, skipped: "locked" as const };

  try {
    const tournament: any = await Tournament.findById(id);
    if (!tournament || tournament.type !== "arena") return { created: 0, skipped: "not_arena" as const };
    if (!isPlayingStatus(tournament.status) || tournament.pausedByAdmin) return { created: 0, skipped: "not_pairing" as const };
    if (tournament.arenaEndsAt && new Date(tournament.arenaEndsAt).getTime() <= Date.now()) {
      return { created: 0, skipped: "expired" as const };
    }

    ensureTournamentStandings(tournament);
    normalizeParticipantStates(tournament);

    const games = await TournamentGame.find(
      { tournament: tournament._id },
      "whiteKey blackKey status createdAt startedAt endedAt"
    ).lean();

    const busy = new Set(
      games.filter((game: any) => game.status === "active").flatMap((game: any) => [game.whiteKey, game.blackKey].filter(Boolean))
    );
    const lastGameEnded = new Map<string, number>();
    for (const game of games as any[]) {
      if (!game.endedAt) continue;
      const ended = new Date(game.endedAt).getTime();
      for (const key of [game.whiteKey, game.blackKey]) {
        if (key && ended > (lastGameEnded.get(key) || 0)) lastGameEnded.set(key, ended);
      }
    }
    const states = participantStateMap(tournament);
    const history = pairingHistory(games as any);
    const recent = mostRecentOpponents(games as any);
    const now = Date.now();

    const waiting = (tournament.standings || [])
      .filter((entry: any) => !busy.has(entry.playerKey) && isAvailableForPairing(states.get(entry.playerKey)))
      .map((entry: any) => {
        const state = states.get(entry.playerKey);
        const since = freeSinceMs({
          lastGameEndedAt: lastGameEnded.get(entry.playerKey),
          queuedAt: state?.queuedAt ? new Date(state.queuedAt).getTime() : null,
          joinedAt: state?.joinedAt ? new Date(state.joinedAt).getTime() : null,
          startedAt: tournament.startedAt ? new Date(tournament.startedAt).getTime() : null,
        });
        return { ...(entry.toObject ? entry.toObject() : entry), waitingMs: Math.max(0, now - (since || now)) };
      });

    // Board numbers continue from the games already loaded above, rather than
    // costing an extra count query on every pass.
    let tableNumber = games.length + 1;
    let created = 0;

    const announce: PairingCreatedEvent[] = [];
    const { pairs } = buildArenaPairings(waiting, { history, recent, playing: busy.size });
    for (const pair of pairs) {
      await createGame(tournament, {
        source: "arena",
        roundNumber: 0,
        tableNumber,
        white: pair.white,
        black: pair.black,
        announce,
      });
      tableNumber += 1;
      created += 1;
    }

    if (created) await tournament.save();
    // One event for the whole pass, however many boards it opened.
    emitPairingsCreated(id, announce);
    return { created, skipped: null };
  } finally {
    await releasePairingLock(id, token);
  }
}

/* ------------------------------------------------------------------ */
/* Swiss rounds                                                        */
/* ------------------------------------------------------------------ */

/**
 * Claim the right to generate a specific round.
 *
 * The old guard read "is a round unfinished?", awaited a chain of database
 * calls and then wrote — so two callers could both pass it and both create a
 * round. The claim is now a single conditional update on `currentRound`: the
 * loser sees zero matched documents and stops.
 */
async function claimSwissRound(tournamentId: string, expectedCurrentRound: number, roundNumber: number) {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const claimed = await Tournament.updateOne(
    claimRoundGuard(tournamentId, expectedCurrentRound, new Date()),
    { $set: { roundLock: { token, roundNumber, expiresAt: new Date(Date.now() + ROUND_LOCK_MS) } } }
  );
  return claimed.modifiedCount ? token : "";
}

async function releaseSwissRound(tournamentId: string, token: string) {
  if (!token) return;
  await Tournament.updateOne(releaseRoundGuard(tournamentId, token), { $unset: { roundLock: 1 } });
}

export class SwissExhaustedError extends Error {
  code = "swiss_exhausted";
  constructor(message = "Every remaining pairing would repeat a previous game.") {
    super(message);
    this.name = "SwissExhaustedError";
  }
}

/**
 * Generate the next Swiss round.
 *
 * Pairing is delegated to the Dutch-system matcher, which either returns a
 * pairing of the whole field or reports that no legal one exists. There is no
 * approximate fallback: an earlier plan kept the old greedy routine for very
 * small fields, but with the matcher validated against exhaustive search down
 * to two players, a second pairing behaviour would add risk rather than remove
 * it.
 */
export async function generateSwissRound(tournamentId: string, options: { force?: boolean; allowRepeats?: boolean } = {}) {
  const id = String(tournamentId);
  const preload: any = await Tournament.findById(id);
  if (!preload) throw new Error("Tournament not found.");
  if (preload.type !== "swiss") throw new Error("Only Swiss tournaments have rounds.");

  const rounds = Array.isArray(preload.roundsData) ? preload.roundsData : [];
  const unfinished = rounds.find((round: any) => round.status !== "completed");
  // Usually another board's completion got here first and already started the
  // round; that is a no-op for this caller, not an error to show a player.
  if (unfinished && !options.force) {
    return { created: false, roundNumber: Number(preload.currentRound || 0), skipped: "round_in_progress" as const };
  }

  const expectedCurrentRound = Number(preload.currentRound || 0);
  const roundNumber = expectedCurrentRound + 1;
  const token = await claimSwissRound(id, expectedCurrentRound, roundNumber);
  if (!token) return { created: false, roundNumber: expectedCurrentRound, skipped: "locked" as const };

  try {
    const tournament: any = await Tournament.findById(id);
    await recalculateTournamentStandings(tournament);

    const games = await TournamentGame.find(
      { tournament: tournament._id },
      "whiteKey blackKey status result termination roundNumber"
    ).lean();
    const { opponents, colours, lastFloat } = swissHistoriesFromGames(games as any);
    const states = participantStateMap(tournament);

    const standingByKey = new Map<string, any>(
      (tournament.standings || []).map((entry: any) => [entry.playerKey, entry.toObject ? entry.toObject() : entry])
    );
    const field: SwissPlayer[] = Array.from(standingByKey.values())
      .filter((entry: any) => isAvailableForPairing(states.get(entry.playerKey)))
      .map((entry: any) => ({
        playerKey: entry.playerKey,
        displayName: entry.displayName,
        points: Number(entry.points || 0),
        rating: Number(entry.rating || 0),
        opponents: opponents.get(entry.playerKey) || [],
        colours: colours.get(entry.playerKey) || [],
        byes: Number(entry.byes || 0),
        lastFloat: lastFloat.get(entry.playerKey) ?? null,
      }));

    const result = pairSwissRound(field, {
      allowRepeats: options.allowRepeats,
      roundsRemaining: Math.max(1, Number(tournament.rounds || 0) - expectedCurrentRound),
    });
    if (result.exhausted) {
      throw new SwissExhaustedError();
    }

    const pairings: any[] = [];
    const announce: PairingCreatedEvent[] = [];
    let tableNumber = 1;
    const createdIds: any[] = [];

    if (result.bye) {
      const byeEntry = standingByKey.get(result.bye.playerKey);
      const byeGame = await createGame(tournament, { source: "swiss", roundNumber, tableNumber, white: byeEntry, bye: true });
      createdIds.push(byeGame._id);
      pairings.push({
        gameId: byeGame._id,
        tableNumber,
        whiteKey: result.bye.playerKey,
        blackKey: "",
        whiteName: result.bye.displayName,
        blackName: "Bye",
        result: "1-0",
        status: "completed",
      });
      tableNumber += 1;
    }

    for (const pair of result.pairs) {
      const white = standingByKey.get(pair.white.playerKey);
      const black = standingByKey.get(pair.black.playerKey);
      const game = await createGame(tournament, {
        source: "swiss",
        roundNumber,
        tableNumber,
        white,
        black,
        announce,
      });
      createdIds.push(game._id);
      pairings.push({
        gameId: game._id,
        tableNumber,
        whiteKey: pair.white.playerKey,
        blackKey: pair.black.playerKey,
        whiteName: pair.white.displayName,
        blackName: pair.black.displayName,
        result: "*",
        status: "live",
      });
      tableNumber += 1;
    }

    // Record the round in one guarded write rather than saving the whole
    // document: boards finishing concurrently save this document too, and a
    // failed whole-document save here used to leave the boards created but the
    // round unrecorded — so the next attempt paired the round a second time.
    // The version bump makes any copy loaded before this point reload.
    const committed = await Tournament.updateOne(
      { _id: tournament._id, "roundLock.token": token, currentRound: expectedCurrentRound },
      {
        $set: { currentRound: roundNumber },
        $push: { roundsData: { roundNumber, status: "live", startedAt: new Date(), pairings } },
        $inc: { __v: 1 },
      }
    );
    if (!committed.modifiedCount) {
      await TournamentGame.deleteMany({ _id: { $in: createdIds } });
      return { created: false, roundNumber: expectedCurrentRound, skipped: "locked" as const };
    }
    // A bye scores at once, so the table moves with the new round.
    await withVersionRetry(async () => {
      const fresh: any = await Tournament.findById(id);
      await recalculateTournamentStandings(fresh);
      await fresh.save();
    });
    emitPairingsCreated(id, announce);
    emitRoundStarted(id, roundNumber);
    return { created: true, roundNumber, skipped: null, repeats: result.repeats };
  } finally {
    await releaseSwissRound(id, token);
  }
}

/** Reconcile stored round/pairing state with what the games actually say. */
export function syncSwissRoundState(tournament: TournamentLike, games: any[]) {
  const rounds = Array.isArray(tournament.roundsData) ? tournament.roundsData : [];
  if (!rounds.length) return { changed: false, completedRound: 0 };

  const byId = new Map(games.map((game: any) => [String(game._id), game]));
  let changed = false;
  let completedRound = 0;

  tournament.roundsData = rounds.map((round: any) => {
    const plain = round.toObject ? round.toObject() : round;
    const pairings = (plain.pairings || []).map((pairing: any) => {
      const game = byId.get(String(pairing.gameId));
      if (!game) return pairing;
      const status =
        game.status === "completed" ? "completed" : game.status === "aborted" ? "aborted" : game.status === "active" ? "live" : pairing.status;
      if (status !== pairing.status || (game.result || "*") !== pairing.result) changed = true;
      return { ...pairing, status, result: game.result || pairing.result || "*" };
    });
    const allDone = pairings.length > 0 && pairings.every((pairing: any) => ["completed", "aborted"].includes(pairing.status));
    if (allDone) completedRound = Math.max(completedRound, Number(plain.roundNumber || 0));
    if (allDone && plain.status !== "completed") changed = true;
    return {
      ...plain,
      pairings,
      status: allDone ? "completed" : plain.status || "live",
      endedAt: allDone ? plain.endedAt || new Date() : plain.endedAt,
    };
  });

  return { changed, completedRound };
}

/* ------------------------------------------------------------------ */
/* Lifecycle helpers used by the worker and admin overrides            */
/* ------------------------------------------------------------------ */

export async function startTournament(tournament: TournamentLike) {
  ensureTournamentStandings(tournament);
  normalizeParticipantStates(tournament);
  tournament.startedAt = new Date();
  tournament.status = "playing";
  tournament.pausedByAdmin = false;
  tournament.initialParticipantKeys = (tournament.standings || []).map((entry: any) => entry.playerKey);

  const alreadyNotified = (tournament.adminActions || []).some((action: any) => action.action === "notification.started");
  if (!alreadyNotified) {
    await notifyTournamentUsers(tournament, {
      type: "tournament.started",
      title: "Tournament started",
      message: `${tournament.name} has started. Your board will appear when you are paired.`,
      href: `/tournaments/${objectId(tournament)}`,
    });
    await notifyExternalTournamentParticipants(tournament, {
      subject: `Started: ${tournament.name}`,
      message: (participant) =>
        `Hello ${participant.displayName || participant.username},\n\n${tournament.name} has started. Open your tournament link to enter the lobby.`,
    });
    tournament.adminActions = [
      ...(tournament.adminActions || []),
      { action: "notification.started", note: "Tournament-start notification sent by server lifecycle.", createdAt: new Date() },
    ];
  }

  if (tournament.type === "arena") {
    tournament.arenaEndsAt = new Date(Date.now() + Number(tournament.arenaDurationMinutes || 0) * 60000);
    await tournament.save();
    await syncArenaPairings(String(tournament._id));
    return tournament;
  }

  await tournament.save();
  await generateSwissRound(String(tournament._id));
  return tournament;
}

export async function freezeTournamentResults(tournament: TournamentLike) {
  await recalculateTournamentStandings(tournament);
  const [totalGames, completedGames] = await Promise.all([
    TournamentGame.countDocuments({ tournament: tournament._id }),
    TournamentGame.countDocuments({ tournament: tournament._id, status: "completed" }),
  ]);
  const standings = JSON.parse(JSON.stringify(tournament.standings || []));
  tournament.finalSnapshot = {
    standings,
    podium: standings.slice(0, 3),
    totalGames,
    completedGames,
    generatedAt: new Date(),
  };

  const alreadyCompletedNotified = (tournament.adminActions || []).some((action: any) => action.action === "notification.completed");
  if (!alreadyCompletedNotified) {
    await notifyTournamentUsers(tournament, {
      type: "tournament.completed",
      title: "Tournament completed",
      message: `${tournament.name} has completed. Final standings are available.`,
      href: `/tournaments/${objectId(tournament)}`,
    });
    await notifyExternalTournamentParticipants(tournament, {
      subject: `Completed: ${tournament.name}`,
      message: (participant) =>
        `Hello ${participant.displayName || participant.username},\n\n${tournament.name} has completed. Final standings are available from your tournament link.`,
    });
    tournament.adminActions = [
      ...(tournament.adminActions || []),
      { action: "notification.completed", note: "Tournament completion notification sent by server lifecycle.", createdAt: new Date() },
    ];
  }

  const alreadyPlaced = (tournament.adminActions || []).some((action: any) => action.action === "notification.final_placements");
  if (!alreadyPlaced && standings.length) {
    await Promise.all(
      standings.map((entry: any, index: number) => {
        if (!entry.user) return null;
        return notifyTournamentUsers(tournament, {
          users: [objectId(entry.user)],
          type: "tournament.final_placement",
          title: "Final tournament placement",
          message: `You finished #${index + 1} in ${tournament.name} with ${entry.points} points.`,
          href: `/tournaments/${objectId(tournament)}`,
        });
      })
    );
    await Promise.all(
      (tournament.externalParticipants || []).map((participant: any) => {
        const playerKey = playerKeyForExternal(participant.username);
        const index = standings.findIndex((entry: any) => entry.playerKey === playerKey);
        if (index < 0) return null;
        return notifyExternalTournamentParticipant({
          email: participant.email,
          name: participant.displayName || participant.username,
          tournamentName: tournament.name,
          subject: `Final result: ${tournament.name}`,
          message: `Hello ${participant.displayName || participant.username},\n\nYou finished #${index + 1} in ${tournament.name} with ${standings[index].points} points.`,
          href: `/tournament-join/${tournament.externalInvite?.token || ""}/play`,
          tournamentId: objectId(tournament),
        });
      })
    );
    tournament.adminActions = [
      ...(tournament.adminActions || []),
      { action: "notification.final_placements", note: "Final placement notifications sent.", createdAt: new Date() },
    ];
  }
  return tournament.finalSnapshot;
}

/** Human-readable time control, for PGN headers and UI. */
export function tournamentTimeControlLabel(tournament: TournamentLike) {
  return formatTimeControl(resolveTimeControl(tournament));
}

export function tournamentPgnTimeControl(tournament: TournamentLike) {
  const control = resolveTimeControl(tournament);
  return `${control.initialSeconds}+${control.incrementSeconds}`;
}

export function berserkClockFor(tournament: TournamentLike) {
  return berserkClock(resolveTimeControl(tournament));
}

export { CURRENT_RULES_VERSION, STANDARD_START_FEN, toScoredGame };
export type { StandingEntry };

/** Broadcast the current standings without forcing anyone to refetch. */
export function publishStandings(tournament: TournamentLike) {
  emitStandingsUpdated(String(tournament._id), JSON.parse(JSON.stringify(tournament.standings || [])));
}
