import "server-only";

import { academyDateKey } from "@/lib/academyTime";
import { exitStudentId as idOf, hasStudentExited } from "@/lib/classroomStudentExits";
import { joinedAt } from "@/lib/feesMetrics";
import { ATTENDED_STATUSES, RISK_THRESHOLDS, type RiskSnapshot } from "@/lib/retention/riskRules";
import { Attendance } from "@/models/Attendance";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { FamilyCall } from "@/models/FamilyCall";
import { FeeAssignment, Invoice } from "@/models/Fee";
import { Homework, Submission } from "@/models/Homework";
import { LearningExerciseProgress } from "@/models/Learning";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";
import { StudentPause } from "@/models/StudentPause";
import { TacticAttempt } from "@/models/TacticPuzzle";
import { User } from "@/models/User";

// What the retention sweep and the Retention Center read about each student.
// Reachable from instrumentation.ts through the sweep, so nothing here may
// import lib/studentPause.ts or lib/fees.ts (both pull in Node's crypto).
// Pause and fee state are read from the models.

const DAY = 86_400_000;
const LOOKBACK_DAYS = 90;
const HOMEWORK_LOOKBACK_DAYS = 45;
/** Call answers older than this no longer say how the family feels. */
export const CALL_SIGNAL_DAYS = 45;
/** Coach-side outcomes and classes that did not happen say nothing about the student. */
const SKIPPED_COACH_STATUSES = ["cancelled", "rescheduled", "coach_no_show"];
const MISSED_CALL_OUTCOMES = ["no_answer", "busy", "switched_off"];

export const STUDENT_FIELDS = "name username createdAt conversionSetup batches isActive phone countryCode phoneCanonical parentName parentEmail email";

export type StudentContext = {
  student: any;
  snapshot: RiskSnapshot;
  coachIds: string[];
  classroomIds: string[];
};

export type Membership = Map<string, { classroomIds: string[]; coachIds: Set<string>; coachChangedAt: Date | null }>;

/**
 * Who counts: active, non-demo students who are in a live class or on a
 * pause (out of class on purpose). `studentIds` narrows it to those students.
 */
export async function loadPopulation(now: Date, options: { studentIds?: string[]; withSessions?: boolean } = {}) {
  const filter: any = { role: "student", isActive: { $ne: false }, accountStatus: { $ne: "demo" } };
  if (options.studentIds) filter._id = { $in: options.studentIds };
  const students: any[] = await User.find(filter).select(STUDENT_FIELDS).lean();
  const studentById = new Map(students.map((student) => [idOf(student), student]));

  const classrooms: any[] = await Classroom.find({
    isActive: { $ne: false },
    isTestClassroom: { $ne: true },
    isSessionInstance: { $ne: true },
    classroomType: { $ne: "demo" },
    status: { $ne: "cancelled" },
    students: { $in: students.map((student) => student._id) },
  })
    // Past sessions only date a coach change; lists that skip it read much less.
    .select(`title coach instructor students studentExits closedForStudents pausedForStudents${options.withSessions === false ? "" : " generatedSessions.assignedCoach generatedSessions.scheduledFor"}`)
    .lean();

  const pauseFilter: any = { status: { $ne: "cancelled" }, pausedFrom: { $gte: new Date(now.getTime() - RISK_THRESHOLDS.repeatPauseDays * DAY) } };
  const activeFilter: any = { status: "active" };
  if (options.studentIds) {
    pauseFilter.student = { $in: options.studentIds };
    activeFilter.student = { $in: options.studentIds };
  }
  const pauses: any[] = await StudentPause.find(pauseFilter).select("student status pausedFrom pausedUntil").lean();
  const activePauses: any[] = await StudentPause.find(activeFilter).select("student pausedFrom pausedUntil").lean();
  const activePauseByStudent = new Map(activePauses.map((pause) => [idOf(pause.student), pause]));
  const recentPauseCount = new Map<string, number>();
  pauses.forEach((pause) => recentPauseCount.set(idOf(pause.student), (recentPauseCount.get(idOf(pause.student)) || 0) + 1));

  // Who is actually in a class right now, which classes, and with which coach.
  const membership: Membership = new Map();
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

  const population = students.filter((student) => membership.has(idOf(student)) || activePauseByStudent.has(idOf(student)));
  return { population, classrooms, membership, activePauseByStudent, recentPauseCount };
}

