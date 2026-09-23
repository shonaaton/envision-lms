/**
 * Re-label past classes that were really student no-shows.
 *
 * Until 2026-09-23 a coach could leave the class outcome on "completed", mark
 * the only student as a no-show, and have the class saved as "abandoned"
 * because it ran under 30 minutes. Those classes never reached the admin's
 * no-show rulings. `outcomeFromStudentRecords` fixes this for new saves; this
 * script fixes the classes saved before it.
 *
 * A class qualifies when it is not a demo, nobody was present or late, at least
 * one student was marked no-show, and it was saved as abandoned, absent or
 * missed. Classes saved as "completed" are only listed, never changed, because
 * changing them would pull already-payable classes back into review.
 *
 * Moves no credits and sends no emails: the admin decides both in the ruling.
 *
 * Run from the LMS folder on the VPS. Dry run by default:
 *   node scripts/backfill-student-no-show-outcomes.mjs
 *   node scripts/backfill-student-no-show-outcomes.mjs --apply
 *
 * MONGODB_URI is read from .env automatically, or pass it inline.
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const RELABELLED_OUTCOMES = new Set(["abandoned", "absent", "missed"]);
const apply = process.argv.includes("--apply");

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

const uri = process.env.MONGODB_URI || readEnvFile().MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const attendances = db.collection("attendances");
const classrooms = db.collection("classrooms");

const candidates = await attendances
  .find({ "records.status": { $eq: "student_no_show", $nin: ["present", "late"] } })
  .toArray();

const toFix = [];
const leftAlone = [];
for (const attendance of candidates) {
  const statuses = (attendance.records || []).map((record) => String(record?.status || ""));
  if (!statuses.includes("student_no_show") || statuses.some((status) => status === "present" || status === "late")) continue;
  const classroom = await classrooms.findOne(
    { _id: attendance.classroom },
    { projection: { title: 1, classroomType: 1, generatedSessions: 1 } }
  );
  if (!classroom || classroom.classroomType === "demo") continue;
  const session = (classroom.generatedSessions || []).find((item) => String(item._id) === String(attendance.scheduledSessionId || ""));
  const saved = String(session?.status || attendance.metadata?.classOutcome || "");
  const row = { attendance, classroom, session, saved };
  if (saved === "student_no_show") continue;
  if (RELABELLED_OUTCOMES.has(saved)) toFix.push(row);
  else leftAlone.push(row);
}

const label = ({ classroom, attendance, saved }) =>
  `${classroom.title} | ${new Date(attendance.sessionDate).toISOString().slice(0, 10)} | saved as ${saved || "(none)"}`;

console.log(`${toFix.length} class(es) to re-label as student no-show:`);
toFix.forEach((row) => console.log(`  ${label(row)}`));
if (leftAlone.length) {
  console.log(`${leftAlone.length} no-show class(es) left as saved (review by hand):`);
  leftAlone.forEach((row) => console.log(`  ${label(row)}`));
}

if (!apply) {
  console.log("\nDry run. Pass --apply to write.");
  await client.close();
  process.exit(0);
}

for (const { attendance, classroom, session } of toFix) {
  await attendances.updateOne(
    { _id: attendance._id },
    {
      $set: {
        "metadata.classOutcome": "student_no_show",
        "metadata.creditPolicy": "repeat_no_show_policy",
        "metadata.topicCompleted": false,
        "metadata.noShowBackfilledAt": new Date(),
      },
    }
  );
  if (session) {
    await classrooms.updateOne(
      { _id: classroom._id, "generatedSessions._id": session._id },
      {
        $set: {
          "generatedSessions.$.status": "student_no_show",
          "generatedSessions.$.summary.classOutcome": "student_no_show",
          "generatedSessions.$.summary.creditPolicy": "repeat_no_show_policy",
          "generatedSessions.$.summary.topicCompleted": false,
        },
      }
    );
  }
}
console.log(`\nRe-labelled ${toFix.length} class(es). They now appear under Coach Pay > No-show rulings.`);
await client.close();
