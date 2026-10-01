/* Disposable PTM verification server. Never reads or writes the configured LMS DB.
 * Set PTM_MONGO_MEMORY_MODULE to a local mongodb-memory-server installation.
 * Start: node scripts/ptm-local-dev.cjs; stop with Ctrl+C.
 */
const { MongoMemoryReplSet } = require(process.env.PTM_MONGO_MEMORY_MODULE || "mongodb-memory-server");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const output = path.resolve("../../outputs/ptm-verification");
const password = "PtmLocalTest-2026!";
let repl, client, child, collector;
const emails = [];
async function main() {
  fs.mkdirSync(output, { recursive: true });
  repl = await MongoMemoryReplSet.create({ binary: { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }, replSet: { count: 1, storageEngine: "wiredTiger" }, instanceOpts: [{ port: 27122 }] });
  client = new MongoClient(repl.getUri()); await client.connect();
  const db = client.db("ptm_disposable");
  const users = {};
  for (const [key, role, name] of [["admin", "admin", "PTM Test Admin"], ["subadmin", "sub-admin", "PTM Test Sub-admin"], ["coach", "instructor", "PTM Test Coach"], ["student", "student", "PTM Test Student"], ["othercoach", "instructor", "Other PTM Coach"], ["otherstudent", "student", "Other PTM Student"]]) {
    const user = { _id: new ObjectId(), role, name, username: `ptm-${key}`, email: `ptm-${key}@example.test`, passwordHash: await bcrypt.hash(password, 10), accountStatus: "enrolled", isActive: true, isSuperAdmin: key === "admin", batches: [], createdAt: new Date(), updatedAt: new Date() };
    await db.collection("users").insertOne(user); users[key] = String(user._id);
  }
  const classroom = { _id: new ObjectId(), title: "PTM Test Classroom", coach: new ObjectId(users.coach), instructor: new ObjectId(users.coach), students: [new ObjectId(users.student)], isActive: true, isSessionInstance: false, classroomType: "group", status: "scheduled", studentExits: [], generatedSessions: [], closedForStudents: [], batches: [], createdAt: new Date(), updatedAt: new Date() };
  await db.collection("classrooms").insertOne(classroom);
  fs.writeFileSync(path.join(output, "fixtures.json"), JSON.stringify({ users, classroom: String(classroom._id), uri: repl.getUri(), database: "ptm_disposable" }, null, 2));
  collector = http.createServer(async (req, res) => {
    let body = ""; for await (const part of req) body += part;
    if (req.url === "/emails" && req.method === "GET") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(emails)); }
    if (req.url === "/email" && req.method === "POST") { emails.push(JSON.parse(body)); fs.writeFileSync(path.join(output, "emails.json"), JSON.stringify(emails, null, 2)); res.setHeader("Content-Type", "application/json"); return res.end('{"ok":true,"delivered":true}'); }
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => collector.listen(3013, "127.0.0.1", resolve));
  const env = { ...process.env, MONGODB_URI: repl.getUri(), MONGODB_DB: "ptm_disposable", AUTH_SECRET: "ptm-disposable-local-test-secret-2026", AUTH_URL: "http://localhost:3012", NEXTAUTH_URL: "http://localhost:3012", NEXT_PUBLIC_APP_URL: "http://localhost:3012", EMAIL_AUTOMATION_WEBHOOK_URL: "http://127.0.0.1:3013/email", ASK_COACH_EMAIL_WEBHOOK_URL: "http://127.0.0.1:3013/email" };
  // Prevent other test-only events from contacting configured automation endpoints.
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) { const key = line.match(/^([A-Z0-9_]+)=/)?.[1]; if (key && /WEBHOOK_URL$/.test(key) && !(key in env)) env[key] = ""; }
  const log = fs.openSync(path.join(output, "dev-server.log"), "w");
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3012", "-H", "localhost"], { cwd: process.cwd(), env, windowsHide: true, stdio: ["ignore", log, log] });
  console.log("Disposable Mongo replica set and PTM dev server started. Test usernames: ptm-student, ptm-coach, ptm-subadmin, ptm-admin.");
  console.log("Local test password: " + password);
}
async function stop() { if (child) child.kill(); if (collector) collector.close(); if (client) await client.close(); if (repl) await repl.stop(); process.exit(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
main().catch(async error => { console.error(error); await stop(); });
