/**
 * Tournament integration tests, against a real MongoDB.
 *
 * The race guards are proven deterministically in `guards.test.ts` without a
 * database. This exercises the same guarantees through the actual engine and
 * driver, which is the only way to know the filters behave as expected against
 * a real server.
 *
 * SAFETY
 * ------
 * This writes and deletes data, so it refuses to run against anything that
 * might be production. It requires TEST_MONGODB_URI to be set explicitly, it
 * will not accept a value equal to MONGODB_URI, and it insists the database
 * name marks itself as a test database.
 *
 *   TEST_MONGODB_URI="mongodb://localhost:27017/envision_test" npx tsx scripts/integration-tournament.ts
 */

import mongoose from "mongoose";
import { Tournament } from "../src/models/Tournament";
import { TournamentGame } from "../src/models/TournamentGame";
import { applyGameMove, completeGame, generateSwissRound, MoveConflictError, syncArenaPairings } from "../src/lib/tournamentEngine";

const TEST_URI = process.env.TEST_MONGODB_URI || "";
const PRODUCTION_URI = process.env.MONGODB_URI || "";

function refuse(reason: string): never {
  console.error(`\nRefusing to run: ${reason}\n`);
  console.error("This script writes and deletes tournament data. Point it at a throwaway database:");
  console.error('  TEST_MONGODB_URI="mongodb://localhost:27017/envision_test" npx tsx scripts/integration-tournament.ts\n');
  process.exit(1);
}

function assertSafeTarget() {
  if (!TEST_URI) refuse("TEST_MONGODB_URI is not set.");
  if (PRODUCTION_URI && TEST_URI.trim() === PRODUCTION_URI.trim()) {
    refuse("TEST_MONGODB_URI is the same as MONGODB_URI.");
  }
  const databaseName = TEST_URI.split("/").pop()?.split("?")[0] || "";
  if (!/test/i.test(databaseName)) {
    refuse(`the database name "${databaseName}" does not contain "test".`);
  }
  // A shared cluster is exactly where an accident would be expensive.
  if (/mongodb\+srv/i.test(TEST_URI) && !process.env.ALLOW_REMOTE_TEST_DB) {
    refuse("TEST_MONGODB_URI points at a hosted cluster. Set ALLOW_REMOTE_TEST_DB=1 if that is genuinely a test cluster.");
  }
}

/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
const createdTournaments: any[] = [];

