import "server-only";

import { exitStudentId as idOf, hasStudentExited } from "@/lib/classroomStudentExits";
import { getSessionStart } from "@/lib/classroomSessions";
import { pickTask, type WeeklyAudience, type WeeklySnapshot } from "@/lib/engagement/engagementRules";
import { joinedAt } from "@/lib/feesMetrics";
import { canStudentUseLearnChess } from "@/lib/learning/studentAccess";
import { ATTENDED_STATUSES } from "@/lib/retention/riskRules";
import { Attendance } from "@/models/Attendance";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { StudentReward } from "@/models/ClassroomLive";
import { Homework, Submission } from "@/models/Homework";
import { LearningExerciseProgress } from "@/models/Learning";
import { TacticAttempt } from "@/models/TacticPuzzle";

// Reachable from instrumentation.ts (the weekly job): nothing here may import
// lib/studentPause.ts or lib/fees.ts, which pull in Node's crypto.

const DAY = 86_400_000;
const ACTIVITY_LOOKBACK_DAYS = 90;
/** Homework overdue by more than this is not worth nudging about any more. */
const PENDING_HOMEWORK_GRACE_DAYS = 7;
const NOT_HELD = ["cancelled", "rescheduled", "coach_no_show"];

export const STUDENT_FIELDS = "name username phone countryCode role accountStatus isActive isPaused engagementOptOut lastSeenAt createdAt conversionSetup batches";

export type StudentWeek = { audience: WeeklyAudience; snapshot: WeeklySnapshot };

/**
 * One student's week, Monday 00:00 academy time to `now`, for every student
 * passed in. Queries are batched across the whole list so the Sunday sweep is
 * a handful of reads, not a handful per family.
 */
export async function loadWeeklySnapshots(students: any[], weekStart: Date, now: Date): Promise<Map<string, StudentWeek>> {
  const result = new Map<string, StudentWeek>();
  if (!students.length) return result;
  const ids = students.map((student) => student._id);
  const idSet = new Set(ids.map(idOf));

  const classrooms: any[] = await Classroom.find({
    isActive: { $ne: false },
    isTestClassroom: { $ne: true },
    isSessionInstance: { $ne: true },
    classroomType: { $ne: "demo" },
    status: { $ne: "cancelled" },
    students: { $in: ids },
  })
    .select("students studentExits closedForStudents pausedForStudents generatedSessions.scheduledFor generatedSessions.startTime generatedSessions.status")
    .lean();

  const membership = new Map<string, any[]>();
  for (const classroom of classrooms) {
    const closed = new Set([...(classroom.closedForStudents || []), ...(classroom.pausedForStudents || [])].map(idOf));
    for (const studentId of (classroom.students || []).map(idOf)) {
      if (!idSet.has(studentId) || closed.has(studentId) || hasStudentExited(classroom, studentId)) continue;
      membership.set(studentId, [...(membership.get(studentId) || []), classroom]);
    }
  }

  const [attended, submittedThisWeek, solved, completed, xp, lastActivity, pendingHomework] = await Promise.all([
    countAttended(ids, weekStart, now),
    countByStudent(Submission, "student", { student: { $in: ids }, status: { $ne: "in_progress" }, submittedAt: { $gte: weekStart, $lte: now } }),
    countByStudent(TacticAttempt, "student", { student: { $in: ids }, solved: true, createdAt: { $gte: weekStart, $lte: now } }),
    countByStudent(LearningExerciseProgress, "studentId", { studentId: { $in: ids }, firstCompletedAt: { $gte: weekStart, $lte: now } }),
    sumXp(ids, weekStart, now),
    readLastActivity(ids, now),
    readPendingHomework(students, membership, now),
  ]);

  for (const student of students) {
    const studentId = idOf(student);
    const mine = membership.get(studentId) || [];
    let scheduled = 0;
    let nextClassAt: Date | null = null;
    for (const classroom of mine) {
      for (const session of classroom.generatedSessions || []) {
        const start = getSessionStart(session);
        if (!start) continue;
        if (start >= weekStart && start <= now && !NOT_HELD.includes(String(session.status || ""))) scheduled += 1;
        if (start > now && String(session.status || "scheduled") === "scheduled" && (!nextClassAt || start < nextClassAt)) nextClassAt = start;
      }
    }
    const attendedCount = attended.get(studentId) || 0;
    const pending = pendingHomework.get(studentId) || null;
    // Learn Chess eligibility is a cached lookup per student; only a nudge needs
    // it, and only when there is no homework to point at instead.
    const task = pending
      ? pickTask({ pendingHomework: pending, canLearnChess: false })
      : pickTask({ pendingHomework: null, canLearnChess: await canStudentUseLearnChess(studentId).catch(() => false) });
    result.set(studentId, {
      audience: {
        role: student.role,
        accountStatus: student.accountStatus,
        isActive: student.isActive,
        isPaused: student.isPaused,
        optedOut: Boolean(student.engagementOptOut?.optedOut),
        phone: student.phone,
        inClass: mine.length > 0,
      },
      snapshot: {
        studentName: String(student.name || student.username || "").split(/\s+/)[0] || "",
        classesScheduled: Math.max(scheduled, attendedCount),
        classesAttended: attendedCount,
        homeworkSubmitted: submittedThisWeek.get(studentId) || 0,
        puzzlesSolved: solved.get(studentId) || 0,
        lessonsCompleted: completed.get(studentId) || 0,
        xpEarned: xp.get(studentId) || 0,
        nextClassAt,
        lastActivityAt: lastActivity.get(studentId) || null,
        lastSeenAt: student.lastSeenAt ? new Date(student.lastSeenAt) : null,
        joinedAt: joinedAt(student),
        task,
      },
    });
  }
  return result;
}

