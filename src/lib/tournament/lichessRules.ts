/**
 * Lichess tournament constants, ported from lichess-org/lila and
 * lichess-org/scalachess (read from master, 13 Nov 2026). Each function names
 * the source it follows, so a reader can check it against Lichess directly.
 *
 * Pure: no I/O, safe on the client.
 */

import { resolveTimeControl, type TimeControlSource } from "@/lib/tournament/timeControl";

export type Speed = "ultraBullet" | "bullet" | "blitz" | "rapid" | "classical" | "correspondence";

/** scalachess Clock.Config.estimateTotalSeconds = limitSeconds + 40 * incrementSeconds */
export function estimateTotalSeconds(source: TimeControlSource) {
  const control = resolveTimeControl(source);
  return control.initialSeconds + 40 * control.incrementSeconds;
}

/** scalachess Speed.byTime: <30 ultraBullet, <180 bullet, <480 blitz, <1500 rapid, <21600 classical. */
export function speedOf(source: TimeControlSource): Speed {
  const seconds = estimateTotalSeconds(source);
  if (seconds < 30) return "ultraBullet";
  if (seconds < 180) return "bullet";
  if (seconds < 480) return "blitz";
  if (seconds < 1500) return "rapid";
  if (seconds < 21600) return "classical";
  return "correspondence";
}

/**
 * lila Game.timeForFirstMove, tournament branch: 11 / 16 / 21 / 25 / 30
 * seconds for ultraBullet / bullet / blitz / rapid / anything slower. The
 * player who does not move in time loses the game (lila Finisher.noStart).
 */
export function firstMoveSeconds(source: TimeControlSource) {
  switch (speedOf(source)) {
    case "ultraBullet":
      return 11;
    case "bullet":
      return 16;
    case "blitz":
      return 21;
    case "rapid":
      return 25;
    default:
      return 30;
  }
}

/** The same, from a game's own clock (milliseconds), for code that has the game but not the tournament. */
export function firstMoveMsForClock(initialClockMs: number, incrementMs: number) {
  return (
    firstMoveSeconds({
      initialClockSeconds: Math.round(Number(initialClockMs || 0) / 1000),
      incrementSeconds: Math.round(Number(incrementMs || 0) / 1000),
    }) * 1000
  );
}

/**
 * lila WaitingUsers.waitSeconds: how long a free Arena player normally waits
 * so a pool can build up before pairing.
 *   < 30 s total -> 8, < 60 s -> 10, else clamp(total / 10 + 6, 15, 50)
 */
export function arenaWaitSeconds(source: TimeControlSource) {
  const total = estimateTotalSeconds(source);
  if (total < 30) return 8;
  if (total < 60) return 10;
  return Math.min(50, Math.max(15, Math.floor(total / 10) + 6));
}

/**
 * lila Tournament.pairingsClosed: no new Arena pairings once fewer than
 * max(30, min(limitSeconds / 2, 120)) seconds are left, since a game started
 * then could not count.
 */
export function arenaPairingsClosedSeconds(source: TimeControlSource) {
  const limit = resolveTimeControl(source).initialSeconds;
  return Math.max(30, Math.min(Math.floor(limit / 2), 120));
}

/** lila Tournament.isRecentlyStarted: within 15 seconds of the start, pair by rating only. */
export const ARENA_RECENT_START_MS = 15_000;
/** lila StartedOrganizer: under 30 players a tournament counts as small. */
export const ARENA_SMALL_TOURNAMENT_PLAYERS = 30;
/** lila PairingSystem.maxGroupSize */
export const ARENA_MAX_GROUP_SIZE = 100;
/** lila AntmaPairing.maxStrike: never give a fourth game in a row with the same colour to both players. */
export const ARENA_MAX_COLOUR_STRIKE = 3;

/* Arena sheet thresholds, lila tournament Pairing.scala (turns are plies). */
/** quickDraw: a draw in fewer than 20 plies (10 moves) scores nothing. */
export const QUICK_DRAW_PLIES = 20;
/** notSoQuickFinish: berserk earns its bonus only in a game of at least 14 plies (7 moves). */
export const BERSERK_VALID_PLIES = 14;
/** longGame (standard chess): a draw of 60+ plies (30 moves) always scores, even in a draw streak. */
export const LONG_GAME_PLIES = 60;

/** lila core Game.swissPreventsDraw: no draw offers in Swiss before 60 plies (30 moves each). */
export const SWISS_NO_DRAW_BEFORE_PLIES = 60;

/**
 * lila Swiss.isEnterable: new players can join while the current round is at
 * most nbRounds / 2 (integer division). Players already in can always come back.
 */
export function swissStillEnterable(tournament: { currentRound?: number | null; rounds?: number | null }) {
  return Number(tournament.currentRound || 0) <= Math.floor(Number(tournament.rounds || 0) / 2);
}

/** lila tournament performance: opponent rating + 500 for a win, - 500 for a loss, + 0 for a draw. */
export const PERFORMANCE_STEP = 500;
/** Rating used for a player who has none (guests, unrated): lila Glicko default. */
export const DEFAULT_RATING = 1500;

/**
 * Whether a new player may still enter a tournament that has started: the
 * organiser's late-entry switch, and for a Lichess-rules Swiss also lila's
 * isEnterable round limit. Before the start, always.
 */
export function lateEntryOpen(tournament: {
  status?: string | null;
  type?: string | null;
  lateJoiningAllowed?: boolean | null;
  rulesVersion?: number | null;
  currentRound?: number | null;
  rounds?: number | null;
}) {
  const playing = ["live", "playing"].includes(String(tournament.status || ""));
  if (!playing) return true;
  if (tournament.lateJoiningAllowed === false) return false;
  if (tournament.type === "swiss" && Number(tournament.rulesVersion || 1) >= 4) return swissStillEnterable(tournament);
  return true;
}
