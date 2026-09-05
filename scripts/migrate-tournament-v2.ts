/**
 * Tournament v2 migration.
 *
 * Brings existing data up to what the rebuilt engine expects, without changing
 * any recorded result:
 *
 *   1. Backfills `ply` on games, so the compare-and-set that makes moves
 *      idempotent has something to compare against.
 *   2. Backfills `startFen` for tournaments with a custom starting position, so
 *      those games replay correctly.
 *   3. Rebuilds stored PGN from move history. Games played before this rebuild
 *      stored only their final move.
 *   4. Drops the array-subdocument indexes that cost writes and answered no
 *      query, and creates the game indexes the new queries need.
 *   5. Leaves `rulesVersion` alone: existing tournaments stay on the rules they
 *      were played under. Only newly created tournaments get v2.
 *
 * Safe to re-run. Pass --dry to report without writing.
 *
 *   npx tsx scripts/migrate-tournament-v2.ts [--dry]
 */

import { dbConnect } from "../src/lib/db";
import { Tournament } from "../src/models/Tournament";
import { TournamentGame } from "../src/models/TournamentGame";
import { buildPgn } from "../src/lib/tournament/chessRules";

const dryRun = process.argv.includes("--dry");

function log(...args: unknown[]) {
  console.log(dryRun ? "[dry]" : "[migrate]", ...args);
}

async function backfillGames() {
  const tournaments: any[] = await Tournament.find({}, "name startingPosition timeControlMinutes initialClockSeconds incrementSeconds").lean();
  const startFenByTournament = new Map<string, string>(
    tournaments.map((tournament) => [
      String(tournament._id),
      tournament.startingPosition?.type === "custom" && tournament.startingPosition?.fen ? String(tournament.startingPosition.fen) : "",
    ])
  );

  const cursor = TournamentGame.find({}, "tournament ply moveHistorySAN pgn startFen roundNumber whiteName blackName result termination startedAt createdAt").cursor();
  let scanned = 0;
  let plyFixed = 0;
  let fenFixed = 0;
  let pgnFixed = 0;
  let unreplayable = 0;

  for await (const game of cursor as any) {
    scanned += 1;
    const moves: string[] = game.moveHistorySAN || [];
    const set: Record<string, any> = {};

    if (game.ply === undefined || game.ply === null || Number(game.ply) !== moves.length) {
      set.ply = moves.length;
      plyFixed += 1;
    }

    const startFen = startFenByTournament.get(String(game.tournament)) || "";
    if (startFen && !game.startFen) {
      set.startFen = startFen;
      fenFixed += 1;
    }

    if (moves.length) {
      try {
        const pgn = buildPgn(moves, {
          round: game.roundNumber || "-",
          white: game.whiteName || "?",
          black: game.blackName || "Bye",
          result: game.result || "*",
          termination: game.termination || undefined,
          startFen: set.startFen || game.startFen || null,
          date: game.startedAt || game.createdAt,
        });
        if (pgn !== game.pgn) {
          set.pgn = pgn;
          pgnFixed += 1;
        }
      } catch {
        // Leave the stored value alone rather than replacing it with nothing.
        unreplayable += 1;
      }
    }

    if (Object.keys(set).length && !dryRun) {
      await TournamentGame.updateOne({ _id: game._id }, { $set: set });
    }
  }

  log(`games scanned=${scanned} ply=${plyFixed} startFen=${fenFixed} pgn=${pgnFixed} unreplayable=${unreplayable}`);
}

async function fixIndexes() {
  const collection = Tournament.collection;
  const existing = await collection.indexes().catch(() => []);
  // Indexes declared inside `standings` and `participantStates` re-indexed
  // every entry on each standings rewrite and served no query.
  const obsolete = existing.filter((index: any) =>
    Object.keys(index.key || {}).some((field) => field.startsWith("standings.") || field.startsWith("participantStates."))
  );
  for (const index of obsolete) {
    const name = String(index.name || "");
    if (!name) continue;
    log(`dropping obsolete tournament index ${name}`);
    if (!dryRun) await collection.dropIndex(name).catch((error: any) => log(`  could not drop: ${error?.message}`));
  }

  if (!dryRun) {
    await TournamentGame.collection.createIndex({ tournament: 1, status: 1, endedAt: 1 }).catch(() => null);
    await TournamentGame.collection.createIndex({ tournament: 1, whiteKey: 1, status: 1 }).catch(() => null);
    await TournamentGame.collection.createIndex({ tournament: 1, blackKey: 1, status: 1 }).catch(() => null);
  }
  log("game indexes ensured");
}

async function reportRulesVersions() {
  const [legacy, current] = await Promise.all([
    Tournament.countDocuments({ $or: [{ rulesVersion: { $exists: false } }, { rulesVersion: { $lt: 2 } }] }),
    Tournament.countDocuments({ rulesVersion: { $gte: 2 } }),
  ]);
  log(`rules versions: legacy(v1)=${legacy} current(v2)=${current}`);
  log("legacy tournaments keep their original scoring and tie-break rules by design");
}

async function main() {
  await dbConnect();
  await backfillGames();
  await fixIndexes();
  await reportRulesVersions();
  log("done");
  process.exit(0);
}

main().catch((error) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
