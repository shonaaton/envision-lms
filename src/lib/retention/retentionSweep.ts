import "server-only";

import { Types } from "mongoose";
import { academyDateKey, academyTimeOfDay } from "@/lib/academyTime";
import { exitStudentId as idOf, hasStudentExited } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { joinedAt } from "@/lib/feesMetrics";
import { ATTENDED_STATUSES, LEVEL_RANK, RISK_THRESHOLDS, assessRisk, coachHeadsUp, needsCall, type RiskResult, type RiskSnapshot } from "@/lib/retention/riskRules";
import { raiseRetentionRiskTask, resolveRetentionRiskTask } from "@/lib/tasks/taskTriggers";
import { Attendance } from "@/models/Attendance";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { FeeAssignment, Invoice, Notification } from "@/models/Fee";
import { Homework, Submission } from "@/models/Homework";
import { LearningExerciseProgress } from "@/models/Learning";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";
import { RetentionFlag, RetentionSweepRun } from "@/models/RetentionFlag";
import { StudentPause } from "@/models/StudentPause";
import { TacticAttempt } from "@/models/TacticPuzzle";
import { User } from "@/models/User";

// Nothing here may import lib/studentPause.ts or lib/fees.ts: both pull in
// Node's crypto, and this file is reachable from instrumentation.ts, whose
// bundle then fails to compile. Pause and fee state are read from the models.

const DAY = 86_400_000;
const LOOKBACK_DAYS = 90;
const HOMEWORK_LOOKBACK_DAYS = 45;
/** A family a person settled is left alone this long, unless it gets worse. */
const SETTLED_QUIET_DAYS = 14;
/** Coach-side outcomes and classes that did not happen say nothing about the student. */
const SKIPPED_COACH_STATUSES = ["cancelled", "rescheduled", "coach_no_show"];

/** IST hour from which the day's sweep runs - before the 9:00 task digest picks the tasks up. */
export function retentionSweepHour() {
  const hour = Number(process.env.RETENTION_SWEEP_HOUR);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8;
}

/**
 * Hourly job. Once a day (after `retentionSweepHour()` IST) it scores every
 * active student and keeps the RetentionFlag records, the admins' "call this
 * family" tasks and the coaches' heads-up in step with the result.
 * `force` runs it again regardless of the hour and the day's claim.
 */
export async function processRetentionSweep(now = new Date(), options: { force?: boolean } = {}) {
  await dbConnect();
  if (!options.force) {
    const hour = Number(academyTimeOfDay(now).split(":")[0]);
    if (hour < retentionSweepHour()) return { skipped: "before_sweep_hour" as const };
  }
  const dateKey = academyDateKey(now);
  if (!options.force) {
    if (await RetentionSweepRun.exists({ dateKey, finishedAt: { $exists: true } })) return { skipped: "already_ran" as const };
    // A crashed run is retried after an hour rather than waiting for tomorrow.
    // The unique index on dateKey settles two instances claiming at once.
    const stale = new Date(now.getTime() - 60 * 60_000);
    const claimed = await RetentionSweepRun.updateOne(
      { dateKey, finishedAt: { $exists: false }, startedAt: { $lt: stale } },
      { $set: { startedAt: now }, $setOnInsert: { dateKey } },
      { upsert: true }
    ).catch((error: any) => {
      if (error?.code === 11000) return { modifiedCount: 0, upsertedCount: 0 };
      throw error;
    });
    if (!claimed.modifiedCount && !claimed.upsertedCount) return { skipped: "already_ran" as const };
  }

  const snapshots = await buildSnapshots(now);
  const summary = await syncFlags(snapshots, now);
  await RetentionSweepRun.updateOne({ dateKey }, { $set: { finishedAt: new Date(), summary }, $setOnInsert: { startedAt: now } }, { upsert: true });
  return summary;
}

type StudentContext = {
  student: any;
  snapshot: RiskSnapshot;
  coachIds: string[];
};

