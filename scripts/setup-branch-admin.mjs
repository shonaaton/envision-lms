/**
 * Creates (or resets the password of) the admin account of an offline branch -
 * the one login that runs the whole Bowbazar portal, staff included. Online
 * admins have no access there, so this is the only way to make one.
 *
 * The password is read from the environment at run time and never written to
 * the repo. Run inside the app container:
 *   BRANCH_ADMIN_EMAIL=... BRANCH_ADMIN_PASSWORD=... node scripts/setup-branch-admin.mjs
 * The production image bundles bcryptjs into the app and does not ship it on
 * its own, so there pass a bcrypt hash made elsewhere instead of the password
 * (BRANCH_ADMIN_PASSWORD_HASH); the plain password then never reaches the server.
 * Optional: BRANCH (default "bowbazar"), BRANCH_ADMIN_NAME (default "Bowbazar Admin").
 *
 * An existing account with that email is only updated when it is already this
 * branch's staff; any other account is left alone and the script stops, so it
 * can never quietly take over someone's online login. An online *coach* account
 * can be moved into the branch on purpose with BRANCH_ADMIN_CONVERT_COACH=yes:
 * it then loses the online academy (classes, pay, students) for good. Online
 * admins and students are never converted.
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

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
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
}

const fileEnv = readEnvFile();
const env = (key) => String(process.env[key] || fileEnv[key] || "").trim().replace(/^["']|["']$/g, "");

const branch = env("BRANCH") || "bowbazar";
const email = env("BRANCH_ADMIN_EMAIL").toLowerCase();
const password = process.env.BRANCH_ADMIN_PASSWORD || "";
const givenHash = String(process.env.BRANCH_ADMIN_PASSWORD_HASH || "").trim();
const name = env("BRANCH_ADMIN_NAME") || "Bowbazar Admin";
const convertCoach = env("BRANCH_ADMIN_CONVERT_COACH") === "yes";

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!["bowbazar"].includes(branch)) fail(`Unknown branch "${branch}".`);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Set BRANCH_ADMIN_EMAIL to a valid email address.");
if (givenHash ? !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(givenHash) : password.length < 8) {
  fail("Set BRANCH_ADMIN_PASSWORD (at least 8 characters) or a bcrypt BRANCH_ADMIN_PASSWORD_HASH.");
}

const uri = env("MONGODB_URI");
if (!uri) fail("MONGODB_URI is not set.");

const client = new MongoClient(uri);
try {
  await client.connect();
  const users = client.db(env("MONGODB_DB") || "envision_chess").collection("users");
  const passwordHash = givenHash || (await (await import("bcryptjs")).default.hash(password, 10));
  const now = new Date();
  const existing = await users.findOne({ email }, { projection: { role: 1, branch: 1, branchRole: 1, username: 1 } });

  if (existing) {
    const isBranchStaff = existing.role === "instructor" && existing.branch === branch;
    const isOnlineCoach = existing.role === "instructor" && !existing.branch;
    if (!isBranchStaff && !(isOnlineCoach && convertCoach)) {
      fail(
        `${email} already belongs to an account outside ${branch} (role: ${existing.role}). Nothing was changed.` +
          (isOnlineCoach ? " To move this online coach account into the branch, rerun with BRANCH_ADMIN_CONVERT_COACH=yes." : "")
      );
    }
    await users.updateOne(
      { _id: existing._id },
      {
        $set: { branch, branchRole: "admin", passwordHash, isActive: true, accountStatus: "approved", passwordChangedAt: now, passwordChangeSource: "admin_reset", failedLoginAttempts: 0, updatedAt: now },
        $unset: { tempPassword: 1, loginLockedUntil: 1, deactivatedAt: 1 },
      }
    );
    console.log(`${isBranchStaff ? "Updated" : "Moved the online coach account"} ${email} (${existing.username}) ${isBranchStaff ? "as" : "into"} the ${branch} admin and set its password.`);
  } else {
    let username = "BowbazarAdmin@ENV";
    for (let n = 2; await users.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }, { projection: { _id: 1 } }); n += 1) {
      username = `BowbazarAdmin${n}@ENV`;
    }
    await users.insertOne({
      name,
      email,
      username,
      passwordHash,
      role: "instructor",
      branch,
      branchRole: "admin",
      accountStatus: "approved",
      isActive: true,
      isSuperAdmin: false,
      countryCode: "+91",
      avatar: "",
      failedLoginAttempts: 0,
      passwordChangedAt: now,
      passwordChangeSource: "admin_reset",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created ${email} (${username}) as the ${branch} admin.`);
  }
} finally {
  await client.close();
}
