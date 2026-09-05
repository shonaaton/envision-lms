/**
 * Full-arena load simulation.
 *
 * Plays a complete one-hour Arena at 20, 50, 100 and 200 players and measures
 * the work the server would actually do: pairing passes on the lifecycle tick,
 * a standings recompute per finished game, and the bytes broadcast to each
 * connected client.
 *
 * The question this answers is the one the audit opened with — whether a move
 * costs O(1) or O(all players x all games). It runs the real pairing and
 * scoring code with no database, so the numbers are the algorithm's, not the
 * network's. End-to-end request latency needs the integration harness and a
 * test database.
 *
 *   npx tsx scripts/loadtest-arena.ts
 */

import { computeStandings, type ScoredGame, type ScoringOptions, type ScoringPlayer } from "../src/lib/tournament/scoring";
import { buildArenaPairings, mostRecentOpponents, pairingHistory, type GameEdge, type PairingCandidate } from "../src/lib/tournament/pairing";
import { toLeaderboardRows } from "../src/lib/tournamentSocketServer";

const FIELD_SIZES = [20, 50, 100, 200];
/** One hour of arena, with the lifecycle tick every five seconds. */
const ARENA_MINUTES = 60;
const TICK_SECONDS = 5;
/** A 3+2 game in a school arena runs roughly four minutes including the increment. */
const MEAN_GAME_SECONDS = 240;
const GAME_SPREAD_SECONDS = 150;

function percentile(samples: number[], p: number) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

type SimPlayer = PairingCandidate & { busyUntil: number; results: string[] };

function runArena(size: number) {
  const random = seeded(1000 + size);
  const players: SimPlayer[] = Array.from({ length: size }, (_, index) => ({
    playerKey: `user:p${index}`,
    displayName: `Player ${index}`,
    points: 0,
    gamesPlayed: 0,
    lastColor: "",
    waitingMs: 0,
    busyUntil: 0,
    results: [],
  }));
  const byKey = new Map(players.map((player) => [player.playerKey, player]));

  const scoringPlayers: ScoringPlayer[] = players.map((player) => ({
    playerKey: player.playerKey,
    displayName: player.displayName,
    rating: 1200,
  }));
  const options: ScoringOptions = {
    rulesVersion: 2,
    type: "arena",
    arenaStreaks: true,
    earlyDrawMoveLimit: 10,
    drawStreakLimit: 2,
    berserkMinPlies: 7,
    scoringCutoff: Number.POSITIVE_INFINITY,
  };

  const finished: ScoredGame[] = [];
  const edges: GameEdge[] = [];
  const live: Array<{ white: SimPlayer; black: SimPlayer; endsAt: number; id: string }> = [];

  const pairingSamples: number[] = [];
  const standingsSamples: number[] = [];
  let pairingPasses = 0;
  let boardsOpened = 0;
  let gamesFinished = 0;
  let moves = 0;

  const totalSeconds = ARENA_MINUTES * 60;
  let gameId = 0;

  for (let clock = 0; clock <= totalSeconds; clock += TICK_SECONDS) {
    // Finish any game whose time is up. Each finish costs one standings
    // recompute, which is the only tournament-wide work in the design.
    for (let index = live.length - 1; index >= 0; index -= 1) {
      const game = live[index];
      if (game.endsAt > clock) continue;
      live.splice(index, 1);

      const roll = random();
      const result = roll < 0.45 ? "1-0" : roll < 0.9 ? "0-1" : "1/2-1/2";
      finished.push({
        id: game.id,
        source: "arena",
        status: "completed",
        result,
        termination: "checkmate",
        whiteKey: game.white.playerKey,
        blackKey: game.black.playerKey,
        plyCount: 30 + Math.floor(random() * 40),
        endedAt: clock * 1000,
      });
      edges.push({ whiteKey: game.white.playerKey, blackKey: game.black.playerKey, status: "completed", createdAt: clock * 1000 });
      game.white.busyUntil = clock;
      game.black.busyUntil = clock;
      gamesFinished += 1;

      const started = performance.now();
      const standings = computeStandings(scoringPlayers, finished, options);
      standingsSamples.push(performance.now() - started);
      for (const entry of standings) {
        const player = byKey.get(entry.playerKey);
        if (player) {
          player.points = entry.points;
          player.gamesPlayed = entry.gamesPlayed;
          player.lastColor = entry.lastColor;
        }
      }
    }

    // The pairing pass the lifecycle worker runs on every tick.
    const busy = new Set(live.flatMap((game) => [game.white.playerKey, game.black.playerKey]));
    const waiting = players
      .filter((player) => !busy.has(player.playerKey))
      .map((player) => ({ ...player, waitingMs: Math.max(0, (clock - player.busyUntil) * 1000) }));

    const startedPairing = performance.now();
    const history = pairingHistory(edges);
    const recent = mostRecentOpponents(edges);
    const { pairs } = buildArenaPairings(waiting, { history, recent });
    pairingSamples.push(performance.now() - startedPairing);
    pairingPasses += 1;

    for (const pair of pairs) {
      const white = byKey.get(pair.white.playerKey)!;
      const black = byKey.get(pair.black.playerKey)!;
      const duration = Math.max(40, MEAN_GAME_SECONDS + (random() - 0.5) * GAME_SPREAD_SECONDS * 2);
      gameId += 1;
      live.push({ white, black, endsAt: clock + duration, id: `g${gameId}` });
      boardsOpened += 1;
      // A rough ply count for the move-volume figure below.
      moves += Math.round(duration / 6);
    }
  }

  const standings = computeStandings(scoringPlayers, finished, options);
  const broadcastBytes = Buffer.byteLength(JSON.stringify(toLeaderboardRows(standings)));

  return {
    size,
    pairingPasses,
    boardsOpened,
    gamesFinished,
    moves,
    pairingP50: percentile(pairingSamples, 50),
    pairingP95: percentile(pairingSamples, 95),
    standingsP50: percentile(standingsSamples, 50),
    standingsP95: percentile(standingsSamples, 95),
    broadcastBytes,
    serverMs: pairingSamples.reduce((a, b) => a + b, 0) + standingsSamples.reduce((a, b) => a + b, 0),
  };
}