async function test(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (error: any) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error?.message || error}`);
    failed += 1;
  }
}

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function makeTournament(overrides: any = {}) {
  const players = overrides.playerCount ?? 4;
  const owner = new mongoose.Types.ObjectId();
  const userIds = Array.from({ length: players }, () => new mongoose.Types.ObjectId());

  const tournament: any = await Tournament.create({
    name: `Integration ${Date.now()}`,
    type: overrides.type || "arena",
    status: "playing",
    rulesVersion: 2,
    initialClockSeconds: 180,
    timeControlMinutes: 3,
    incrementSeconds: 0,
    arenaDurationMinutes: 60,
    arenaEndsAt: new Date(Date.now() + 3600_000),
    rounds: overrides.rounds || 3,
    startAt: new Date(Date.now() - 60_000),
    startedAt: new Date(Date.now() - 60_000),
    createdBy: owner,
    participants: userIds,
    standings: userIds.map((id, index) => ({
      playerKey: `user:${id}`,
      user: id,
      displayName: `Player ${index}`,
      rating: 1500,
    })),
    participantStates: userIds.map((id) => ({ playerKey: `user:${id}`, status: "joined" })),
    ...overrides.tournament,
  });
  createdTournaments.push(tournament._id);
  return { tournament, userIds };
}

async function makeGame(tournament: any, userIds: any[]) {
  return TournamentGame.create({
    tournament: tournament._id,
    source: tournament.type,
    roundNumber: 0,
    tableNumber: 1,
    whiteUser: userIds[0],
    blackUser: userIds[1],
    whiteKey: `user:${userIds[0]}`,
    blackKey: `user:${userIds[1]}`,
    whiteName: "Player 0",
    blackName: "Player 1",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    ply: 0,
    initialClockMs: 180000,
    whiteClockMs: 180000,
    blackClockMs: 180000,
    turn: "w",
    status: "active",
  });
}

async function main() {
  assertSafeTarget();
  await mongoose.connect(TEST_URI);
  console.log(`\nConnected to ${TEST_URI.replace(/\/\/[^@]*@/, "//<redacted>@")}\n`);

  await test("a duplicated move applies exactly once", async () => {
    const { tournament, userIds } = await makeTournament();
    const game: any = await makeGame(tournament, userIds);

    // Both requests read the same position, as two tabs or a retry would.
    const first: any = await TournamentGame.findById(game._id);
    const second: any = await TournamentGame.findById(game._id);
    const results = await Promise.allSettled([
      applyGameMove(first, { from: "e2", to: "e4" }, { expectedPly: 0 }),
      applyGameMove(second, { from: "e2", to: "e4" }, { expectedPly: 0 }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const conflicts = results.filter(
      (result) => result.status === "rejected" && (result as PromiseRejectedResult).reason instanceof MoveConflictError
    );
    expect(fulfilled.length === 1, `expected 1 move to succeed, got ${fulfilled.length}`);
    expect(conflicts.length === 1, "expected the duplicate to be rejected as a conflict");

    const stored: any = await TournamentGame.findById(game._id).lean();
    expect(stored.ply === 1, `expected ply 1, got ${stored.ply}`);
    expect(stored.moveHistorySAN.length === 1, `expected 1 move recorded, got ${stored.moveHistorySAN.length}`);
  });

  await test("a stale move is rejected rather than replayed", async () => {
    const { tournament, userIds } = await makeTournament();
    const game: any = await makeGame(tournament, userIds);
    const stale: any = await TournamentGame.findById(game._id);

    await applyGameMove(await TournamentGame.findById(game._id), { from: "e2", to: "e4" }, { expectedPly: 0 });
    let rejected = false;
    try {
      await applyGameMove(stale, { from: "d2", to: "d4" }, { expectedPly: 0 });
    } catch (error) {
      rejected = error instanceof MoveConflictError;
    }
    expect(rejected, "expected the stale move to be rejected");

    const stored: any = await TournamentGame.findById(game._id).lean();
    expect(stored.moveHistorySAN.join(" ") === "e4", `expected only e4, got "${stored.moveHistorySAN.join(" ")}"`);
  });

  await test("two simultaneous finishes record one result", async () => {
    const { tournament, userIds } = await makeTournament();
    const game: any = await makeGame(tournament, userIds);

    const [a, b] = await Promise.all([TournamentGame.findById(game._id), TournamentGame.findById(game._id)]);
    await Promise.all([
      completeGame(a, { result: "1-0", termination: "resign", winnerKey: `user:${userIds[0]}` }),
      completeGame(b, { result: "0-1", termination: "timeout", winnerKey: `user:${userIds[1]}` }),
    ]);

    const stored: any = await TournamentGame.findById(game._id).lean();
    expect(stored.status === "completed", "expected the game to be completed");
    expect(["1-0", "0-1"].includes(stored.result), `unexpected result ${stored.result}`);
    // Whichever won, exactly one termination is recorded.
    expect(["resign", "timeout"].includes(stored.termination), `unexpected termination ${stored.termination}`);
  });

  await test("concurrent pairing passes never double-book a player", async () => {
    const { tournament } = await makeTournament({ playerCount: 8 });
    await Promise.all([
      syncArenaPairings(String(tournament._id)),
      syncArenaPairings(String(tournament._id)),
      syncArenaPairings(String(tournament._id)),
    ]);

    const games: any[] = await TournamentGame.find({ tournament: tournament._id, status: "active" }).lean();
    const seats = games.flatMap((game) => [game.whiteKey, game.blackKey]);
    expect(new Set(seats).size === seats.length, `a player was paired twice: ${seats.join(", ")}`);
    expect(games.length === 4, `expected 4 boards for 8 players, got ${games.length}`);
  });

  await test("concurrent round generation produces one round", async () => {
    const { tournament } = await makeTournament({ type: "swiss", playerCount: 8, rounds: 3, tournament: { currentRound: 0 } });
    const results = await Promise.allSettled([
      generateSwissRound(String(tournament._id)),
      generateSwissRound(String(tournament._id)),
      generateSwissRound(String(tournament._id)),
    ]);
    const created = results.filter((result) => result.status === "fulfilled" && (result as any).value?.created);
    expect(created.length === 1, `expected 1 round to be created, got ${created.length}`);

    const fresh: any = await Tournament.findById(tournament._id).lean();
    expect(fresh.roundsData.length === 1, `expected 1 round recorded, got ${fresh.roundsData.length}`);
    expect(fresh.currentRound === 1, `expected currentRound 1, got ${fresh.currentRound}`);

    const games: any[] = await TournamentGame.find({ tournament: tournament._id }).lean();
    expect(games.length === 4, `expected 4 boards for 8 players, got ${games.length}`);
    const seats = games.flatMap((game) => [game.whiteKey, game.blackKey].filter(Boolean));
    expect(new Set(seats).size === seats.length, "a player appears on two boards in the same round");
  });

  await test("a finished game is not re-finished by the timeout worker", async () => {
    const { tournament, userIds } = await makeTournament();
    const game: any = await makeGame(tournament, userIds);
    await completeGame(await TournamentGame.findById(game._id), {
      result: "1-0",
      termination: "resign",
      winnerKey: `user:${userIds[0]}`,
    });
    const before: any = await TournamentGame.findById(game._id).lean();
    await completeGame(await TournamentGame.findById(game._id), { result: "0-1", termination: "timeout" });
    const after: any = await TournamentGame.findById(game._id).lean();
    expect(after.result === before.result, `result changed from ${before.result} to ${after.result}`);
    expect(after.termination === before.termination, "termination changed after the game was already over");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);

  // Leave the test database as it was found.
  if (createdTournaments.length) {
    await TournamentGame.deleteMany({ tournament: { $in: createdTournaments } });
    await Tournament.deleteMany({ _id: { $in: createdTournaments } });
    console.log(`Cleaned up ${createdTournaments.length} tournaments and their games.\n`);
  }

  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("Integration run failed:", error);
  try {
    if (createdTournaments.length) {
      await TournamentGame.deleteMany({ tournament: { $in: createdTournaments } });
      await Tournament.deleteMany({ _id: { $in: createdTournaments } });
    }
    await mongoose.disconnect();
  } catch {
    // Nothing more to do; the process is exiting either way.
  }
  process.exit(1);
});
