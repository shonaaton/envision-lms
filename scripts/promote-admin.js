/**
 * Promote a user to admin role in MongoDB.
 *
 * Two ways to run:
 *
 * A) From MongoDB Atlas UI:
 *    - Open your cluster, then Browse Collections, then envision_chess.users.
 *    - Find the user, click edit, set `role` = "admin", save.
 *
 * B) From your laptop / VPS with mongosh installed:
 *    MONGODB_URI="mongodb+srv://..." node scripts/promote-admin.js you@example.com
 *    MONGODB_URI="mongodb+srv://..." node scripts/promote-admin.js you@example.com --super
 *
 * Requires the mongodb npm package (already a dep of mongoose).
 */
import { MongoClient } from "mongodb";

const email = process.argv[2];
const makeSuperAdmin = process.argv.includes("--super");
const uri = process.env.MONGODB_URI;

if (!email || !uri) {
  console.error("Usage: MONGODB_URI=... node scripts/promote-admin.js <email> [--super]");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "envision_chess");
  const res = await db.collection("users").updateOne(
    { email: email.toLowerCase() },
    { $set: { role: "admin", ...(makeSuperAdmin ? { isSuperAdmin: true } : {}) } }
  );
  if (res.matchedCount === 0) {
    console.error(`No user found with email ${email}`);
  } else {
    console.log(makeSuperAdmin ? `${email} is now Super Admin` : `${email} is now admin`);
  }
} finally {
  await client.close();
}
