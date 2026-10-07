/**
 * Undo the damage a "Permanent Timing" change did to a class series before the
 * 2026-10-07 fix.
 *
 * The old action moved every class still marked "scheduled" - including past
 * classes whose register was never marked - and re-laid them all from the
 * "Apply From" date. The class history disappeared from its dates and, since
 * topics follow date order, the syllabus restarted from its first topic.
 *
 * Nothing was deleted: each moved class kept its previous date in
 * `originalDate`, and the change is in the activity log with the ids it moved.
 * This puts back what the fixed action would have done:
 *   - a class that was already in the past goes back to its own date and time;
 *   - an upcoming class dated before "Apply From" goes back to its old slot;
 *   - upcoming classes on/after "Apply From" are re-laid on the new weekly timing;
 *   - topics are recalculated in date order and checked against the topics the
 *     change overwrote (logged as classroom.topics.recalculated).
 *
 * Read-only unless you pass --apply. Run inside the app container:
 *   node scripts/repair-permanent-timing.mjs                      # list affected classrooms
 *   node scripts/repair-permanent-timing.mjs <classroomId>        # show the repair plan
 *   node scripts/repair-permanent-timing.mjs <classroomId> --apply
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";

const IST_OFFSET_MS = 330 * 60000; // Asia/Kolkata has no DST.

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
function istParts(date) {
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    dateKey: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

function istDateTime(dateKey, time) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MS);
}

function label(date) {
  if (!date) return "-";
  const { dateKey, time } = istParts(date);
  return `${dateKey} ${time}`;
}

function weeklyOccurrences(daysOfWeek, effectiveKey, count, notAfter) {
  const slots = (daysOfWeek || [])
    .flatMap((day) => (day.slots || []).map((slot) => ({ day: Number(day.day), ...slot })))
    .sort((a, b) => a.day - b.day || String(a.startTime).localeCompare(String(b.startTime)));
  const out = [];
  if (!slots.length) return out;
  const [y, m, d] = effectiveKey.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  for (let guard = 0; out.length < count && guard < 3700; guard += 1) {
    const key = cursor.toISOString().slice(0, 10);
    for (const slot of slots) {
      if (out.length >= count) break;
      if (slot.day !== cursor.getUTCDay()) continue;
      const scheduledFor = istDateTime(key, slot.startTime);
      if (scheduledFor.getTime() <= notAfter.getTime()) continue;
      out.push({ scheduledFor, startTime: slot.startTime, durationMinutes: Number(slot.durationMinutes || 60) });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const TERMINAL = new Set(["completed", "cancelled", "missed", "abandoned", "absent", "coach_no_show", "student_no_show", "technical_issue"]);
const isAssignable = (s) => !s.actualEndedAt && !TERMINAL.has(String(s.status || "scheduled").toLowerCase());

// Port of recalculateFutureSessionTopics (src/lib/classroomLifecycle.ts).
function recalculateTopics(classroom) {
  const plan = (classroom.sessionPlan || [])
    .map((topic, index) => ({ topicName: String(topic.topicName || "").trim(), topicOrder: Number(topic.topicOrder ?? index) }))
    .filter((topic) => topic.topicName)
    .sort((a, b) => a.topicOrder - b.topicOrder);
  if (!plan.length) return;
  const consumed = new Set();
  for (const s of classroom.generatedSessions) {
    if (String(s.status || "").toLowerCase() === "completed" && s.summary?.topicCompleted !== false) consumed.add(String(s.topicName || "").trim().toLowerCase());
    if (s.topicLocked && isAssignable(s)) consumed.add(String(s.topicName || "").trim().toLowerCase());
  }
  const pending = plan.filter((topic) => !consumed.has(topic.topicName.toLowerCase()));
  let index = 0;
  classroom.generatedSessions
    .filter((s) => isAssignable(s) && (!s.isExtra || s.summary?.createdForTopicContinuation) && !s.topicLocked)
    .sort((a, b) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime())
    .forEach((s) => {
      const next = pending[index];
      if (!next) return;
      index += 1;
      s.topicName = next.topicName;
      s.topicOrder = next.topicOrder;
    });
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const target = args.find((arg) => !arg.startsWith("--"));
const fileEnv = readEnvFile();
const uri = process.env.MONGODB_URI || fileEnv.MONGODB_URI;
const dbName = process.env.MONGODB_DB || fileEnv.MONGODB_DB || "envision_chess";
if (!uri) {
  console.error("MONGODB_URI must be in .env or passed inline.");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const classrooms = db.collection("classrooms");
  const activities = db.collection("activities");

  if (!target) {
    const changes = await activities
      .find({ type: { $in: ["classroom.series.permanent_timing_changed", "classroom.series.exam_break_shifted"] } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    console.log(`\nSeries timing changes (latest ${changes.length}); "past moved" = classes that were already in the past and got moved:\n`);
    for (const change of changes) {
      const room = await classrooms.findOne({ _id: change.entityId }, { projection: { title: 1, batches: 1, generatedSessions: 1 } });
      const ids = new Set((change.metadata?.changedSessions || change.metadata?.shiftedSessions || []).map(String));
      const moved = (room?.generatedSessions || []).filter((s) => ids.has(String(s._id)));
      const pastMoved = moved.filter((s) => s.originalDate && new Date(s.originalDate) < new Date(change.createdAt));
      const batchNames = room?.batches?.length
        ? (await db.collection("batches").find({ _id: { $in: room.batches } }, { projection: { name: 1 } }).toArray()).map((b) => b.name).join(", ")
        : "";
      console.log(
        `${pastMoved.length ? "AFFECTED" : "ok      "}  ${label(change.createdAt)}  ${String(change.entityId)}  ${change.type.split(".").pop()}  ` +
          `moved=${ids.size} pastMoved=${pastMoved.length}  "${room?.title || "(deleted)"}"${batchNames ? `  [${batchNames}]` : ""}`
      );
    }
    console.log("\nShow a repair plan with: node scripts/repair-permanent-timing.mjs <classroomId>\n");
    process.exit(0);
  }

  const classroom = await classrooms.findOne({ _id: new ObjectId(target) });
  if (!classroom) throw new Error(`No classroom ${target}`);
  const change = await activities.findOne(
    { entityId: classroom._id, type: "classroom.series.permanent_timing_changed" },
    { sort: { createdAt: -1 } }
  );
  if (!change) throw new Error("This classroom has no permanent timing change on record.");
  const changedAt = new Date(change.createdAt);
  const effectiveKey = String(change.metadata?.effectiveDate || "");
  const newDays = change.metadata?.daysOfWeek || classroom.daysOfWeek || [];
  const changedIds = new Set((change.metadata?.changedSessions || []).map(String));
  const reasonNote = String(change.metadata?.reason || "").trim() ? `Permanent timing change: ${String(change.metadata.reason).trim()}` : "";

  // A class moved by an earlier action already carried originalDate from that
  // move, so originalDate is not its date just before this change.
  const earlierMoves = await activities
    .find({
      entityId: classroom._id,
      createdAt: { $lt: changedAt },
      type: { $in: ["classroom.series.permanent_timing_changed", "classroom.series.exam_break_shifted", "classroom.session.pushed_forward", "classroom.session.rescheduled"] },
    })
    .toArray();
  const previouslyMoved = new Set(
    earlierMoves.flatMap((a) => [
      ...(a.metadata?.changedSessions || []),
      ...(a.metadata?.shiftedSessions || []),
      ...(a.metadata?.movedSessions || []),
      ...(a.metadata?.sessionId ? [a.metadata.sessionId] : []),
    ]).map(String)
  );

  // Topics the change overwrote, keyed by session id - the ground truth to check against.
  const topicLog = await activities.findOne(
    { entityId: classroom._id, type: "classroom.topics.recalculated", createdAt: { $gte: new Date(changedAt.getTime() - 60000), $lte: new Date(changedAt.getTime() + 60000) } },
    { sort: { createdAt: 1 } }
  );
  const topicBefore = new Map((topicLog?.metadata?.changes || []).map((c) => [String(c.sessionId), c.from]));

  const sessions = classroom.generatedSessions || [];
  const rows = [];
  const relay = [];
  const problems = [];
  for (const s of sessions) {
    const id = String(s._id);
    if (!changedIds.has(id)) continue;
    if (s.actualStartedAt || s.actualEndedAt || s.attendanceMarkedAt || !["scheduled", "rescheduled"].includes(String(s.status || "scheduled"))) {
      problems.push(`${id}: has been taught or marked since the change - left alone (now ${label(s.scheduledFor)}, ${s.status})`);
      continue;
    }
    if (!s.originalDate) {
      problems.push(`${id}: no originalDate - cannot tell where it was`);
      continue;
    }
    if (previouslyMoved.has(id)) problems.push(`${id}: moved by an earlier action too, originalDate ${label(s.originalDate)} is its date before that earlier move`);
    const before = new Date(s.originalDate);
    const row = { s, id, before, from: label(s.scheduledFor), topicNow: s.topicName };
    rows.push(row);
    if (before < changedAt || istParts(before).dateKey < effectiveKey) {
      row.action = before < changedAt ? "restore (past class)" : "restore (before Apply From)";
      row.next = { scheduledFor: before, startTime: istParts(before).time };
    } else {
      row.action = "re-lay on new timing";
      relay.push(row);
    }
  }
  relay.sort((a, b) => a.before - b.before);
  const occurrences = weeklyOccurrences(newDays, effectiveKey, relay.length, changedAt);
  if (occurrences.length !== relay.length) problems.push("The new weekly timing could not cover every upcoming class.");
  relay.forEach((row, i) => {
    row.next = occurrences[i] ? { scheduledFor: occurrences[i].scheduledFor, startTime: occurrences[i].startTime, durationMinutes: occurrences[i].durationMinutes } : null;
  });

  for (const row of rows) {
    if (!row.next) continue;
    const s = row.s;
    s.scheduledFor = row.next.scheduledFor;
    s.startTime = row.next.startTime;
    if (row.next.durationMinutes) s.durationMinutes = row.next.durationMinutes;
    if (!previouslyMoved.has(row.id) && row.action !== "re-lay on new timing") delete s.originalDate;
    // The change appended its note; a restored class should not carry it.
    if (reasonNote && row.action !== "re-lay on new timing" && typeof s.notes === "string") {
      if (s.notes === reasonNote) delete s.notes;
      else if (s.notes.endsWith(`\n${reasonNote}`)) s.notes = s.notes.slice(0, -(reasonNote.length + 1));
    }
  }
  recalculateTopics(classroom);

  console.log(`\n${classroom.title}  (${target})`);
  console.log(`Change made ${label(changedAt)}, Apply From ${effectiveKey}, ${changedIds.size} classes moved.\n`);
  console.log("session                    now at            -> back to           action                       topic now -> topic after  [topic before change]");
  for (const row of rows.sort((a, b) => (a.next?.scheduledFor || 0) - (b.next?.scheduledFor || 0))) {
    const before = topicBefore.has(row.id) ? topicBefore.get(row.id) : row.topicNow;
    const mismatch = before !== row.s.topicName ? "  <-- differs" : "";
    console.log(
      `${row.id}  ${row.from}  -> ${row.next ? label(row.next.scheduledFor) : "??"}  ${row.action.padEnd(27)}  ` +
        `${row.topicNow} -> ${row.s.topicName}  [${before}]${mismatch}`
    );
  }
  if (problems.length) {
    console.log("\nCheck before applying:");
    problems.forEach((p) => console.log(`  - ${p}`));
  }
  if (!topicLog) console.log("\n(No topic recalculation was logged with the change, so topics cannot be checked against it.)");

  if (!apply) {
    console.log("\nDry run - nothing written. Re-run with --apply to save.\n");
    process.exit(0);
  }
  if (rows.some((row) => !row.next)) throw new Error("Not every class has a slot - refusing to write.");

  const lastDate = sessions.reduce((max, s) => (s.scheduledFor && new Date(s.scheduledFor) > max ? new Date(s.scheduledFor) : max), new Date(0));
  await classrooms.updateOne({ _id: classroom._id }, { $set: { generatedSessions: sessions, endDate: lastDate } });
  // Keep each class's per-session instance document in step with its parent.
  for (const s of sessions) {
    if (!changedIds.has(String(s._id))) continue;
    await classrooms.updateOne(
      { parentClassroom: classroom._id, isSessionInstance: true, sourceSessionId: String(s._id) },
      {
        $set: {
          classDate: s.scheduledFor,
          sessionDate: s.scheduledFor,
          startTime: s.startTime,
          durationMinutes: s.durationMinutes,
          topicName: s.topicName,
          "sessionPlan.0.topicName": s.topicName,
          generatedSessions: [s],
        },
      }
    );
  }
  await activities.insertOne({
    type: "classroom.series.permanent_timing_repaired",
    label: `Restored class history after a permanent timing change on ${classroom.title}`,
    entityType: "Classroom",
    entityId: classroom._id,
    metadata: { repairedChange: change._id, restored: rows.map((r) => ({ sessionId: r.id, from: r.from, to: label(r.next.scheduledFor), action: r.action })) },
    occurredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`\nSaved: ${rows.length} classes restored.\n`);
} finally {
  await client.close();
}
