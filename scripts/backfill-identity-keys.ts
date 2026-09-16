/**
 * Writes `emailCanonical` / `phoneCanonical` onto every existing account, then
 * reports the duplicate clusters those keys expose.
 *
 * New accounts get their keys from the User schema hooks, so this is for the
 * rows that predate them - including the pairs that prompted all of this, like
 * two `Sankesh Roonwal` accounts on one phone number with `dimpleluniya@` and
 * `dimple.luniya@`.
 *
 * Flagging is deliberately opt-in and separate from the key write. The keys are
 * safe to write at any time; raising a review on hundreds of historical rows at
 * once is a decision about somebody's afternoon.
 *
 *   npx tsx scripts/backfill-identity-keys.ts                # dry run (default)
 *   npx tsx scripts/backfill-identity-keys.ts --apply        # write the match keys
 *   npx tsx scripts/backfill-identity-keys.ts --apply --flag # ...and raise the reviews
 *   npx tsx scripts/backfill-identity-keys.ts --limit=50     # cap the rows scanned
 */
import fs from "fs";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import { canonicalEmail, canonicalPhone, duplicateReasonSummary, type DuplicateReason } from "../src/lib/identityMatch";
import { User } from "../src/models/User";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const flag = args.has("--flag");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1] || 0)) : 0;

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

type Row = {
  _id: any;
  name?: string;
  email?: string;
  username?: string;
  phone?: string;
  countryCode?: string;
  accountStatus?: string;
  createdAt?: Date;
  emailKey: string;
  phoneKey: string;
};

/** Groups sharing one key. A group of one is not a duplicate and is dropped. */
function clustersBy(rows: Row[], key: "emailKey" | "phoneKey") {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    groups.set(value, [...(groups.get(value) || []), row]);
  }
  return [...groups.entries()].filter(([, members]) => members.length > 1);
}

function label(row: Row) {
  return `${row.name || "Unnamed"} <${row.email || "no email"}> ${row.username || ""}`.trim();
}

async function main() {
  const mongoUri = String(process.env.MONGODB_URI || "").trim();
  if (!mongoUri) {
    console.error("MONGODB_URI is not set. Add it to .env.local before running the identity key backfill.");
    process.exitCode = 1;
    return;
  }

  await dbConnect();

  const query = User.find({})
    .select("_id name email username phone countryCode accountStatus createdAt emailCanonical phoneCanonical")
    .sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const users: any[] = await query.lean();

  const rows: Row[] = users.map((user) => ({
    ...user,
    emailKey: canonicalEmail(user.email),
    phoneKey: canonicalPhone(user.phone, user.countryCode),
  }));

  let written = 0;
  for (const row of rows) {
    const current = users.find((user) => String(user._id) === String(row._id));
    if (current?.emailCanonical === row.emailKey && current?.phoneCanonical === row.phoneKey) continue;
    if (apply) {
      // Straight to the driver: the schema's update hook derives these from the
      // same two inputs, so routing through it would only recompute what this
      // has already worked out.
      await User.collection.updateOne({ _id: row._id }, { $set: { emailCanonical: row.emailKey, phoneCanonical: row.phoneKey } });
    }
    written += 1;
  }

  const emailClusters = clustersBy(rows, "emailKey");
  const phoneClusters = clustersBy(rows, "phoneKey");
  const byId = new Map(rows.map((row) => [String(row._id), row]));

  // An account can sit in both an email cluster and a phone cluster. Merging the
  // two means it is reviewed once, with both reasons on the card.
  const reasonsByPair = new Map<string, Set<DuplicateReason>>();
  const pairKey = (a: Row, b: Row) => [String(a._id), String(b._id)].sort().join("|");
  const collect = (clusters: Array<[string, Row[]]>, reason: DuplicateReason) => {
    for (const [, members] of clusters) {
      for (const a of members) {
        for (const b of members) {
          if (String(a._id) === String(b._id)) continue;
          const key = pairKey(a, b);
          reasonsByPair.set(key, (reasonsByPair.get(key) || new Set<DuplicateReason>()).add(reason));
        }
      }
    }
  };
  collect(emailClusters, "email");
  collect(phoneClusters, "phone");

  console.log(`\n${apply ? "Applied" : "Dry run"} - accounts scanned: ${rows.length}`);
  console.log(`  match keys ${apply ? "written" : "that would change"}: ${written}`);
  console.log(`  accounts sharing an email inbox: ${emailClusters.reduce((total, [, members]) => total + members.length, 0)} in ${emailClusters.length} groups`);
  console.log(`  accounts sharing a phone number: ${phoneClusters.reduce((total, [, members]) => total + members.length, 0)} in ${phoneClusters.length} groups`);

  const pairs = [...reasonsByPair.entries()];
  if (pairs.length) {
    console.log(`\nOverlapping accounts (${pairs.length} pairs). Most will be siblings - none of this blocks anyone:`);
    for (const [key, reasons] of pairs.slice(0, 40)) {
      const [first, second] = key.split("|").map((id) => byId.get(id)!);
      console.log(`  ${duplicateReasonSummary([...reasons]).padEnd(34)} ${label(first)}  ==  ${label(second)}`);
    }
    if (pairs.length > 40) console.log(`  ...and ${pairs.length - 40} more`);
  }

  if (flag && apply) {
    // Only the newer account in each pair is flagged: the older one is the
    // account of record, and flagging both asks the admin the same question
    // twice. An account an admin has already cleared is left alone.
    let flagged = 0;
    const handled = new Set<string>();
    for (const [key, reasons] of pairs) {
      const [first, second] = key.split("|").map((id) => byId.get(id)!);
      const [older, newer] = [first, second].sort(
        (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
      if (handled.has(String(newer._id))) continue;
      handled.add(String(newer._id));
      await User.collection.updateOne(
        { _id: newer._id, "duplicateReview.status": { $ne: "cleared" } },
        {
          $set: {
            duplicateReview: {
              status: "pending",
              reasons: [...reasons],
              matches: [{
                user: older._id,
                name: older.name || "",
                email: older.email || "",
                username: older.username || "",
                accountStatus: older.accountStatus || "",
                reasons: [...reasons],
                createdAt: older.createdAt,
              }],
              flaggedAt: new Date(),
            },
          },
        }
      );
      flagged += 1;
    }
    console.log(`\nRaised ${flagged} reviews. They are waiting in Demo Center -> Duplicates.`);
  } else if (pairs.length) {
    console.log("\nNo reviews raised. Re-run with --apply --flag to put these in Demo Center -> Duplicates.");
  }

  if (!apply && written) console.log("\nNothing was written. Re-run with --apply to save the match keys.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => undefined);
  });
