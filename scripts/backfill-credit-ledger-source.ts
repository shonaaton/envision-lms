/**
 * Stamps `source` (and `performedBy`, when a person can be traced) on credit
 * ledger rows written before those fields existed.
 *
 * The pages already explain old rows on the fly (lib/creditMovementBy.ts), so
 * this only makes the answer permanent: once stamped, a row no longer depends
 * on the activity log or the attendance sheet it was traced through.
 *
 *   npx tsx scripts/backfill-credit-ledger-source.ts            # dry run (default)
 *   npx tsx scripts/backfill-credit-ledger-source.ts --apply    # write the changes
 */
import fs from "fs";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import { describeCreditMovements } from "../src/lib/creditMovementBy";
import { CreditLedger } from "../src/models/Fee";

const apply = process.argv.includes("--apply");
const BATCH = 500;

function loadEnvFile(path: string) {
  if (!fs.existsSync(path)) return;
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  if (!String(process.env.MONGODB_URI || "").trim()) {
    console.error("MONGODB_URI is not set. Add it to .env.local before running the credit ledger backfill.");
    process.exitCode = 1;
    return;
  }
  await dbConnect();

  const counts: Record<string, number> = {};
  let scanned = 0;
  let withActor = 0;
  let lastId: mongoose.Types.ObjectId | null = null;
  for (;;) {
    const page: any[] = await CreditLedger.find({ source: { $exists: false }, ...(lastId ? { _id: { $gt: lastId } } : {}) })
      .sort({ _id: 1 })
      .limit(BATCH)
      .populate("invoice", "payment")
      .lean();
    if (!page.length) break;
    lastId = page[page.length - 1]._id;

    const described = await describeCreditMovements(page);
    const writes = page.map((ledger) => {
      const by = described.get(String(ledger._id))!;
      counts[by.source] = (counts[by.source] || 0) + 1;
      const set: Record<string, unknown> = { source: by.source };
      if (!ledger.performedBy && by.actorId) {
        set.performedBy = new mongoose.Types.ObjectId(by.actorId);
        withActor += 1;
      }
      return { updateOne: { filter: { _id: ledger._id, source: { $exists: false } }, update: { $set: set } } };
    });
    scanned += page.length;
    if (apply) await CreditLedger.bulkWrite(writes, { ordered: false });
  }

  console.log(`${apply ? "Updated" : "Would update"} ${scanned} ledger row(s); ${withActor} gain a person.`);
  for (const [source, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${source}: ${count}`);
  if (!apply && scanned) console.log("Dry run only. Re-run with --apply to write.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