async function buildSnapshots(now: Date): Promise<Map<string, StudentContext>> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  const students: any[] = await User.find({ role: "student", isActive: { $ne: false }, accountStatus: { $ne: "demo" } })
    .select("name username createdAt conversionSetup batches isActive")
    .lean();
  const studentById = new Map(students.map((student) => [idOf(student), student]));

  const classrooms: any[] = await Classroom.find({
    isActive: { $ne: false },
    isTestClassroom: { $ne: true },
    isSessionInstance: { $ne: true },
    classroomType: { $ne: "demo" },
    status: { $ne: "cancelled" },
    students: { $in: students.map((student) => student._id) },
  })
    .select("coach instructor students studentExits closedForStudents pausedForStudents generatedSessions.assignedCoach generatedSessions.scheduledFor")
    .lean();

  const pauses: any[] = await StudentPause.find({ status: { $ne: "cancelled" }, pausedFrom: { $gte: new Date(now.getTime() - RISK_THRESHOLDS.repeatPauseDays * DAY) } })
    .select("student status pausedFrom pausedUntil")
    .lean();
  const activePauses: any[] = await StudentPause.find({ status: "active" }).select("student pausedFrom pausedUntil").lean();
  const activePauseByStudent = new Map(activePauses.map((pause) => [idOf(pause.student), pause]));
  const recentPauseCount = new Map<string, number>();
  pauses.forEach((pause) => recentPauseCount.set(idOf(pause.student), (recentPauseCount.get(idOf(pause.student)) || 0) + 1));

  // Who is actually in a class right now, which classes, and with which coach.
  const membership = new Map<string, { classroomIds: string[]; coachIds: Set<string>; coachChangedAt: Date | null }>();
  for (const classroom of classrooms) {
    const closed = new Set((classroom.closedForStudents || []).map(idOf));
    const coachId = idOf(classroom.coach || classroom.instructor);
    const changedAt = lastCoachChange(classroom, coachId, now);
    for (const studentId of (classroom.students || []).map(idOf)) {
      if (!studentById.has(studentId) || closed.has(studentId) || hasStudentExited(classroom, studentId)) continue;
      const entry = membership.get(studentId) || { classroomIds: [], coachIds: new Set<string>(), coachChangedAt: null };
      entry.classroomIds.push(idOf(classroom));
      if (coachId) entry.coachIds.add(coachId);
      if (changedAt && (!entry.coachChangedAt || changedAt > entry.coachChangedAt)) entry.coachChangedAt = changedAt;
      membership.set(studentId, entry);
    }
  }

  // Scored: everyone in a class, plus everyone paused (who is out of class on purpose).
  const population = students.filter((student) => membership.has(idOf(student)) || activePauseByStudent.has(idOf(student)));
  const ids = population.map((student) => student._id);
  if (!ids.length) return new Map();

  const [attendanceByStudent, lastAttended, homeworkByStudent, practiceByStudent, effortByStudent, feesByStudent] = await Promise.all([
    readAttendance(ids, since, now),
    readLastAttended(ids, now),
    readHomework(population, classrooms, membership, now),
    readPractice(ids, since),
    readEffort(ids, now),
    readFees(ids, now),
  ]);

  const result = new Map<string, StudentContext>();
  for (const student of population) {
    const studentId = idOf(student);
    const pause = activePauseByStudent.get(studentId);
    const member = membership.get(studentId);
    result.set(studentId, {
      student,
      coachIds: Array.from(member?.coachIds || []),
      snapshot: {
        now,
        isActive: student.isActive !== false,
        joinedAt: joinedAt(student),
        attendance: attendanceByStudent.get(studentId) || [],
        lastAttendedAt: lastAttended.get(studentId) || null,
        homework: homeworkByStudent.get(studentId) || [],
        lastPracticeAt: practiceByStudent.get(studentId) || null,
        latestEffort: effortByStudent.get(studentId) ?? null,
        coachChangedAt: member?.coachChangedAt || null,
        fees: feesByStudent.get(studentId) || {},
        pause: pause ? { pausedFrom: new Date(pause.pausedFrom), pausedUntil: new Date(pause.pausedUntil) } : null,
        recentPauseCount: recentPauseCount.get(studentId) || 0,
      },
    });
  }
  return result;
}

/**
 * A hand-over pins the outgoing coach on every class already taught
 * (`assignedCoach`). The latest such class taught by someone other than the
 * current coach dates the change; substitutions do not pin, so they never count.
 */
