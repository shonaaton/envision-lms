/**
 * Give a staff account the "Sales and Relationship Management" access role.
 *
 * This is what makes someone a salesperson on the platform: demo alerts, demo
 * assessment alerts, and the /sales workspace all resolve their audience from
 * this role rather than from any hardcoded list, so assigning it here is the
 * whole change. See src/lib/demoNotificationRecipients.ts.
 *
 * Sales staff run on `sub-admin` accounts (see the Sales block in
 * src/lib/featureRegistry.ts), so this promotes a `student`/`instructor`
 * account to `sub-admin` as part of the assignment and says so first.
 *
 * Dry run (default - reads only, changes nothing):
 *   MONGODB_URI="mongodb+srv://..." node scripts/assign-sales-role.js sales@example.com
 *
 * Apply:
 *   MONGODB_URI="mongodb+srv://..." node scripts/assign-sales-role.js sales@example.com --apply
 *
 * List who currently holds the role:
 *   MONGODB_URI="mongodb+srv://..." node scripts/assign-sales-role.js --list
 *
 * Remove the role from an account:
 *   MONGODB_URI="mongodb+srv://..." node scripts/assign-sales-role.js sales@example.com --revoke --apply
 *
 * The same assignment is available in the admin UI at /admin/users; this exists
 * for the cases where that is not to hand.
 */
import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Must match SALES_ACCESS_ROLE_NAME_KEY in src/lib/demoNotificationRecipients.ts
// and the nameKey seeded by ensureSalesRole() in src/lib/accessRoles.ts.
const SALES_ROLE_NAME_KEY = "sales and relationship management";

/**
 * Fall back to .env.local so the connection string never has to be pasted onto
 * a command line, where it would land in shell history.
 */
function envFromLocalFile(key) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  if (!fs.existsSync(file)) return "";
  const match = fs.readFileSync(file, "utf8").match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const revoke = args.includes("--revoke");
const list = args.includes("--list");
const email = (args.find((arg) => !arg.startsWith("--")) || "").toLowerCase();
const uri = process.env.MONGODB_URI || envFromLocalFile("MONGODB_URI");

if (!uri || (!email && !list)) {
  console.error("Usage: MONGODB_URI=... node scripts/assign-sales-role.js <email> [--apply] [--revoke]");
  console.error("       MONGODB_URI=... node scripts/assign-sales-role.js --list");
  process.exit(1);
}

function describe(user) {
  return `${user.name} <${user.email}>  role=${user.role}  active=${user.isActive !== false}`;
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || envFromLocalFile("MONGODB_DB") || "envision_chess");
  const users = db.collection("users");
  const roles = db.collection("accessroles");

  const salesRole = await roles.findOne({ nameKey: SALES_ROLE_NAME_KEY });
  if (!salesRole) {
    // Seeded by ensureSalesRole() on first use of the sales workspace. Creating
    // it here with a guessed permission set would risk granting the wrong thing.
    console.error(`No access role with nameKey "${SALES_ROLE_NAME_KEY}" exists yet.`);
    console.error("Open the sales workspace once, or create the role at /admin/roles, then re-run.");
    process.exit(1);
  }
  console.log(`Sales role: "${salesRole.name}" (${salesRole._id}) active=${salesRole.isActive} archived=${salesRole.archivedAt ?? null}`);

  const holders = await users.find({ accessRole: salesRole._id }, { projection: { name: 1, email: 1, role: 1, isActive: 1 } }).toArray();
  console.log(`Currently held by ${holders.length} account(s):`);
  for (const holder of holders) console.log(`  - ${describe(holder)}`);
  if (list) process.exit(0);

  const user = await users.findOne({ email }, { projection: { name: 1, email: 1, role: 1, accessRole: 1, isActive: 1 } });
  if (!user) {
    console.error(`\nNo user found with email ${email}. Nothing changed.`);
    process.exit(1);
  }
  console.log(`\nTarget: ${describe(user)}  accessRole=${user.accessRole ?? null}`);

  const changes = {};
  if (revoke) {
    if (!user.accessRole) console.log("Already holds no access role - nothing to revoke.");
    else changes.accessRole = null;
  } else {
    if (String(user.accessRole || "") === String(salesRole._id)) console.log("Already a salesperson - no change needed.");
    else changes.accessRole = salesRole._id;
    // The sales feature keys are granted through sub-admin accounts; leaving a
    // student or instructor account in place would give the role nowhere to sit.
    if (!revoke && user.role !== "sub-admin" && user.role !== "admin") changes.role = "sub-admin";
  }

  if (!Object.keys(changes).length) process.exit(0);
  console.log("\nPlanned change:");
  for (const [key, value] of Object.entries(changes)) console.log(`  ${key}: ${user[key] ?? null} -> ${value}`);

  if (!apply) {
    console.log("\nDRY RUN - nothing written. Re-run with --apply to make this change.");
    process.exit(0);
  }

  const result = await users.updateOne({ _id: user._id }, { $set: changes });
  console.log(`\nApplied. matched=${result.matchedCount} modified=${result.modifiedCount}`);
  const after = await users.findOne({ _id: user._id }, { projection: { name: 1, email: 1, role: 1, accessRole: 1, isActive: 1 } });
  console.log(`Now: ${describe(after)}  accessRole=${after.accessRole ?? null}`);
} finally {
  await client.close();
}
