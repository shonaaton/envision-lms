/**
 * Put a class that a coach opened by mistake (or that never really happened)
 * back to "scheduled", so the app's own "Push to next class" button accepts it.
 *
 * Opening the live room calls markScheduledSessionStarted, which marks the class
 * "ongoing" with actualStartedAt, and push_session_forward refuses any class in
 * that state. This undoes exactly those fields and removes the half-open live
 * room record (keyed by scheduledSessionId, so it would otherwise be reused when
 * the class is opened again on its new date).
 *
 * It refuses when the class has a summary, an attendance register, or a credit
 * deduction - that class did happen and needs an outcome instead.
 *
 * Read-only unless you pass --apply. Run inside the app container:
 *   node scripts/unstart-class.mjs "<classroom title>" <YYYY-MM-DD>
 *   node scripts/unstart-class.mjs "<classroom title>" <YYYY-MM-DD> --apply
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

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
function istLabel(date) {
  if (!date) return "-";
  const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} IST`;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [title, dateKey] = args.filter((arg) => !arg.startsWith("--"));
if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) {
  console.error('Usage: node scripts/unstart-class.mjs "<classroom title>" <YYYY-MM-DD> [--apply]');
  process.exit(1);
}

const fileEnv = readEnvFile();
const uri = process.env.MONGODB_URI || fileEnv.MONGODB_URI;
const dbName = process.env.MONGODB_DB || fileEnv.MONGODB_DB || "envision_chess";
if (!uri) {
  console.error("MONGODB_URI must be in .env or passed inline.");
  process.exit(1);
}

const dayStart = new Date(new Date(`${dateKey}T00:00:00Z`).getTime() - IST_OFFSET_MS);
const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const rooms = await db
    .collection("classrooms")
    .find({ title, isSessionInstance: { $ne: true } })
    .project({ title: 1, status: 1, classroomType: 1, coach: 1, students: 1, generatedSessions: 1 })
    .toArray();
  if (rooms.length !== 1) {
    console.error(`Expected exactly one series classroom titled "${title}", found ${rooms.length}.`);
    process.exit(1);
  }
  const room = rooms[0];
  const sessions = (room.generatedSessions || []).filter((s) => {
    const t = new Date(s.scheduledFor || 0).getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });
  console.log(`Classroom ${room._id} "${room.title}" (${room.classroomType}, status ${room.status})`);
  if (sessions.length !== 1) {
    console.error(`Expected one class on ${dateKey}, found ${sessions.length}.`);
    process.exit(1);
  }
  const target = sessions[0];
  const sid = String(target._id);
  console.log(`Class ${sid}: ${istLabel(target.scheduledFor)}, ${target.durationMinutes} min, topic "${target.topicName}"`);
  console.log(`  status ${target.status}, started ${istLabel(target.actualStartedAt)}, ended ${istLabel(target.actualEndedAt)}, coach attendance ${target.coachAttendanceStatus}`);
  console.log(`  summary: ${target.summary ? JSON.stringify(target.summary) : "none"}`);

  const attendance = await db.collection("attendances").find({ classroom: room._id, scheduledSessionId: sid }).toArray();
  const attendanceIds = attendance.map((a) => a._id);
  const ledger = attendanceIds.length
    ? await db.collection("creditledgers").find({ sourceId: { $in: attendanceIds } }).toArray()
    : [];
  const live = await db.collection("classroomsessions").find({ classroom: room._id, scheduledSessionId: sid }).toArray();
  const questions = await db.collection("livequestions").countDocuments({ classroom: room._id, scheduledSessionId: sid });
  const chat = await db.collection("classroomchatmessages").countDocuments({ classroom: room._id, scheduledSessionId: sid });
  console.log(`  attendance registers: ${attendance.length}${attendance.length ? " " + JSON.stringify(attendance.map((a) => a.records)) : ""}`);
  console.log(`  credit ledger rows: ${ledger.length}`);
  for (const l of live) {
    const people = (l.participants || []).map((p) => `${p.role}:${String(p.user)} ${istLabel(p.firstSeenAt)}→${istLabel(p.lastSeenAt)}`);
    console.log(`  live room ${l._id}: status ${l.status}, started ${istLabel(l.startedAt)}, participants ${people.length ? people.join("; ") : "none"}`);
  }
  console.log(`  live questions: ${questions}, chat messages: ${chat}`);

  const problems = [];
  if (target.status !== "ongoing") problems.push(`status is "${target.status}", not "ongoing"`);
  if (target.actualEndedAt) problems.push("the class has an end time");
  if (target.summary?.classOutcome) problems.push("the class already has an outcome");
  if (attendance.length) problems.push("an attendance register exists");
  if (ledger.length) problems.push("credits were deducted");
  if (problems.length) {
    console.error(`\nRefusing: ${problems.join("; ")}. Give it an outcome in the app instead.`);
    process.exit(1);
  }

  const othersOngoing = (room.generatedSessions || []).some((s) => String(s._id) !== sid && s.status === "ongoing");
  console.log(`\nPlan: class ${sid} → scheduled, clear actualStartedAt/conductedBy, coach attendance → pending;`);
  console.log(`      classroom status → ${othersOngoing ? "ongoing (another class is ongoing)" : "scheduled"}; delete ${live.length} live room record(s).`);
  if (!apply) {
    console.log("\nDry run. Pass --apply to write.");
    process.exit(0);
  }

  const result = await db.collection("classrooms").updateOne(
    { _id: room._id, "generatedSessions._id": target._id, "generatedSessions.status": "ongoing" },
    {
      $set: {
        "generatedSessions.$.status": "scheduled",
        "generatedSessions.$.coachAttendanceStatus": "pending",
        ...(othersOngoing ? {} : { status: "scheduled" }),
      },
      $unset: { "generatedSessions.$.actualStartedAt": "", "generatedSessions.$.conductedBy": "" },
    }
  );
  const removed = await db.collection("classroomsessions").deleteMany({ classroom: room._id, scheduledSessionId: sid });
  await db.collection("activities").insertOne({
    type: "classroom.session.unstarted",
    label: `Reset ${target.topicName || "class"} on ${dateKey} to scheduled (opened by mistake)`,
    entityType: "Classroom",
    entityId: room._id,
    metadata: { sessionId: sid, previousStatus: target.status, actualStartedAt: target.actualStartedAt, liveRoomsRemoved: removed.deletedCount, source: "scripts/unstart-class.mjs" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`\nApplied: classroom updated ${result.modifiedCount}, live rooms removed ${removed.deletedCount}.`);
} finally {
  await client.close();
}