async function countByStudent(model: any, field: string, match: Record<string, unknown>) {
  const rows: any[] = await model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return new Map<string, number>(rows.map((row) => [idOf(row._id), Number(row.count || 0)]));
}

async function countAttended(ids: any[], from: Date, to: Date) {
  const excluded = await Classroom.find({ $or: [{ classroomType: "demo" }, { isTestClassroom: true }] }).distinct("_id");
  const rows: any[] = await Attendance.aggregate([
    { $match: { sessionDate: { $gte: from, $lte: to }, classroom: { $nin: excluded }, coachStatus: { $nin: NOT_HELD }, "records.student": { $in: ids } } },
    { $unwind: "$records" },
    { $match: { "records.student": { $in: ids }, "records.status": { $in: ATTENDED_STATUSES } } },
    { $group: { _id: "$records.student", count: { $sum: 1 } } },
  ]);
  return new Map<string, number>(rows.map((row) => [idOf(row._id), Number(row.count || 0)]));
}

async function sumXp(ids: any[], from: Date, to: Date) {
  const rows: any[] = await StudentReward.aggregate([
    { $match: { student: { $in: ids }, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: "$student", xp: { $sum: "$xp" } } },
  ]);
  return new Map<string, number>(rows.map((row) => [idOf(row._id), Number(row.xp || 0)]));
}

/** Latest homework, puzzle, Learn Chess or reward activity in the last 90 days. */
async function readLastActivity(ids: any[], now: Date) {
  const since = new Date(now.getTime() - ACTIVITY_LOOKBACK_DAYS * DAY);
  const groups: any[][] = await Promise.all([
    Submission.aggregate([
      { $match: { student: { $in: ids }, submittedAt: { $gte: since } } },
      { $group: { _id: "$student", last: { $max: "$submittedAt" } } },
    ]),
    TacticAttempt.aggregate([
      { $match: { student: { $in: ids }, createdAt: { $gte: since } } },
      { $group: { _id: "$student", last: { $max: "$createdAt" } } },
    ]),
    LearningExerciseProgress.aggregate([
      { $match: { studentId: { $in: ids }, lastAttemptedAt: { $gte: since } } },
      { $group: { _id: "$studentId", last: { $max: "$lastAttemptedAt" } } },
    ]),
    StudentReward.aggregate([
      { $match: { student: { $in: ids }, createdAt: { $gte: since } } },
      { $group: { _id: "$student", last: { $max: "$createdAt" } } },
    ]),
  ]);
  const map = new Map<string, Date>();
  groups.flat().forEach((row) => {
    if (!row.last) return;
    const key = idOf(row._id);
    const at = new Date(row.last);
    const current = map.get(key);
    if (!current || at > current) map.set(key, at);
  });
  return map;
}