/** One risk snapshot per student in the population, with their coaches and classes. */
export async function loadStudentContexts(now: Date, options: { studentIds?: string[] } = {}): Promise<Map<string, StudentContext>> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  const { population, classrooms, membership, activePauseByStudent, recentPauseCount } = await loadPopulation(now, options);
  const ids = population.map((student) => student._id);
  if (!ids.length) return new Map();

  const [attendanceByStudent, lastAttended, homeworkByStudent, practiceByStudent, effortByStudent, feesByStudent, callsByStudent] = await Promise.all([
    readAttendance(ids, since, now),
    readLastAttended(ids, now),
    readHomework(population, classrooms, membership, now),
    readPractice(ids, since),
    readEffort(ids, now),
    readFees(ids, now),
    readCallSignals(ids, now),
  ]);

  const result = new Map<string, StudentContext>();
  for (const student of population) {
    const studentId = idOf(student);
    const pause = activePauseByStudent.get(studentId);
    const member = membership.get(studentId);
    result.set(studentId, {
      student,
      coachIds: Array.from(member?.coachIds || []),
      classroomIds: member?.classroomIds || [],
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
        calls: callsByStudent.get(studentId) || null,
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
async function readHomework(population: any[], classrooms: any[], membership: Membership, now: Date) {
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

/** Plan, credit balance and the earliest unpaid invoice due within `horizonDays`. */
export async function readFees(ids: any[], now: Date, horizonDays: number = RISK_THRESHOLDS.invoiceDueDays) {
  const horizon = new Date(now.getTime() + horizonDays * DAY);
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

/**
 * What the retention calls say about each student: the latest call that
 * connected (its score and whether the parent spoke of leaving) and the
 * missed calls since then.
 */
export async function readCallSignals(ids: any[], now: Date) {
  const calls: any[] = await FamilyCall.find({ students: { $in: ids }, at: { $gte: new Date(now.getTime() - CALL_SIGNAL_DAYS * DAY), $lte: now } })
    .select("students outcome at satisfaction leavingIntent")
    .sort({ at: -1 })
    .lean();
  const wanted = new Set(ids.map(idOf));
  const map = new Map<string, NonNullable<RiskSnapshot["calls"]>>();
  for (const call of calls) {
    for (const studentId of (call.students || []).map(idOf)) {
      if (!wanted.has(studentId)) continue;
      const entry = map.get(studentId) || { lastConnectedAt: null, latestSatisfaction: null, leavingIntent: null, missedSinceConnect: 0 };
      map.set(studentId, entry);
      // Newest first: everything after the latest connect is older and no longer counts.
      if (entry.lastConnectedAt) continue;
      if (call.outcome === "connected") {
        entry.lastConnectedAt = new Date(call.at);
        entry.latestSatisfaction = typeof call.satisfaction === "number" ? call.satisfaction : null;
        entry.leavingIntent = call.leavingIntent || null;
      } else if (MISSED_CALL_OUTCOMES.includes(call.outcome)) {
        entry.missedSinceConnect += 1;
      }
    }
  }
  return map;
}

/** Latest connected call per student, however long ago, for the 15-day rule. */
export async function lastConnectedCalls(ids: any[]) {
  if (!ids.length) return new Map<string, Date>();
  const rows: any[] = await FamilyCall.aggregate([
    { $match: { students: { $in: ids }, outcome: "connected" } },
    { $unwind: "$students" },
    { $match: { students: { $in: ids } } },
    { $group: { _id: "$students", last: { $max: "$at" } } },
  ]);
  return new Map(rows.map((row) => [idOf(row._id), new Date(row.last)]));
}
