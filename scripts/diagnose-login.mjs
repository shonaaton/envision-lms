/**
 * Explain exactly why a sign-in is being refused.
 *
 * The login endpoint deliberately returns a generic "invalid credentials" for
 * every failure so nothing leaks to the browser, which also makes support
 * questions undiagnosable from the outside. This runs against the live database
 * and reports the real reason. Read-only unless you pass --unlock.
 *
 * Run from the LMS folder on the VPS:
 *   node scripts/diagnose-login.mjs "Rahul@ENV"
 *   node scripts/diagnose-login.mjs "Rahul@ENV" "theirPassword"
 *   node scripts/diagnose-login.mjs "Rahul@ENV" --unlock
 *
 * MONGODB_URI is read from .env automatically, or pass it inline:
 *   MONGODB_URI="mongodb+srv://..." node scripts/diagnose-login.mjs "Rahul@ENV"
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const MAX_FAILED_LOGINS_BEFORE_LOCK = 5;

function readEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
        return [key, value];
      })
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const args = process.argv.slice(2);
const unlock = args.includes("--unlock");
const positional = args.filter((arg) => !arg.startsWith("--"));
const loginValue = (positional[0] || "").trim();
const password = positional[1];

const fileEnv = readEnvFile();
const uri = process.env.MONGODB_URI || fileEnv.MONGODB_URI;
const dbName = process.env.MONGODB_DB || fileEnv.MONGODB_DB || "envision_chess";

if (!loginValue || !uri) {
  console.error('Usage: node scripts/diagnose-login.mjs "<email or user ID>" [password] [--unlock]');
  console.error("MONGODB_URI must be in .env or passed inline.");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const users = client.db(dbName).collection("users");
  const normalized = loginValue.toLowerCase();

  // Same lookup the login endpoint performs.
  const user = await users.findOne({
    $or: [{ email: normalized }, { username: new RegExp(`^${escapeRegex(loginValue)}$`, "i") }],
  });

  if (!user) {
    console.log(`\nNo account matches "${loginValue}".\n`);
    const exact = await users.findOne({ $or: [{ email: normalized }, { username: loginValue }] });
    console.log(
      exact
        ? "It matches only case-sensitively, so the deployed build is missing the case-insensitive user ID fix."
        : "Nothing matches this email or user ID even case-insensitively. Check for a typo, or that the account was actually created."
    );
    const like = await users
      .find({ $or: [{ email: new RegExp(escapeRegex(normalized.split("@")[0]), "i") }, { username: new RegExp(escapeRegex(loginValue.split("@")[0]), "i") }] })
      .project({ username: 1, email: 1, name: 1 })
      .limit(5)
      .toArray();
    if (like.length) {
      console.log("\nSimilar accounts:");
      for (const candidate of like) console.log(`  ${candidate.name} | user ID: ${candidate.username} | email: ${candidate.email}`);
    }
    process.exit(0);
  }

  const locked = user.loginLockedUntil && new Date(user.loginLockedUntil).getTime() > Date.now();
  console.log(`\nAccount found: ${user.name}`);
  console.log(`  user ID        : ${user.username}`);
  console.log(`  email          : ${user.email}`);
  console.log(`  role           : ${user.role}`);
  console.log(`  isActive       : ${user.isActive !== false}`);
  console.log(`  accountStatus  : ${user.accountStatus || "(unset)"}`);
  console.log(`  passwordHash   : ${user.passwordHash ? "present" : "MISSING - login can never succeed"}`);
  console.log(`  failedAttempts : ${user.failedLoginAttempts || 0} of ${MAX_FAILED_LOGINS_BEFORE_LOCK}`);
  console.log(`  locked         : ${locked ? `YES until ${new Date(user.loginLockedUntil).toISOString()}` : "no"}`);
  console.log(`  tempPassword   : ${user.tempPassword ? `"${user.tempPassword}"` : "(not stored)"}`);

  if (password !== undefined) {
    const matches = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    console.log(`\n  supplied password matches: ${matches ? "YES" : "NO"}`);
    if (matches && locked) console.log("  -> The password is correct; the lockout is what is refusing the login.");
    if (!matches && user.tempPassword) console.log(`  -> The stored temporary password is "${user.tempPassword}".`);
  }

  if (locked) {
    console.log(
      unlock
        ? "\nClearing the lock..."
        : "\nThis account is locked. Re-run with --unlock to clear it, or wait for the timestamp above."
    );
    if (unlock) {
      await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0 }, $unset: { loginLockedUntil: "" } });
      console.log("Lock cleared. They can sign in again immediately.");
    }
  } else if (unlock) {
    await users.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0 }, $unset: { loginLockedUntil: "" } });
    console.log("\nNo lock was set; failed attempt counter reset anyway.");
  }
  console.log("");
} finally {
  await client.close();
}
