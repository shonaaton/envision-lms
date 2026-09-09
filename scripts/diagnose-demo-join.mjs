/**
 * Explain exactly why a student is bounced out of the live classroom.
 *
 * Pressing Join sends the student to /classrooms/<id>/live, which applies eight
 * separate rules and redirects on any of them. Until recently every one of those
 * redirects was silent and identical from the outside - the student simply
 * landed back on the dashboard - so there was no way to tell a missing
 * permission from a closed join window from a roster mismatch.
 *
 * This runs those same rules against the live database, in the same order, and
 * reports the first one that fails. It is READ-ONLY: it writes nothing.
 *
 * Run from the LMS folder on the VPS:
 *   node scripts/diagnose-demo-join.mjs "student@example.com"
 *   node scripts/diagnose-demo-join.mjs "Rahul@ENV"
 *
 * MONGODB_URI is read from .env automatically, or pass it inline:
 *   MONGODB_URI="mongodb+srv://..." node scripts/diagnose-demo-join.mjs "student@example.com"
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const ACADEMY_TIME_ZONE = process.env.NEXT_PUBLIC_ACADEMY_TIME_ZONE || "Asia/Kolkata";
const JOIN_OPENS_MINUTES_BEFORE = 5;
const JOIN_GRACE_MINUTES_AFTER = 120;

function readEnvFile() {
  for (const name of [".env", ".env.local"]) {
    const envPath = path.join(process.cwd(), name);
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
    if (parsed.MONGODB_URI && !parsed.MONGODB_URI.includes("<")) return parsed;
  }
  return {};
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Mirrors src/lib/academyTime.ts - a session's startTime is a wall clock in
// academy time, never the server's timezone.
function dateParts(value, timeZone = ACADEMY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function offsetMs(date, timeZone) {
  const p = dateParts(date, timeZone);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
}

function academyDateTime(dateValue, time = "00:00") {
  const { year, month, day } = dateParts(dateValue);
  const normalized = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const [hours, minutes] = normalized.split(":").map(Number);
  const firstGuess = Date.UTC(+year, +month - 1, +day, hours || 0, minutes || 0, 0);
  const adjusted = firstGuess - offsetMs(new Date(firstGuess), ACADEMY_TIME_ZONE);
  return new Date(firstGuess - offsetMs(new Date(adjusted), ACADEMY_TIME_ZONE));
}

function sessionStart(session) {
  const base = session.scheduledFor || session.classDate;
  if (!base) return null;
  const date = session.startTime ? academyDateTime(base, String(session.startTime)) : new Date(base);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sessionEnd(session) {
  const start = sessionStart(session);
  if (!start) return null;
  return new Date(start.getTime() + Math.max(15, Number(session.durationMinutes || 60)) * 60000);
}

function joinWindow(session, now = new Date()) {
  const start = sessionStart(session);
  const end = sessionEnd(session);
  if (!start || !end) return { open: false, opensAt: null, closesAt: null };
  const opensAt = new Date(start.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60000);
  const closesAt = new Date(end.getTime() + JOIN_GRACE_MINUTES_AFTER * 60000);
  return { open: now >= opensAt && now <= closesAt, opensAt, closesAt, start };
}

function derivedStatus(session) {
  const raw = String(session?.status || "scheduled").toLowerCase();
  if (["cancelled", "rescheduled", "abandoned", "coach_no_show", "student_no_show", "absent", "technical_issue", "missed"].includes(raw)) return raw;
  if (session?.actualEndedAt) return "completed";
  if (session?.actualStartedAt) return "ongoing";
  return raw;
}

function fmt(date) {
  return date ? new Intl.DateTimeFormat("en-IN", { timeZone: ACADEMY_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(date) : "-";
}

const id = (value) => String(value?._id ?? value ?? "");

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const loginValue = (args[0] || "").trim();
const fileEnv = readEnvFile();
const uri = process.env.MONGODB_URI || fileEnv.MONGODB_URI;
const dbName = process.env.MONGODB_DB || fileEnv.MONGODB_DB || "envision_chess";

if (!loginValue || !uri || uri.includes("<")) {
  console.error('Usage: node scripts/diagnose-demo-join.mjs "<student email or user ID>"');
  console.error("A real MONGODB_URI must be in .env / .env.local, or passed inline.");
  process.exit(1);
}

const client = new MongoClient(uri);
const problems = [];

try {
  await client.connect();
  const db = client.db(dbName);
  const now = new Date();

  const user = await db.collection("users").findOne({
    $or: [{ email: loginValue.toLowerCase() }, { username: new RegExp(`^${escapeRegex(loginValue)}$`, "i") }],
  });
  if (!user) {
    console.log(`\nNo account matches "${loginValue}".\n`);
    process.exit(0);
  }
  const userId = id(user);

  console.log(`\n=== Student =================================================`);
  console.log(`  name          : ${user.name}`);
  console.log(`  id            : ${userId}`);
  console.log(`  role          : ${user.role}${user.role === "student" ? "" : "   <-- the live page only treats \"student\" as a participant"}`);
  console.log(`  isActive      : ${user.isActive !== false}`);
  console.log(`  accountStatus : ${user.accountStatus || "(unset)"}`);
  console.log(`  accessRole    : ${user.accessRole ? id(user.accessRole) : "(none)"}`);

  // Rule: isCurrentStudent()
  if (user.role !== "student") problems.push("Their role is not \"student\", so participantHasAccess() falls through to the coach check and fails -> redirect to /dashboard.");
  if (user.isActive === false) problems.push("isActive is false, so isCurrentStudent() fails -> redirect to /dashboard.");

  // Rule: a named access role replaces the default role permissions entirely.
  if (user.accessRole) {
    const role = await db.collection("accessroles").findOne({ _id: user.accessRole });
    const grants = role?.permissions?.classrooms || [];
    console.log(`  role name     : ${role?.name || "(missing role document)"}`);
    console.log(`  classrooms    : ${grants.length ? grants.join(", ") : "(no grants)"}`);
    if (!role?.isActive || role?.archivedAt) problems.push("Their named access role is inactive/archived, so every feature grant is dropped -> redirect to /dashboard?restricted=1.");
    else if (!grants.includes("join") && !grants.includes("full")) problems.push(`Their access role "${role.name}" does not grant classrooms:join -> redirect to /classrooms.`);
  }

  // Rule: canAccessFeature("classrooms", user, "join")
  const feature = await db.collection("featureaccesses").findOne({ key: "classrooms" });
  const studentGrants = feature?.rolePermissions?.student || [];
  console.log(`\n=== classrooms feature ======================================`);
  console.log(`  status        : ${feature?.status || "(no document - defaults apply)"}`);
  console.log(`  student perms : ${studentGrants.length ? studentGrants.join(", ") : "(none)"}`);
  if (feature) {
    const denied = (feature.userOverrides || []).find((o) => id(o.user) === userId && o.access === "deny");
    if (denied) problems.push("A per-user DENY override on the classrooms feature blocks them -> redirect to /classrooms.");
    if (feature.status === "disabled") problems.push("The classrooms feature is disabled -> redirect to /classrooms.");
    if (feature.status === "coming_soon") problems.push("The classrooms feature is set to \"coming soon\" -> redirect to /dashboard?restricted=1.");
    if (feature.status === "testing" && !(feature.pilotRoles || []).includes("student") && !(feature.pilotUsers || []).map(id).includes(userId))
      problems.push("The classrooms feature is in testing and this student is not in the pilot -> redirect to /classrooms.");
    if (!user.accessRole && !studentGrants.includes("join") && !studentGrants.includes("full"))
      problems.push("Students are not granted classrooms:join in Feature Access -> redirect to /classrooms.");
  }

  // Rule: getClassroomCreditEligibility()
  const creditPlan = await db.collection("feeassignments").findOne({ student: user._id, type: "credits" });
  if (creditPlan) {
    const balance = Number(creditPlan.creditBalance || 0);
    console.log(`\n  credit plan   : balance ${balance}`);
    if (balance <= -1) problems.push(`Credit balance is ${balance} -> blocked, redirect to /classrooms?credits=blocked.`);
  }

  // The classrooms the dashboard would offer a Join button for.
  const classrooms = await db.collection("classrooms")
    .find({ students: user._id, isActive: { $ne: false }, isSessionInstance: { $ne: true } })
    .toArray();

  console.log(`\n=== Classrooms they are enrolled in: ${classrooms.length} ==============`);
  if (!classrooms.length) {
    problems.push("They are not in the students array of ANY classroom, so nothing on the dashboard can lead to a live room.");
  }

  for (const classroom of classrooms) {
    const sessions = Array.isArray(classroom.generatedSessions) ? classroom.generatedSessions : [];
    console.log(`\n  ${classroom.title}`);
    console.log(`    id              : ${id(classroom)}`);
    console.log(`    type / status   : ${classroom.classroomType || "(none)"} / ${classroom.status || "(none)"}`);
    console.log(`    isTestClassroom : ${classroom.isTestClassroom === true ? "TRUE  <-- the live room refuses this outright" : "no"}`);
    console.log(`    meetingUrl      : ${classroom.meetingUrl || "(empty - no second tab will open)"}`);
    console.log(`    onRoster        : ${(classroom.students || []).map(id).includes(userId) ? "yes" : "NO"}`);
    console.log(`    sessions        : ${sessions.length}`);

    if (classroom.isTestClassroom === true)
      problems.push(`"${classroom.title}" is flagged isTestClassroom, and the live page refuses a sandbox classroom for anyone but the super admin who owns it -> redirect to /dashboard.`);
    if (!(classroom.students || []).map(id).includes(userId))
      problems.push(`"${classroom.title}" does not list them in students, so participantHasAccess() fails -> redirect to /dashboard.`);
    if (classroom.meetingUrl && !/^https:\/\/meet\.google\.com\//i.test(String(classroom.meetingUrl).trim()))
      problems.push(`"${classroom.title}" has a meeting URL that is not a meet.google.com link, so the second tab is silently skipped.`);
    if (!classroom.meetingUrl)
      problems.push(`"${classroom.title}" has no meeting URL, so no meeting tab opens on Join.`);

    for (const session of sessions) {
      const window = joinWindow(session, now);
      const status = derivedStatus(session);
      console.log(`      - session ${id(session)}`);
      console.log(`          starts ${fmt(window.start)}  (${session.startTime || "no startTime"}, ${session.durationMinutes || "?"} min)`);
      console.log(`          join window ${fmt(window.opensAt)} -> ${fmt(window.closesAt)}  [${window.open ? "OPEN NOW" : "closed now"}]`);
      console.log(`          status ${status}`);
      const live = await db.collection("classroomsessions").findOne({ classroom: classroom._id, scheduledSessionId: id(session) });
      if (live) console.log(`          live room ${live.status}`);
      if (window.open) {
        if (["completed", "cancelled", "rescheduled", "missed"].includes(status))
          problems.push(`The session on "${classroom.title}" is inside its join window but its status is "${status}" -> redirect to /classrooms.`);
        if (live?.status === "ended")
          problems.push(`The live room for "${classroom.title}" is already marked ended -> redirect to /classrooms.`);
      }
    }

    if (sessions.length && !sessions.some((session) => joinWindow(session, now).open))
      problems.push(`No session on "${classroom.title}" is inside its join window right now, so the Join button is disabled (it opens 5 min before the start, and closes 2 h after the end).`);
    if (!sessions.length && !classroom.classDate)
      problems.push(`"${classroom.title}" has no generatedSessions and no classDate, so there is no session to join.`);
  }

  console.log(`\n=== Verdict =================================================`);
  console.log(`  Academy time now: ${fmt(now)} (${ACADEMY_TIME_ZONE})\n`);
  if (!problems.length) {
    console.log("  Every rule the live classroom applies passes for this student.");
    console.log("  If Join still bounces them, the deployed build is older than these");
    console.log("  checks - redeploy and read the ?live= reason in the address bar.\n");
  } else {
    for (const problem of problems) console.log(`  - ${problem}`);
    console.log("");
  }
} catch (error) {
  console.error("\nDiagnosis failed:", error.message, "\n");
  process.exitCode = 1;
} finally {
  await client.close();
}