function lastCoachChange(classroom: any, currentCoachId: string, now: Date) {
  let latest: Date | null = null;
  for (const session of classroom.generatedSessions || []) {
    const pinned = idOf(session?.assignedCoach);
    if (!pinned || pinned === currentCoachId || !session?.scheduledFor) continue;
    const at = new Date(session.scheduledFor);
    if (at > now) continue;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

async function excludedClassroomIds() {
  return Classroom.find({ $or: [{ classroomType: "demo" }, { isTestClassroom: true }] }).distinct("_id");
}

async function readAttendance(ids: any[], since: Date, now: Date) {
  const excluded = await excludedClassroomIds();
  const rows: any[] = await Attendance.aggregate([
    { $match: { sessionDate: { $gte: since, $lte: now }, classroom: { $nin: excluded }, coachStatus: { $nin: SKIPPED_COACH_STATUSES }, "records.student": { $in: ids } } },
    { $unwind: "$records" },
    { $match: { "records.student": { $in: ids } } },
    { $project: { _id: 0, student: "$records.student", status: "$records.status", date: "$sessionDate" } },
  ]);
  const map = new Map<string, RiskSnapshot["attendance"]>();
  rows.forEach((row) => {
    const key = idOf(row.student);
    const list = map.get(key) || [];
    list.push({ date: new Date(row.date), status: String(row.status || "") });
    map.set(key, list);
  });
  return map;
}

/**
 * Last class attended, read a year back so a long absence is measured from the
 * real date. Anyone with nothing in a year falls back to their join date,
 * which says the same thing.
 */
async function readLastAttended(ids: any[], now: Date) {
  const excluded = await excludedClassroomIds();
  const rows: any[] = await Attendance.aggregate([
    { $match: { sessionDate: { $gte: new Date(now.getTime() - 365 * DAY), $lte: now }, classroom: { $nin: excluded }, "records.student": { $in: ids } } },
    { $unwind: "$records" },
    { $match: { "records.student": { $in: ids }, "records.status": { $in: ATTENDED_STATUSES } } },
    { $group: { _id: "$records.student", last: { $max: "$sessionDate" } } },
  ]);
  return new Map(rows.map((row) => [idOf(row._id), new Date(row.last)]));
}

/**
 * Homework already past due in the last few weeks, matched to students the
 * way the homework page does it: by name, by batch, or the whole classroom.
 */
async function readHomework(population: any[], classrooms: any[], membership: Map<string, { classroomIds: string[] }>, now: Date) {
  const since = new Date(now.getTime() - HOMEWORK_LOOKBACK_DAYS * DAY);
  const classroomIds = classrooms.map((classroom) => classroom._id);
  const homework: any[] = await Homework.find({
    classroom: { $in: classroomIds },
    isPublished: { $ne: false },
    dueAt: { $gte: since, $lt: now },
  })
    .select("classroom assignedStudents assignedBatches assignAllStudents dueAt createdAt")
    .lean();
  const map = new Map<string, RiskSnapshot["homework"]>();
  if (!homework.length) return map;

  const batchIdsByStudent = new Map<string, Set<string>>();
  const batches: any[] = await Batch.find({ students: { $in: population.map((student) => student._id) } }).select("students").lean();
  batches.forEach((batch) => (batch.students || []).forEach((studentId: any) => {
    const key = idOf(studentId);
    const set = batchIdsByStudent.get(key) || new Set<string>();
    set.add(idOf(batch));
    batchIdsByStudent.set(key, set);
  }));
  population.forEach((student) => (student.batches || []).forEach((batchId: any) => {
    const set = batchIdsByStudent.get(idOf(student)) || new Set<string>();
    set.add(idOf(batchId));
    batchIdsByStudent.set(idOf(student), set);
  }));

  const assigned: Array<{ studentId: string; homeworkId: string; dueAt: Date }> = [];
  for (const student of population) {
    const studentId = idOf(student);
    const myClassrooms = new Set(membership.get(studentId)?.classroomIds || []);
    const myBatches = batchIdsByStudent.get(studentId) || new Set<string>();
    const joined = joinedAt(student);
    for (const item of homework) {
      const named = (item.assignedStudents || []).map(idOf);
      const batchIds = (item.assignedBatches || []).map(idOf);
      const wholeClass = item.assignAllStudents || (!named.length && !batchIds.length);
      const isMine = named.includes(studentId)
        || batchIds.some((batchId: string) => myBatches.has(batchId))
        || (wholeClass && myClassrooms.has(idOf(item.classroom)));
      // Work set before they joined was never theirs to do.
      if (!isMine || (item.createdAt && new Date(item.createdAt) < joined)) continue;
      assigned.push({ studentId, homeworkId: idOf(item), dueAt: new Date(item.dueAt) });
    }
  }
  if (!assigned.length) return map;

  const submissions: any[] = await Submission.find({
    homework: { $in: homework.map((item) => item._id) },
    student: { $in: population.map((student) => student._id) },
    status: { $ne: "in_progress" },
  })
    .select("homework student")
    .lean();
  const done = new Set(submissions.map((row) => `${idOf(row.student)}:${idOf(row.homework)}`));
  assigned.forEach((row) => {
    const list = map.get(row.studentId) || [];
    list.push({ dueAt: row.dueAt, submitted: done.has(`${row.studentId}:${row.homeworkId}`) });
    map.set(row.studentId, list);
  });
  return map;
}

/** Latest Learn Chess or tactics activity inside the lookback. */
async function readPractice(ids: any[], since: Date) {
  const [learning, tactics]: any[][] = await Promise.all([
    LearningExerciseProgress.aggregate([
      { $match: { studentId: { $in: ids }, lastAttemptedAt: { $gte: since } } },
      { $group: { _id: "$studentId", last: { $max: "$lastAttemptedAt" } } },
    ]),
    TacticAttempt.aggregate([
      { $match: { student: { $in: ids }, createdAt: { $gte: since } } },
      { $group: { _id: "$student", last: { $max: "$createdAt" } } },
    ]),
  ]);
  const map = new Map<string, Date>();
  [...learning, ...tactics].forEach((row) => {
    const key = idOf(row._id);
    const at = new Date(row.last);
    const existing = map.get(key);
    if (!existing || at > existing) map.set(key, at);
  });
  return map;
}

/** Effort on the latest report a coach has finished, from the last two months only. */
async function readEffort(ids: any[], now: Date) {
  const cutoff = academyDateKey(new Date(now.getTime() - 62 * DAY)).slice(0, 7);
  const reports: any[] = await MonthlyFeedback.find({ student: { $in: ids }, status: { $in: ["submitted", "approved", "sent"] }, month: { $gte: cutoff } })
    .select("student month ratings")
    .sort({ month: -1 })
    .lean();
  const map = new Map<string, number>();
  reports.forEach((report) => {
    const key = idOf(report.student);
    if (map.has(key)) return;
    const effort = Number(report.ratings?.effort ?? (report.ratings instanceof Map ? report.ratings.get("effort") : undefined));
    if (Number.isFinite(effort) && effort > 0) map.set(key, effort);
  });
  return map;
}

async function readFees(ids: any[], now: Date) {
  const horizon = new Date(now.getTime() + RISK_THRESHOLDS.invoiceDueDays * DAY);
  const [assignments, invoices]: any[][] = await Promise.all([
    FeeAssignment.find({ student: { $in: ids } }).select("student type creditBalance").lean(),
    Invoice.find({ student: { $in: ids }, status: { $in: ["unpaid", "overdue"] }, dueDate: { $lte: horizon } })
      .select("student dueDate")
      .sort({ dueDate: 1 })
      .lean(),
  ]);
  const map = new Map<string, RiskSnapshot["fees"]>();
  assignments.forEach((row) => map.set(idOf(row.student), { planType: row.type, creditBalance: Number(row.creditBalance ?? 0) }));
  invoices.forEach((row) => {
    const key = idOf(row.student);
    const entry = map.get(key) || {};
    if (!entry.nextInvoiceDueAt) map.set(key, { ...entry, nextInvoiceDueAt: new Date(row.dueDate) });
  });
  return map;
}

type SweepSummary = { scored: number; opened: number; updated: number; recovered: number; left: number; tasks: number; coachNotes: number };

async function syncFlags(contexts: Map<string, StudentContext>, now: Date): Promise<SweepSummary> {
  const summary: SweepSummary = { scored: contexts.size, opened: 0, updated: 0, recovered: 0, left: 0, tasks: 0, coachNotes: 0 };
  const open: any[] = await RetentionFlag.find({ status: "open" }).lean();
  const openByStudent = new Map(open.map((flag) => [idOf(flag.student), flag]));
  const quietSince = new Date(now.getTime() - SETTLED_QUIET_DAYS * DAY);
  const settled: any[] = await RetentionFlag.find({ status: "resolved", "resolution.auto": { $ne: true }, "resolution.at": { $gte: quietSince } })
    .select("student peakLevel level")
    .lean();
  const settledLevel = new Map<string, number>();
  settled.forEach((flag) => {
    const key = idOf(flag.student);
    settledLevel.set(key, Math.max(settledLevel.get(key) || 0, LEVEL_RANK[(flag.peakLevel || flag.level) as keyof typeof LEVEL_RANK] || 0));
  });

  for (const [studentId, context] of contexts) {
    const result = assessRisk(context.snapshot);
    const existing = openByStudent.get(studentId);
    openByStudent.delete(studentId);
    try {
      if (result.level === "none") {
        if (existing) {
          await settleFlag(existing, { outcome: "recovered", note: "The warning signs cleared.", auto: true });
          summary.recovered += 1;
        }
        continue;
      }
      // A family someone just spoke to is not re-flagged for the same signs.
      if (!existing && (settledLevel.get(studentId) || 0) >= LEVEL_RANK[result.level]) continue;
      const flag = await upsertFlag(existing, studentId, result, now);
      if (existing) summary.updated += 1;
      else summary.opened += 1;
      if (needsCall(result.level)) {
        await raiseRetentionRiskTask({ flag, student: context.student, level: result.level, reasons: result.reasons });
        summary.tasks += 1;
        if (!flag.coachNotifiedAt && (await notifyCoaches(flag, context, result))) summary.coachNotes += 1;
      }
    } catch (error) {
      console.error(`[retention] could not update the flag for student ${studentId}`, error);
    }
  }

  // Open flags for students the sweep no longer scores: left the academy, or out of every class.
  for (const flag of openByStudent.values()) {
    try {
      const student: any = await User.findById(flag.student).select("isActive exitReason").lean();
      if (!student || student.isActive === false) {
        await settleFlag(flag, { outcome: "left", note: student?.exitReason?.note || "The student was deactivated.", auto: true });
        summary.left += 1;
      } else {
        await settleFlag(flag, { outcome: "recovered", note: "No longer in a class to score.", auto: true });
        summary.recovered += 1;
      }
    } catch (error) {
      console.error(`[retention] could not close the flag ${idOf(flag)}`, error);
    }
  }
  return summary;
}

async function upsertFlag(existing: any, studentId: string, result: RiskResult, now: Date) {
  const level = result.level as "watch" | "at_risk" | "high";
  if (existing) {
    const peak = LEVEL_RANK[level] > LEVEL_RANK[(existing.peakLevel || existing.level) as keyof typeof LEVEL_RANK] ? level : existing.peakLevel || existing.level;
    return RetentionFlag.findByIdAndUpdate(
      existing._id,
      { $set: { level, peakLevel: peak, reasons: result.reasons, inWindow: result.inWindow, lastEvaluatedAt: now } },
      { new: true }
    ).lean() as Promise<any>;
  }
  try {
    const created = await RetentionFlag.create({
      student: new Types.ObjectId(studentId),
      status: "open",
      level,
      peakLevel: level,
      reasons: result.reasons,
      inWindow: result.inWindow,
      firstFlaggedAt: now,
      lastEvaluatedAt: now,
    });
    return created.toObject();
  } catch (error: any) {
    // Another instance opened it a moment ago; use theirs.
    if (error?.code === 11000) return RetentionFlag.findOne({ student: studentId, status: "open" }).lean() as Promise<any>;
    throw error;
  }
}

async function notifyCoaches(flag: any, context: StudentContext, result: RiskResult) {
  const note = coachHeadsUp(String(context.student.name || context.student.username || "Your student"), result.reasons);
  if (!note || !context.coachIds.length) return false;
  const claimed = await RetentionFlag.updateOne({ _id: flag._id, coachNotifiedAt: { $exists: false } }, { $set: { coachNotifiedAt: new Date() } });
  if (!claimed.modifiedCount) return false;
  await Notification.insertMany(context.coachIds.map((coachId) => ({
    user: new Types.ObjectId(coachId),
    type: "retention_heads_up",
    title: note.title,
    message: note.message,
    metadata: { studentId: idOf(context.student), flagId: idOf(flag) },
  })));
  return true;
}

export async function settleFlag(
  flag: any,
  input: { outcome: "stayed" | "paused" | "left" | "recovered" | "false_alarm"; note?: string; by?: unknown; byName?: string; auto?: boolean }
) {
  const updated = await RetentionFlag.findOneAndUpdate(
    { _id: flag._id, status: "open" },
    {
      $set: {
        status: "resolved",
        resolution: {
          outcome: input.outcome,
          note: input.note || "",
          by: input.by ? new Types.ObjectId(String(input.by)) : undefined,
          byName: input.byName || "",
          at: new Date(),
          auto: Boolean(input.auto),
        },
      },
    },
    { new: true }
  ).lean();
  if (updated) await resolveRetentionRiskTask(flag._id, input.by, outcomeNote(input.outcome, input.note));
  return updated;
}

function outcomeNote(outcome: string, note?: string) {
  const head = outcome === "stayed" ? "Family is staying."
    : outcome === "paused" ? "Family chose a pause."
    : outcome === "left" ? "Student left the academy."
    : outcome === "recovered" ? "The warning signs cleared."
    : "Not a real risk.";
  return note ? `${head} ${note}` : head;
}
