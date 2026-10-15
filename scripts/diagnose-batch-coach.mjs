/**
 * Why does a batch's old coach still see a class after a permanent coach change?
 *
 * Read-only. Prints the batch, every classroom attached to it (including session
 * instances), each classroom's coach, the classes on the given IST day with the
 * fields that decide who sees them, and the coach-change activity log.
 *
 * Run inside the app container:
 *   node scripts/diagnose-batch-coach.mjs <batch name> [YYYY-MM-DD]
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";

const IST_OFFSET_MS = 330 * 60000;

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

// Fixed-offset arithmetic rather than Intl: prod ICU prints midnight as hour 24.
function label(date) {
  if (!date) return "-";
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 16).replace("T", " ");
}

function istDayKey(date) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const [batchName, dayArg] = process.argv.slice(2);
if (!batchName) {
  console.error("Usage: node scripts/diagnose-batch-coach.mjs <batch name> [YYYY-MM-DD]");
  process.exit(1);
}
const day = dayArg || istDayKey(new Date());

const uri = process.env.MONGODB_URI || readEnvFile().MONGODB_URI;
const client = new MongoClient(uri);
await client.connect();
const db = client.db();

const names = new Map();
async function who(id) {
  if (!id) return "-";
  const key = String(id);
  if (!names.has(key)) {
    const user = await db.collection("users").findOne({ _id: new ObjectId(key) }, { projection: { name: 1, username: 1 } });
    names.set(key, user ? `${user.name || user.username} (${key})` : `? (${key})`);
  }
  return names.get(key);
}

const batch = await db.collection("batches").findOne({ name: { $regex: batchName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } });
if (!batch) {
  console.log(`No batch matching "${batchName}"`);
  await client.close();
  process.exit(0);
}
console.log(`Batch ${batch.name} (${batch._id}) coach=${await who(batch.coach)} active=${batch.isActive !== false} paused=${Boolean(batch.isPaused)}`);
console.log(`Now: ${label(new Date())} IST, checking classes on ${day}\n`);

const classrooms = await db.collection("classrooms").find({ batches: batch._id }).toArray();
for (const classroom of classrooms) {
  console.log(
    `Classroom ${classroom.title} (${classroom._id}) type=${classroom.classroomType} status=${classroom.status} active=${classroom.isActive !== false}` +
      ` instance=${Boolean(classroom.isSessionInstance)} source=${classroom.sourceSessionId || "-"}`
  );
  console.log(`  coach=${await who(classroom.coach)} instructor=${await who(classroom.instructor)}`);
  const sessions = (classroom.generatedSessions || []).filter((session) => session.scheduledFor && istDayKey(session.scheduledFor) === day);
  for (const session of sessions) {
    console.log(
      `  class ${session._id} #${session.sessionNumber} at ${label(session.scheduledFor)} (${session.durationMinutes || classroom.durationMinutes || 60}m) status=${session.status}` +
        ` started=${label(session.actualStartedAt)} ended=${label(session.actualEndedAt)} marked=${label(session.attendanceMarkedAt)}`
    );
    console.log(
      `    assignedCoach=${await who(session.assignedCoach)} substituteCoach=${await who(session.substituteCoach)} conductedBy=${await who(session.conductedBy)}`
    );
  }
  if (!sessions.length) console.log("  (no class on that day)");

  const changes = await db
    .collection("activities")
    .find({ entityId: classroom._id, type: { $regex: "coach" } })
    .sort({ occurredAt: 1 })
    .toArray();
  for (const change of changes) {
    console.log(`  activity ${label(change.occurredAt)} ${change.type} by ${await who(change.actor)}: ${change.label}`);
  }
  console.log("");
}

const batchChanges = await db
  .collection("activities")
  .find({ entityId: batch._id })
  .sort({ occurredAt: -1 })
  .limit(10)
  .toArray();
for (const change of batchChanges) {
  console.log(`batch activity ${label(change.occurredAt)} ${change.type} by ${await who(change.actor)}: ${change.label}`);
}

await client.close();