/**
 * The homework a nudge should point at: assigned, published, not yet
 * submitted, and due soonest (at most a week overdue). Matched to students the
 * way the homework page does it - by name, by batch, or the whole classroom.
 */
async function readPendingHomework(students: any[], membership: Map<string, any[]>, now: Date) {
  const map = new Map<string, { id: string; title: string; dueAt: Date | null }>();
  const classroomIds = Array.from(new Set(Array.from(membership.values()).flat().map((classroom) => idOf(classroom))));
  if (!classroomIds.length) return map;
  const homework: any[] = await Homework.find({
    classroom: { $in: classroomIds },
    isPublished: { $ne: false },
    $or: [{ dueAt: { $gte: new Date(now.getTime() - PENDING_HOMEWORK_GRACE_DAYS * DAY) } }, { dueAt: null, createdAt: { $gte: new Date(now.getTime() - 14 * DAY) } }],
  })
    .select("classroom title assignedStudents assignedBatches assignAllStudents dueAt createdAt")
    .lean();
  if (!homework.length) return map;

  const batchIdsByStudent = new Map<string, Set<string>>();
  const batches: any[] = await Batch.find({ students: { $in: students.map((student) => student._id) } }).select("students").lean();
  const addBatch = (studentId: string, batchId: string) => {
    const set = batchIdsByStudent.get(studentId) || new Set<string>();
    set.add(batchId);
    batchIdsByStudent.set(studentId, set);
  };
  batches.forEach((batch) => (batch.students || []).forEach((studentId: any) => addBatch(idOf(studentId), idOf(batch))));
  students.forEach((student) => (student.batches || []).forEach((batchId: any) => addBatch(idOf(student), idOf(batchId))));

  const candidates: Array<{ studentId: string; item: any }> = [];
  for (const student of students) {
    const studentId = idOf(student);
    const myClassrooms = new Set((membership.get(studentId) || []).map(idOf));
    const myBatches = batchIdsByStudent.get(studentId) || new Set<string>();
    const joined = joinedAt(student);
    for (const item of homework) {
      const named = (item.assignedStudents || []).map(idOf);
      const batchIds = (item.assignedBatches || []).map(idOf);
      const wholeClass = item.assignAllStudents || (!named.length && !batchIds.length);
      const isMine = named.includes(studentId)
        || batchIds.some((batchId: string) => myBatches.has(batchId))
        || (wholeClass && myClassrooms.has(idOf(item.classroom)));
      if (!isMine || (item.createdAt && new Date(item.createdAt) < joined)) continue;
      candidates.push({ studentId, item });
    }
  }
  if (!candidates.length) return map;

  const submissions: any[] = await Submission.find({
    homework: { $in: homework.map((item) => item._id) },
    student: { $in: students.map((student) => student._id) },
    status: { $ne: "in_progress" },
  })
    .select("homework student")
    .lean();
  const done = new Set(submissions.map((row) => `${idOf(row.student)}:${idOf(row.homework)}`));
  for (const { studentId, item } of candidates) {
    if (done.has(`${studentId}:${idOf(item)}`)) continue;
    const dueAt = item.dueAt ? new Date(item.dueAt) : null;
    const current = map.get(studentId);
    const sooner = !current || (dueAt && (!current.dueAt || dueAt < current.dueAt));
    if (sooner) map.set(studentId, { id: idOf(item), title: String(item.title || "homework"), dueAt });
  }
  return map;
}
