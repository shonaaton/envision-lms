/**
 * Backfills `User.countryCode` for accounts that have a phone number but no dialling code.
 *
 * Those rows are why WhatsApp automation fell back to +91: the sender has no code to use.
 * The code is inferred from the phone number itself when it already carries one, otherwise
 * from the `country` field. Rows we cannot infer are reported, never guessed — guessing is
 * what produced the wrong numbers in the first place.
 *
 *   npx tsx scripts/backfill-user-country-codes.ts            # dry run (default)
 *   npx tsx scripts/backfill-user-country-codes.ts --apply    # write the changes
 *   npx tsx scripts/backfill-user-country-codes.ts --limit=50 # cap the rows scanned
 */
import fs from "fs";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import { dialCodeForCountryName, splitInternationalNumber } from "../src/lib/phoneCountryCodes";
import { User } from "../src/models/User";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
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

type Inferred = { code: string; source: "phone_prefix" | "country_field" };

function inferCountryCode(user: any): Inferred | null {
  const digits = String(user.phone || "").replace(/[^\d]/g, "").replace(/^0+/, "");
  const fromPhone = digits ? splitInternationalNumber(digits) : null;
  if (fromPhone) return { code: `+${fromPhone.code}`, source: "phone_prefix" };

  const fromCountry = dialCodeForCountryName(user.country);
  if (fromCountry) return { code: `+${fromCountry.code}`, source: "country_field" };

  return null;
}

async function main() {
  const mongoUri = String(process.env.MONGODB_URI || "").trim();
  if (!mongoUri) {
    console.error("MONGODB_URI is not set. Add it to .env.local before running the country code backfill.");
    process.exitCode = 1;
    return;
  }

  await dbConnect();

  const query = User.find({
    phone: { $exists: true, $nin: ["", null] },
    $or: [{ countryCode: { $exists: false } }, { countryCode: "" }, { countryCode: null }],
  }).select("_id name email username role country city phone countryCode").sort({ createdAt: 1 });
  if (limit) query.limit(limit);

  const users: any[] = await query.lean();
  const stats = { scanned: users.length, phonePrefix: 0, countryField: 0, unresolved: 0, updated: 0 };
  const unresolved: any[] = [];
  const byCode = new Map<string, number>();

  for (const user of users) {
    const inferred = inferCountryCode(user);
    if (!inferred) {
      stats.unresolved += 1;
      unresolved.push(user);
      continue;
    }
    if (inferred.source === "phone_prefix") stats.phonePrefix += 1;
    else stats.countryField += 1;
    byCode.set(inferred.code, (byCode.get(inferred.code) || 0) + 1);

    if (apply) {
      await User.updateOne({ _id: user._id }, { $set: { countryCode: inferred.code } });
      stats.updated += 1;
    }
  }

  console.log(`\n${apply ? "Applied" : "Dry run"} — users with a phone but no country code: ${stats.scanned}`);
  console.log(`  inferred from the phone's own prefix: ${stats.phonePrefix}`);
  console.log(`  inferred from the country field:      ${stats.countryField}`);
  console.log(`  could not infer (left untouched):     ${stats.unresolved}`);
  if (apply) console.log(`  rows updated:                        ${stats.updated}`);

  if (byCode.size) {
    console.log("\nBreakdown by inferred code:");
    for (const [code, count] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${code.padEnd(6)} ${count}`);
    }
  }

  if (unresolved.length) {
    console.log(`\nNeeds a manual country code (showing up to 25 of ${unresolved.length}).`);
    console.log("Until these are set they keep falling back to WHATSAPP_DEFAULT_COUNTRY_CODE:");
    for (const user of unresolved.slice(0, 25)) {
      const label = user.username || user.email || user._id;
      console.log(`  ${String(label).padEnd(32)} phone=${String(user.phone || "").padEnd(18)} country=${user.country || "(blank)"}`);
    }
  }

  if (!apply && stats.scanned) console.log("\nNothing was written. Re-run with --apply to save these changes.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
