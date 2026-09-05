/**
 * Tournament engine benchmark.
 *
 * Measures the pure hot paths — standings recomputation and arena pairing — at
 * realistic tournament sizes, with no database in the way. These are the two
 * pieces of per-event work whose cost grows with the field, so they are what a
 * 200-player arena stands or falls on.
 *
 * End-to-end request latency (p50/p95 for a move, for opponent propagation)
 * needs a running server and Mongo; this measures the algorithmic part that can
 * be measured deterministically.
 *
 *   npx tsx scripts/bench-tournament-engine.ts
 */

import { computeStandings, type ScoredGame, type ScoringOptions, type ScoringPlayer } from "../src/lib/tournament/scoring";
import { buildArenaPairings, mostRecentOpponents, pairingHistory, type GameEdge, type PairingCandidate } from "../src/lib/tournament/pairing";
import { toLeaderboardRows } from "../src/lib/tournamentSocketServer";
import { pairSwissRound, type SwissPlayer } from "../src/lib/tournament/swiss";

const SIZES = [20, 50, 100, 200];
/** Games each player gets through in a typical arena hour. */
const GAMES_PER_PLAYER = 12;

function percentile(samples: number[], p: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function measure(label: string, iterations: number, run: () => void) {
  run(); // warm up
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  console.log(`  ${label.padEnd(34)} p50 ${p50.toFixed(2).padStart(8)} ms   p95 ${p95.toFixed(2).padStart(8)} ms`);
  return { p50, p95 };
}

function buildField(size: number) {
  const players: ScoringPlayer[] = Array.from({ length: size }, (_, index) => ({
    playerKey: `user:p${index}`,
    displayName: `Player ${index}`,
    rating: 1200 + ((index * 37) % 600),
  }));

  const games: ScoredGame[] = [];
  const edges: GameEdge[] = [];
  const totalGames = Math.floor((size * GAMES_PER_PLAYER) / 2);
  for (let index = 0; index < totalGames; index += 1) {
    const white = index % size;
    const black = (index * 7 + 3) % size;
    if (white === black) continue;
    const roll = index % 10;
    const result = roll < 4 ? "1-0" : roll < 8 ? "0-1" : "1/2-1/2";
    games.push({
      id: `g${index}`,
      source: "arena",
      status: "completed",
      result,
      termination: "checkmate",
      whiteKey: players[white].playerKey,
      blackKey: players[black].playerKey,
      plyCount: 30 + (index % 40),
      berserkWhite: index % 11 === 0,
      berserkBlack: index % 13 === 0,
      endedAt: 1_700_000_000_000 + index * 1000,
    });
    edges.push({
      whiteKey: players[white].playerKey,
      blackKey: players[black].playerKey,
      status: "completed",
      createdAt: 1_700_000_000_000 + index * 1000,
    });
  }

  const waiting: PairingCandidate[] = players.map((player, index) => ({
    playerKey: player.playerKey,
    displayName: player.displayName,
    points: (index * 3) % 24,
    gamesPlayed: GAMES_PER_PLAYER,
    lastColor: index % 2 ? "white" : "black",
    waitingMs: (index % 7) * 4000,
  }));

  return { players, games, edges, waiting };
}

const options: ScoringOptions = {
  rulesVersion: 2,
  type: "arena",
  arenaStreaks: true,
  earlyDrawMoveLimit: 10,
  drawStreakLimit: 2,
  berserkMinPlies: 7,
  scoringCutoff: Number.POSITIVE_INFINITY,
};

function main() {
  console.log("Tournament engine benchmark");
  console.log(`Arena field sizes, ~${GAMES_PER_PLAYER} games per player\n`);

  for (const size of SIZES) {
    const { players, games, edges, waiting } = buildField(size);
    console.log(`${size} players / ${games.length} completed games`);

    measure("full standings recompute", 50, () => {
      computeStandings(players, games, options);
    });

    measure("pairing pass (whole field free)", 50, () => {
      const history = pairingHistory(edges);
      const recent = mostRecentOpponents(edges);
      buildArenaPairings(waiting, { history, recent });
    });

    // What every connected client receives when a board finishes. The full
    // standings documents are what the pre-rebuild broadcast effectively cost.
    const standings = computeStandings(players, games, options);
    const fullBytes = Buffer.byteLength(JSON.stringify(standings));
    const compactBytes = Buffer.byteLength(JSON.stringify(toLeaderboardRows(standings)));
    console.log(
      `  ${"standings broadcast per client".padEnd(34)} ${(compactBytes / 1024).toFixed(1)} KB compact   vs ${(fullBytes / 1024).toFixed(1)} KB full   (${(fullBytes / compactBytes).toFixed(1)}x smaller)`
    );

    console.log("");
  }

  console.log("Swiss pairing (Dutch system over maximum-weight matching)\n");
  for (const size of SIZES) {
    // A field several rounds in, so the opponent-avoidance graph is genuinely
    // constrained rather than complete.
    const state: SwissPlayer[] = Array.from({ length: size }, (_, index) => ({
      playerKey: `user:p${index}`,
      displayName: `Player ${index}`,
      points: (index * 7) % 6,
      rating: 1200 + ((index * 37) % 600),
      opponents: [],
      colours: [],
      byes: 0,
      lastFloat: null,
    }));
    const byKey = new Map(state.map((entry) => [entry.playerKey, entry]));
    for (let round = 0; round < 5; round += 1) {
      const seeded = pairSwissRound(Array.from(byKey.values()));
      for (const pair of seeded.pairs) {
        const white = byKey.get(pair.white.playerKey)!;
        const black = byKey.get(pair.black.playerKey)!;
        white.opponents = [...white.opponents, black.playerKey];
        black.opponents = [...black.opponents, white.playerKey];
        white.colours = [...white.colours, "white"];
        black.colours = [...black.colours, "black"];
      }
    }

    console.log(`${size} players, round 6 (five rounds of history)`);
    const result = measure("swiss round pairing", 10, () => {
      pairSwissRound(Array.from(byKey.values()));
    });
    const paired = pairSwissRound(Array.from(byKey.values()));
    console.log(
      `  ${"boards / repeats / exhausted".padEnd(34)} ${paired.pairs.length} boards, ${paired.repeats} repeats, exhausted=${paired.exhausted}`
    );
    void result;
    console.log("");
  }

  console.log("Reference points:");
  console.log("  A full standings recompute runs once per finished game, not once per move.");
  console.log("  A pairing pass runs on the 5s lifecycle tick and after a game ends.");
  console.log("  Standings broadcasts coalesce to at most one per second per tournament.");
  console.log("  A pairing pass emits one batched event, not one per board created.");
  console.log("  A Swiss round is paired once per round, not per request.");
}

main();
