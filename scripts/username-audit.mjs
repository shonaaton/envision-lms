/**
 * Audit — and optionally repair — the generated user IDs (`Rahul@ENV`).
 *
 * Two things can leave the collection wrong, and both look the same to an
 * admin ("the older student's user ID vanished"):
 *   1. Accounts created before user IDs existed, or by the seed script, never
 *      got one at all.
 *   2. Two accounts hold the same ID. Sign-in matches an ID with a single
 *      `findOne`, so only one of them can ever be reached by it; the other
 *      student's ID is effectively gone.
 *
 * Read-only by default. `--fix` backfills missing IDs and renumbers duplicates,
 * always leaving the ID with the OLDEST account so nobody who has been signing
 * in with it loses it — the newer accounts get the next free number.
 *
 * Run from the LMS folder on the VPS:
 *   node scripts/username-audit.mjs                 # report everything
 *   node scripts/username-audit.mjs --name Rahul    # every account by that name
 *   node scripts/username-audit.mjs --fix           # repair, then report
 *
 * MONGODB_URI is read from .env / .env.local, or pass it inline:
 *   MONGODB_URI="mongodb+srv://..." node scripts/username-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (value) => String(value).replace(REGEX_METACHARACTERS, "\\$&");

function readEnvFile() {
  for (const file of [".env", ".env.local"]) {
    const envPath = path.join(process.cwd(), file);
    if (!fs.existsSync(envPath)) continue;
    const parsed = Object.fromEntries(
      fs
        .readFileSync(envPath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
    if (parsed.MONGODB_URI) return parsed;
  }
  return {};
}

const args = process.argv.slice(2);
const apply = args.includes("--fix");
const nameIndex = args.indexOf("--name");
const nameQuery = nameIndex >= 0 ? args[nameIndex + 1] : "";

const env = readEnvFile();
const uri = process.env.MONGODB_URI || env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI not found. Run this from the LMS folder on the server, or pass it inline.");
  process.exit(1);
}

const firstNameOf = (name) =>
  (String(name || "").trim().split(/\s+/)[0] || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^./, (c) => c.toUpperCase()) || "User";

const label = (user) =>
  `${user.name || "(no name)"} <${user.email || "no email"}> · ${user.role || "student"}/${user.accountStatus || "-"}` +
  `${user.isActive === false ? " · INACTIVE" : ""} · created ${user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : "unknown"}`;

const client = new MongoClient(uri);
await client.connect();
const users = client.db(env.MONGODB_DB || undefined).collection("users");

// Every ID currently in use, so repairs never hand out one that is taken.
const taken = new Set(
  (await users.find({ username: { $type: "string" } }).project({ username: 1 }).toArray()).map((u) =>
    String(u.username).toLowerCase()
  )
);

async function nextFreeUsername(name) {
  const first = firstNameOf(name);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = i === 1 ? `${first}@ENV` : `${first}${i}@ENV`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
  throw new Error(`No free user ID for ${name}`);
}

async function assign(user, reason) {
  const username = await nextFreeUsername(user.name);
  if (apply) await users.updateOne({ _id: user._id }, { $set: { username } });
  console.log(`  ${apply ? "assigned" : "would assign"} ${username.padEnd(18)} ${reason} — ${label(user)}`);
  return username;
}

console.log(`\n=== User ID audit ${apply ? "(REPAIRING)" : "(read-only — pass --fix to repair)"} ===`);
console.log(`accounts: ${await users.countDocuments()}`);

// 1. Duplicates: same ID on more than one account, compared without case.
const duplicateGroups = await users
  .aggregate([
    { $match: { username: { $type: "string" } } },
    { $group: { _id: { $toLower: "$username" }, users: { $push: "$$ROOT" } } },
    { $match: { "users.1": { $exists: true } } },
  ])
  .toArray();

console.log(`\n-- shared user IDs: ${duplicateGroups.length} --`);
for (const group of duplicateGroups) {
  const ordered = group.users.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  console.log(`\n${group.users[0].username} is held by ${ordered.length} accounts:`);
  console.log(`  keeps it: ${label(ordered[0])}`);
  for (const user of ordered.slice(1)) await assign(user, "duplicate");
}

// 2. Accounts with no user ID at all — they cannot sign in with one.
const missing = await users
  .find({ $or: [{ username: null }, { username: "" }, { username: { $exists: false } }] })
  .sort({ createdAt: 1 })
  .toArray();
console.log(`\n-- accounts with no user ID: ${missing.length} --`);
for (const user of missing) await assign(user, "was blank");

// 3. Whether the database itself still enforces uniqueness.
const indexes = await users.indexes();
const usernameIndex = indexes.find((index) => index.key && index.key.username === 1 && index.unique);
console.log(
  `\n-- unique index on username: ${usernameIndex ? `present (${usernameIndex.name})` : "MISSING — the database is not blocking duplicates"} --`
);
if (!usernameIndex) {
  console.log("   Once the duplicates above are fixed, restarting the app rebuilds it automatically.");
}

// 4. Optional: everyone sharing one first name, to check a specific report.
if (nameQuery) {
  const matches = await users
    .find({ $or: [{ name: new RegExp(`^${escapeRegex(nameQuery)}`, "i") }, { username: new RegExp(`^${escapeRegex(nameQuery)}`, "i") }] })
    .sort({ createdAt: 1 })
    .toArray();
  console.log(`\n-- accounts matching "${nameQuery}": ${matches.length} --`);
  for (const user of matches) console.log(`  ${String(user.username || "(no user ID)").padEnd(18)} ${label(user)}`);
}

if (!apply && (duplicateGroups.length || missing.length)) {
  console.log("\nNothing was changed. Re-run with --fix to apply the assignments listed above.");
}
console.log("");
await client.close();