function main() {
  console.log(`Arena load simulation - ${ARENA_MINUTES} minute event, ${TICK_SECONDS}s lifecycle tick\n`);

  const rows = FIELD_SIZES.map(runArena);

  console.log(
    [
      "players".padEnd(9),
      "games".padStart(7),
      "moves".padStart(8),
      "pair p50/p95".padStart(16),
      "standings p50/p95".padStart(19),
      "broadcast".padStart(11),
      "total CPU".padStart(11),
    ].join("")
  );
  console.log("-".repeat(82));

  for (const row of rows) {
    console.log(
      [
        String(row.size).padEnd(9),
        String(row.gamesFinished).padStart(7),
        String(row.moves).padStart(8),
        `${row.pairingP50.toFixed(2)}/${row.pairingP95.toFixed(2)}ms`.padStart(16),
        `${row.standingsP50.toFixed(2)}/${row.standingsP95.toFixed(2)}ms`.padStart(19),
        `${(row.broadcastBytes / 1024).toFixed(1)}KB`.padStart(11),
        `${(row.serverMs / 1000).toFixed(2)}s`.padStart(11),
      ].join("")
    );
  }

  console.log("\nPer-player-hour cost");
  for (const row of rows) {
    const perMove = row.moves ? (row.serverMs / row.moves).toFixed(4) : "0";
    console.log(
      `  ${String(row.size).padStart(3)} players: ${(row.serverMs / row.size).toFixed(1)}ms of engine CPU per player, ${perMove}ms per move`
    );
  }

  console.log("\nWhat this shows");
  console.log("  Engine CPU is spent on pairing passes and one standings recompute per finished game.");
  console.log("  An ordinary move does none of it: it is one game write and one small event.");
  const largest = rows[rows.length - 1];
  console.log(
    `  A ${largest.size}-player hour costs ${(largest.serverMs / 1000).toFixed(2)}s of engine CPU in total, across ${largest.moves} moves.`
  );
}

main();
