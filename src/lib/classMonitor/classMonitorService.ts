import "server-only";

import { Types } from "mongoose";
import { academyDateKey, academyDayBounds, academyTimeOfDay } from "@/lib/academyTime";
import { flattenScheduledSessions, isSessionOffSchedule } from "@/lib/classroomSessions";
import { rosterForSession } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { raiseClassMonitorTask, resolveClassMonitorTask, withdrawClassMonitorTask } from "@/lib/tasks/taskTriggers";
import { effectiveSessionCoachId } from "@/lib/teachingStats";
import { ClassMonitorDigest, ClassMonitorReport } from "@/models/ClassMonitorReport";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";
import { User } from "@/models/User";
import { classMonitorOwnerId, classMonitorReviewers } from "./classMonitorPeople";
import {
  CLASS_MONITOR_HREF,
  CLASS_MONITOR_REPORTS_HREF,
  TASK_LEAD_MINUTES,
  addDays,
  classEndLabel,
  classFormatLabel,
  classMonitorStartKey,
  classMonitorSubmitSchema,
  correctLessonLabel,
  dayLabel,
  lateLabel,
  minutesAfterStart,
  reportConcerns,
  resolveJoinTime,
  studentVideoLabel,
  teacherVideoLabel,
  timeLabel,
  timingLabel,
  weekdayName,
} from "./classMonitorRules";

export class ClassMonitorError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const NOT_HELD_STATUSES = new Set(["cancelled", "rescheduled"]);
const CLASSROOM_FIELDS =
  "title courseName levelName topicName coach instructor students studentExits generatedSessions classDate startTime durationMinutes status isActive isPaused pausedFrom completedAt meetingUrl classroomType";

function idOf(value: any) {
  return String(value?._id ?? value ?? "");
}

function asObjectId(value: unknown) {
  const raw = idOf(value);
  return Types.ObjectId.isValid(raw) ? new Types.ObjectId(raw) : null;
}

function reportKey(classroomId: unknown, sessionId: unknown) {
  return `${idOf(classroomId)}:${String(sessionId || "")}`;
}

/* ------------------------------------------------------------------ */
/* Which classes                                                       */
/* ------------------------------------------------------------------ */

type DayClass = {
  classroom: any;
  session: any;
  start: Date;
  end: Date;
  held: boolean;
  notHeldReason: string;
};

/**
 * Every real class on one academy day, free demo classes included: parent
 * classrooms only (each session is mirrored into a child "session instance"
 * with the same id), never test classrooms. A class that was cancelled, rescheduled away, or belongs to
 * a closed or paused classroom is returned with `held: false`.
 */
export async function classesOnDay(dateKey: string): Promise<DayClass[]> {
  const { start, end } = academyDayBounds(dateKey);
  // scheduledFor is a calendar date, so widen the window and settle the day
  // on each session's real start below.
  const lo = new Date(start.getTime() - 36 * 3600_000);
  const hi = new Date(end.getTime() + 36 * 3600_000);
  const classrooms: any[] = await Classroom.find({
    isSessionInstance: { $ne: true },
    isTestClassroom: { $ne: true },
    $or: [
      { generatedSessions: { $elemMatch: { scheduledFor: { $gte: lo, $lte: hi } } } },
      { classDate: { $gte: lo, $lte: hi }, "generatedSessions.0": { $exists: false } },
    ],
  })
    .select(CLASSROOM_FIELDS)
    .lean();

  return flattenScheduledSessions(classrooms)
    .filter(({ start: sessionStart }) => academyDateKey(sessionStart) === dateKey)
    .map(({ classroom, session, start: sessionStart, end: sessionEnd }) => {
      const status = String(session.status || "scheduled");
      let notHeldReason = "";
      if (NOT_HELD_STATUSES.has(status)) notHeldReason = status === "cancelled" ? "Class cancelled" : "Class rescheduled";
      else if (isSessionOffSchedule(classroom, session) && !session.attendanceMarkedAt) notHeldReason = "Classroom closed or paused";
      return { classroom, session, start: sessionStart, end: sessionEnd, held: !notHeldReason, notHeldReason };
    });
}

/* ------------------------------------------------------------------ */
/* Join times from the live room                                       */
/* ------------------------------------------------------------------ */

type LiveTimes = { byUser: Map<string, Date>; instructorFirst: Date | null };

/** First time each person was seen in the live room, per scheduled session. */
async function liveJoinTimes(sessionIds: string[]): Promise<Map<string, LiveTimes>> {
  const result = new Map<string, LiveTimes>();
  const ids = sessionIds.filter(Boolean);
  if (!ids.length) return result;
  const lives: any[] = await ClassroomSession.find({ scheduledSessionId: { $in: ids } })
    .select("scheduledSessionId participants.user participants.role participants.firstSeenAt")
    .lean();
  for (const live of lives) {
    const key = String(live.scheduledSessionId);
    const entry = result.get(key) || { byUser: new Map<string, Date>(), instructorFirst: null };
    for (const participant of live.participants || []) {
      const seen = participant.firstSeenAt ? new Date(participant.firstSeenAt) : null;
      if (!seen || Number.isNaN(seen.getTime())) continue;
      const userId = idOf(participant.user);
      const previous = entry.byUser.get(userId);
      if (!previous || seen < previous) entry.byUser.set(userId, seen);
      if (participant.role === "instructor" && (!entry.instructorFirst || seen < entry.instructorFirst)) entry.instructorFirst = seen;
    }
    result.set(key, entry);
  }
  return result;
}

function teacherAutoJoin(live: LiveTimes | undefined, coachId: string, actualStartedAt: unknown) {
  const fromRoom = (coachId && live?.byUser.get(coachId)) || live?.instructorFirst || null;
  if (fromRoom) return fromRoom;
  return actualStartedAt ? new Date(actualStartedAt as any) : null;
}

/* ------------------------------------------------------------------ */
/* Keeping a day's reports in step with the schedule                   */
/* ------------------------------------------------------------------ */

async function namesFor(ids: string[]) {
  const unique = [...new Set(ids.filter((id) => Types.ObjectId.isValid(id)))];
  if (!unique.length) return new Map<string, string>();
  const users: any[] = await User.find({ _id: { $in: unique } }).select("name username").lean();
  return new Map(users.map((user) => [idOf(user), String(user.name || user.username || "")]));
}

function snapshotFor(item: DayClass, names: Map<string, string>, live: LiveTimes | undefined) {
  const { classroom, session, start, end } = item;
  const coachId = effectiveSessionCoachId(session, classroom);
  const roster = rosterForSession(classroom, session).map(idOf).filter(Boolean);
  const teacherAt = teacherAutoJoin(live, coachId, session.actualStartedAt);
  return {
    classroom: classroom._id,
    sessionId: String(session._id),
    dateKey: academyDateKey(start),
    startAt: start,
    endAt: end,
    durationMinutes: Number(session.durationMinutes || classroom.durationMinutes || 60),
    className: String(classroom.title || ""),
    isDemo: classroom.classroomType === "demo",
    courseName: String(classroom.courseName || classroom.levelName || ""),
    lessonPlanned: String(session.topicName || classroom.topicName || ""),
    sessionNumber: Number(session.sessionNumber || 0),
    sessionStatus: String(session.status || "scheduled"),
    coach: asObjectId(coachId),
    coachName: names.get(coachId) || "",
    meetingUrl: String(classroom.meetingUrl || ""),
    actualStartedAt: session.actualStartedAt || null,
    actualEndedAt: session.actualEndedAt || null,
    teacherJoin: { autoAt: teacherAt, at: teacherAt, edited: false },
    studentJoins: roster.map((studentId) => {
      const at = live?.byUser.get(studentId) || null;
      return { student: asObjectId(studentId), name: names.get(studentId) || "Student", autoAt: at, at, edited: false };
    }),
  };
}

function snapshotKey(value: any) {
  const time = (at: unknown) => (at ? new Date(at as any).getTime() : 0);
  return JSON.stringify([
    idOf(value.coach), value.coachName, value.className, Boolean(value.isDemo), value.courseName, value.lessonPlanned, value.sessionNumber, value.sessionStatus,
    value.dateKey, time(value.startAt), time(value.endAt), value.durationMinutes, value.meetingUrl, time(value.actualStartedAt), time(value.actualEndedAt),
    time(value.teacherJoin?.autoAt),
    (value.studentJoins || []).map((join: any) => [idOf(join.student), join.name, time(join.autoAt)]),
  ]);
}

/**
 * Brings one day's reports in line with the schedule: a report for every class
 * held, unfilled ones refreshed (coach, roster, recorded join times), and
 * unfilled ones withdrawn when their class is cancelled or moved. Filled
 * reports are never touched. Safe to run as often as wanted.
 */
export async function syncClassMonitorDay(dateKey: string, now = new Date()) {
  if (dateKey < classMonitorStartKey()) return { created: 0, updated: 0, withdrawn: 0, moved: 0 };
  await dbConnect();
  const classes = await classesOnDay(dateKey);
  const existing: any[] = await ClassMonitorReport.find({
    $or: [
      { dateKey },
      ...(classes.length ? [{ $or: classes.map((item) => ({ classroom: item.classroom._id, sessionId: String(item.session._id) })) }] : []),
    ],
  }).lean();
  const byKey = new Map(existing.map((report) => [reportKey(report.classroom, report.sessionId), report]));

  const heldClasses = classes.filter((item) => item.held);
  const nameIds = heldClasses.flatMap((item) => [
    effectiveSessionCoachId(item.session, item.classroom),
    ...rosterForSession(item.classroom, item.session).map(idOf),
  ]);
  const [names, live] = await Promise.all([namesFor(nameIds), liveJoinTimes(heldClasses.map((item) => String(item.session._id)))]);

  let created = 0;
  let updated = 0;
  let withdrawn = 0;
  const seen = new Set<string>();

  for (const item of classes) {
    const key = reportKey(item.classroom._id, item.session._id);
    seen.add(key);
    const report = byKey.get(key);
    if (!item.held) {
      if (report?.status === "pending") {
        await withdrawReport(report, item.notHeldReason);
        withdrawn += 1;
      }
      continue;
    }
    const snapshot = snapshotFor(item, names, live.get(String(item.session._id)));
    if (!report) {
      try {
        await ClassMonitorReport.create({ ...snapshot, status: "pending" });
        created += 1;
      } catch (error: any) {
        if (error?.code !== 11000) throw error; // another instance created it a moment ago
      }
      continue;
    }
    if (report.status === "submitted") continue;
    // The sweep runs every 5 minutes: write only when something moved.
    if (report.status === "pending" && snapshotKey(report) === snapshotKey(snapshot)) continue;
    await ClassMonitorReport.updateOne(
      { _id: report._id, status: { $in: ["pending", "cancelled"] } },
      { $set: { ...snapshot, status: "pending", cancelReason: "" } }
    );
    updated += 1;
  }

  // Unfilled reports for this day whose class is no longer on it.
  let moved = 0;
  for (const report of existing) {
    if (report.dateKey !== dateKey || report.status !== "pending" || seen.has(reportKey(report.classroom, report.sessionId))) continue;
    const outcome = await relocateReport(report, now);
    if (outcome === "moved") moved += 1;
    else withdrawn += 1;
  }
  return { created, updated, withdrawn, moved };
}

async function withdrawReport(report: any, reason: string) {
  await ClassMonitorReport.updateOne({ _id: report._id, status: "pending" }, { $set: { status: "cancelled", cancelReason: reason } });
  if (report.taskRaisedAt) {
    await withdrawClassMonitorTask(report._id, `${reason} - nothing to monitor.`);
    await ClassMonitorReport.updateOne({ _id: report._id }, { $set: { taskWithdrawn: true } });
  }
}

/** The class left this day: follow it to its new date, or withdraw the report if it is gone. */
async function relocateReport(report: any, now: Date): Promise<"moved" | "withdrawn"> {
  const sessionId = String(report.sessionId || "");
  const classroom: any = Types.ObjectId.isValid(sessionId)
    ? await Classroom.findOne({ _id: report.classroom, "generatedSessions._id": sessionId }).select(CLASSROOM_FIELDS).lean()
    : await Classroom.findById(report.classroom).select(CLASSROOM_FIELDS).lean();
  const item = classroom
    ? flattenScheduledSessions([{ ...classroom, generatedSessions: (classroom.generatedSessions || []).filter((session: any) => idOf(session) === sessionId) }])[0]
    : null;
  const status = String(item?.session?.status || "");
  if (!item || NOT_HELD_STATUSES.has(status) || (isSessionOffSchedule(classroom, item.session) && !item.session.attendanceMarkedAt)) {
    await withdrawReport(report, !item ? "Class removed from the schedule" : status === "cancelled" ? "Class cancelled" : "Class rescheduled");
    return "withdrawn";
  }
  const newKey = academyDateKey(item.start);
  if (newKey < classMonitorStartKey()) {
    await withdrawReport(report, "Class moved before monitoring started");
    return "withdrawn";
  }
  const stillDue = item.start.getTime() - TASK_LEAD_MINUTES * 60_000 > now.getTime();
  await ClassMonitorReport.updateOne(
    { _id: report._id, status: "pending" },
    { $set: { dateKey: newKey, startAt: item.start, endAt: item.end, sessionStatus: status || "scheduled", ...(stillDue && report.taskRaisedAt ? { taskWithdrawn: true } : {}) } }
  );
  if (stillDue && report.taskRaisedAt) await withdrawClassMonitorTask(report._id, `Class moved to ${dayLabel(newKey)}; the task comes back that day.`);
  return "moved";
}

/** A task for every unfilled class that starts within the next few minutes (or already has). */
export async function raiseDueClassMonitorTasks(now = new Date()) {
  await dbConnect();
  const due: any[] = await ClassMonitorReport.find({
    status: "pending",
    dateKey: { $gte: classMonitorStartKey() },
    startAt: { $lte: new Date(now.getTime() + TASK_LEAD_MINUTES * 60_000), $gte: new Date(now.getTime() - 3 * 86_400_000) },
    $or: [{ taskRaisedAt: null }, { taskWithdrawn: true }],
  })
    .sort({ startAt: 1 })
    .limit(300)
    .lean();
  if (!due.length) return 0;
  const ownerId = await classMonitorOwnerId();
  let raised = 0;
  for (const report of due) {
    const task = await raiseClassMonitorTask({ report, ownerId, timing: `${weekdayName(report.dateKey).slice(0, 3)} ${timeLabel(report.startAt)}`, reopen: Boolean(report.taskWithdrawn) });
    if (!task) continue;
    await ClassMonitorReport.updateOne({ _id: report._id }, { $set: { taskRaisedAt: now, taskWithdrawn: false } });
    raised += 1;
  }
  return raised;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

type SerializedJoin = { student: string; name: string; autoAt: string | null; at: string | null; edited: boolean; minutesLate: number | null };

export function serializeReport(report: any) {
  const startAt = new Date(report.startAt);
  return {
    _id: idOf(report),
    classroom: idOf(report.classroom),
    sessionId: String(report.sessionId || ""),
    dateKey: String(report.dateKey),
    weekday: weekdayName(report.dateKey),
    startAt: startAt.toISOString(),
    endAt: new Date(report.endAt).toISOString(),
    timing: timingLabel(report.startAt, report.endAt),
    durationMinutes: Number(report.durationMinutes || 60),
    className: String(report.className || ""),
    isDemo: Boolean(report.isDemo),
    courseName: String(report.courseName || ""),
    lessonPlanned: String(report.lessonPlanned || ""),
    sessionNumber: Number(report.sessionNumber || 0),
    sessionStatus: String(report.sessionStatus || ""),
    coachId: idOf(report.coach),
    coachName: String(report.coachName || ""),
    meetingUrl: String(report.meetingUrl || ""),
    actualStartedAt: report.actualStartedAt ? new Date(report.actualStartedAt).toISOString() : null,
    actualEndedAt: report.actualEndedAt ? new Date(report.actualEndedAt).toISOString() : null,
    status: String(report.status),
    cancelReason: String(report.cancelReason || ""),
    classFormat: report.classFormat || null,
    studentVideo: report.studentVideo || null,
    teacherVideo: report.teacherVideo || null,
    correctLesson: report.correctLesson || null,
    classEnd: report.classEnd || null,
    teacherJoin: {
      autoAt: report.teacherJoin?.autoAt ? new Date(report.teacherJoin.autoAt).toISOString() : null,
      at: report.teacherJoin?.at ? new Date(report.teacherJoin.at).toISOString() : null,
      edited: Boolean(report.teacherJoin?.edited),
      minutesLate: minutesAfterStart(report.teacherJoin?.at, startAt),
    },
    studentJoins: ((report.studentJoins || []) as any[]).map((join: any): SerializedJoin => ({
      student: idOf(join.student),
      name: String(join.name || "Student"),
      autoAt: join.autoAt ? new Date(join.autoAt).toISOString() : null,
      at: join.at ? new Date(join.at).toISOString() : null,
      edited: Boolean(join.edited),
      minutesLate: minutesAfterStart(join.at, startAt),
    })),
    remarks: String(report.remarks || ""),
    concerns: report.status === "submitted" ? reportConcerns(report) : [],
    submittedAt: report.submittedAt ? new Date(report.submittedAt).toISOString() : null,
    submittedByName: String(report.submittedByName || ""),
    lastEditedAt: report.lastEditedAt ? new Date(report.lastEditedAt).toISOString() : null,
    lastEditedByName: String(report.lastEditedByName || ""),
    editCount: Number(report.editCount || 0),
  };
}

export type ClassMonitorReportView = ReturnType<typeof serializeReport>;

/** Keeps the browsable days near today in step; older days are settled. */
function shouldSync(dateKey: string, todayKey: string) {
  return dateKey >= classMonitorStartKey() && dateKey >= addDays(todayKey, -7) && dateKey <= addDays(todayKey, 14);
}

export async function listClassMonitorDay(dateKey: string, now = new Date()) {
  await dbConnect();
  const todayKey = academyDateKey(now);
  if (shouldSync(dateKey, todayKey)) await syncClassMonitorDay(dateKey, now);
  const reports: any[] = await ClassMonitorReport.find({ dateKey }).sort({ startAt: 1, className: 1 }).lean();
  return reports.map(serializeReport);
}

export async function getClassMonitorReport(id: string, now = new Date()) {
  if (!Types.ObjectId.isValid(id)) throw new ClassMonitorError("Report not found.", 404);
  await dbConnect();
  let report: any = await ClassMonitorReport.findById(id).lean();
  if (!report) throw new ClassMonitorError("Report not found.", 404);
  // An unfilled form shows the latest the live room knows, not the last sweep's copy.
  if (report.status === "pending") {
    await syncClassMonitorDay(report.dateKey, now);
    report = await ClassMonitorReport.findById(id).lean();
    if (!report) throw new ClassMonitorError("Report not found.", 404);
  }
  return serializeReport(report);
}

/* ------------------------------------------------------------------ */
/* Filling the form                                                    */
/* ------------------------------------------------------------------ */

export async function submitClassMonitorReport(id: string, input: unknown, actor: { id: string; name: string }, now = new Date()) {
  if (!Types.ObjectId.isValid(id)) throw new ClassMonitorError("Report not found.", 404);
  const data = classMonitorSubmitSchema.parse(input);
  await dbConnect();
  const report: any = await ClassMonitorReport.findById(id).lean();
  if (!report) throw new ClassMonitorError("Report not found.", 404);
  if (report.status === "cancelled") throw new ClassMonitorError("This class was not held, so there is nothing to fill in.", 409);
  const start = new Date(report.startAt);
  if (now.getTime() < start.getTime() - TASK_LEAD_MINUTES * 60_000) throw new ClassMonitorError("This class has not started yet.", 409);

  const teacher = resolveJoinTime(data.teacherJoinedAt, report.teacherJoin?.autoAt, start);
  const typed = new Map(data.studentJoins.map((join) => [join.student.toLowerCase(), join.joinedAt]));
  const studentJoins = (report.studentJoins || []).map((join: any) => {
    const studentId = idOf(join.student).toLowerCase();
    if (!typed.has(studentId)) return join;
    const resolved = resolveJoinTime(typed.get(studentId) || "", join.autoAt, start);
    return { ...join, at: resolved.at, edited: resolved.edited };
  });

  const first = report.status !== "submitted";
  const actorId = asObjectId(actor.id);
  const set: Record<string, unknown> = {
    status: "submitted",
    classFormat: data.classFormat,
    studentVideo: data.studentVideo,
    teacherVideo: data.teacherVideo,
    correctLesson: data.correctLesson,
    classEnd: data.classEnd,
    teacherJoin: { autoAt: report.teacherJoin?.autoAt || null, at: teacher.at, edited: teacher.edited },
    studentJoins,
    remarks: data.remarks,
    ...(first
      ? { submittedAt: now, submittedBy: actorId, submittedByName: actor.name }
      : { lastEditedAt: now, lastEditedBy: actorId, lastEditedByName: actor.name }),
  };
  const saved: any = await ClassMonitorReport.findOneAndUpdate(
    { _id: report._id, status: report.status },
    { $set: set, ...(first ? {} : { $inc: { editCount: 1 } }) },
    { new: true }
  ).lean();
  if (!saved) throw new ClassMonitorError("Someone else saved this form a moment ago. Reload it and try again.", 409);

  if (first) await resolveClassMonitorTask(saved._id, actor.id);
  await emailReviewers(saved, first ? "filled" : "updated", actor.name).catch((error) => console.error("[class-monitor] reviewer email failed", error));
  return serializeReport(saved);
}

/* ------------------------------------------------------------------ */
/* Emails                                                              */
/* ------------------------------------------------------------------ */

function joinLine(at: unknown, start: Date, edited: boolean) {
  if (!at) return "Did not join";
  const late = lateLabel(minutesAfterStart(at as Date, start));
  return `${timeLabel(at as Date)}${late ? ` (${late})` : ""}${edited ? " - changed by hand" : ""}`;
}

export function reportEmailLines(report: any) {
  const start = new Date(report.startAt);
  const students = (report.studentJoins || []).map((join: any) => `  • ${join.name || "Student"}: ${joinLine(join.at, start, Boolean(join.edited))}`);
  const concerns = reportConcerns(report);
  return [
    `Class: ${report.className || "—"}${report.courseName ? ` (${report.courseName})` : ""}`,
    `Class type: ${report.isDemo ? "Demo class" : "Regular class"}`,
    `Coach: ${report.coachName || "—"}`,
    `Group / Individual: ${classFormatLabel(report.classFormat) || "—"}`,
    `Day and time: ${dayLabel(report.dateKey)}, ${timingLabel(report.startAt, report.endAt)} IST`,
    report.lessonPlanned ? `Lesson planned: ${report.lessonPlanned}` : "",
    "",
    `Student video: ${studentVideoLabel(report.studentVideo) || "—"}`,
    `Teacher video: ${teacherVideoLabel(report.teacherVideo) || "—"}`,
    `Correct lesson taught: ${correctLessonLabel(report.correctLesson) || "—"}`,
    `Class ended: ${classEndLabel(report.classEnd) || "—"}`,
    `Teacher joined: ${joinLine(report.teacherJoin?.at, start, Boolean(report.teacherJoin?.edited))}`,
    students.length ? `Students joined:\n${students.join("\n")}` : "Students joined: no students on the roster",
    report.remarks ? `Remarks: ${report.remarks}` : "",
    concerns.length ? `\nNeeds attention: ${concerns.join(", ")}` : "",
  ].filter((line) => line !== "");
}

async function emailReviewers(report: any, kind: "filled" | "updated", actorName: string) {
  const reviewers = await classMonitorReviewers();
  const subjectStart = `Class Monitor${report.isDemo ? " (demo)" : ""}${kind === "updated" ? " (updated)" : ""}`;
  const subject = `${subjectStart}: ${report.className || "Class"} · ${weekdayName(report.dateKey).slice(0, 3)} ${timeLabel(report.startAt)}`;
  const lines = reportEmailLines(report);
  await Promise.all(reviewers.map((reviewer) => sendAutomationEmail({
    to: reviewer.email,
    subject,
    message: [
      `Hello ${reviewer.name || "there"},`,
      kind === "filled"
        ? `${actorName || "The class monitor"} has filled the Class Monitor form for this class.`
        : `${actorName || "Someone"} has changed the Class Monitor form for this class.`,
      ...lines,
      "Team Envision Chess Academy",
    ].join("\n"),
    actionLabel: "Open Class Monitor",
    metadata: {
      kind: "class_monitor_report",
      event: kind,
      reportId: idOf(report),
      href: `${CLASS_MONITOR_HREF}?date=${report.dateKey}&id=${idOf(report)}`,
      dedupKey: `class-monitor:${idOf(report)}:${kind}:${new Date(report.lastEditedAt || report.submittedAt || Date.now()).getTime()}:${reviewer.email}`,
    },
  }).catch((error) => console.error("[class-monitor] email failed", error))));
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

function emptyCounts() {
  return {
    classes: 0,
    demos: 0,
    filled: 0,
    notFilled: 0,
    notHeld: 0,
    group: 0,
    individual: 0,
    studentVideoOff: 0,
    teacherVideo30Plus: 0,
    teacherVideoUnder30: 0,
    teacherVideoNever: 0,
    wrongLesson: 0,
    endedOnTime: 0,
    endedEarly: 0,
    endedLate: 0,
    teacherLate: 0,
  };
}

type Counts = ReturnType<typeof emptyCounts>;

function addToCounts(counts: Counts, report: any) {
  if (report.status === "cancelled") {
    counts.notHeld += 1;
    return;
  }
  counts.classes += 1;
  if (report.isDemo) counts.demos += 1;
  if (report.status !== "submitted") {
    counts.notFilled += 1;
    return;
  }
  counts.filled += 1;
  if (report.classFormat === "group") counts.group += 1;
  if (report.classFormat === "individual") counts.individual += 1;
  if (report.studentVideo === "off") counts.studentVideoOff += 1;
  if (report.teacherVideo === "30_plus") counts.teacherVideo30Plus += 1;
  if (report.teacherVideo === "under_30") counts.teacherVideoUnder30 += 1;
  if (report.teacherVideo === "never") counts.teacherVideoNever += 1;
  if (report.correctLesson === "no") counts.wrongLesson += 1;
  if (report.classEnd === "on_time") counts.endedOnTime += 1;
  if (report.classEnd === "early") counts.endedEarly += 1;
  if (report.classEnd === "late") counts.endedLate += 1;
  const late = minutesAfterStart(report.teacherJoin?.at, report.startAt);
  if (late !== null && late > 5) counts.teacherLate += 1;
}

export async function loadReportsInRange(from: string, to: string) {
  await dbConnect();
  return ClassMonitorReport.find({ dateKey: { $gte: from, $lte: to } }).sort({ dateKey: 1, startAt: 1, className: 1 }).lean();
}

export async function classMonitorSummary(from: string, to: string, now = new Date()) {
  const todayKey = academyDateKey(now);
  // Today's list may not have been opened yet.
  if (from <= todayKey && todayKey <= to) await syncClassMonitorDay(todayKey, now);
  const reports: any[] = await loadReportsInRange(from, to);
  const totals = emptyCounts();
  const days = new Map<string, Counts>();
  const coaches = new Map<string, { coachName: string; counts: Counts }>();
  for (const report of reports) {
    addToCounts(totals, report);
    const day = days.get(report.dateKey) || emptyCounts();
    addToCounts(day, report);
    days.set(report.dateKey, day);
    const coachKey = idOf(report.coach) || report.coachName || "unknown";
    const coach = coaches.get(coachKey) || { coachName: String(report.coachName || "Unknown coach"), counts: emptyCounts() };
    addToCounts(coach.counts, report);
    coaches.set(coachKey, coach);
  }
  return {
    from,
    to,
    totals,
    days: [...days.entries()].map(([dateKey, counts]) => ({ dateKey, weekday: weekdayName(dateKey), ...counts })),
    coaches: [...coaches.values()]
      .map(({ coachName, counts }) => ({ coachName, ...counts }))
      .sort((a, b) => a.coachName.localeCompare(b.coachName)),
    reports: reports.map(serializeReport),
  };
}

/* ------------------------------------------------------------------ */
/* The sweep and the daily summary                                     */
/* ------------------------------------------------------------------ */

const DIGEST_HOUR = Math.min(23, Math.max(0, Number(process.env.CLASS_MONITOR_DIGEST_HOUR || 9)));

function dailyEmailEnabled() {
  return String(process.env.CLASS_MONITOR_DAILY_EMAIL || "true").toLowerCase() !== "false";
}

/**
 * Yesterday's classes in one email to the reviewers, once a day after
 * CLASS_MONITOR_DIGEST_HOUR (09:00 IST). Claimed per day, so a restart or a
 * second app instance cannot send it twice.
 */
export async function sendDailyClassMonitorSummary(now = new Date()) {
  if (!dailyEmailEnabled()) return { sent: false, reason: "disabled" };
  const todayKey = academyDateKey(now);
  const hour = Number(academyTimeOfDay(now).slice(0, 2));
  if (hour < DIGEST_HOUR) return { sent: false, reason: "too_early" };
  const dateKey = addDays(todayKey, -1);
  if (dateKey < classMonitorStartKey()) return { sent: false, reason: "before_start" };
  await dbConnect();
  if (await ClassMonitorDigest.exists({ dateKey })) return { sent: false, reason: "already_sent" };

  await syncClassMonitorDay(dateKey, now);
  const reports: any[] = await loadReportsInRange(dateKey, dateKey);
  const reviewers = await classMonitorReviewers();
  try {
    await ClassMonitorDigest.create({ dateKey, sentAt: now, recipients: reviewers.length });
  } catch (error: any) {
    if (error?.code === 11000) return { sent: false, reason: "already_sent" };
    throw error;
  }

  const counts = emptyCounts();
  reports.forEach((report) => addToCounts(counts, report));
  const attention = reports
    .filter((report) => report.status === "submitted" && reportConcerns(report).length)
    .map((report) => `  • ${timeLabel(report.startAt)} ${report.className}${report.isDemo ? " [demo]" : ""} (${report.coachName || "—"}): ${reportConcerns(report).join(", ")}`);
  const unfilled = reports
    .filter((report) => report.status === "pending")
    .map((report) => `  • ${timeLabel(report.startAt)} ${report.className}${report.isDemo ? " [demo]" : ""} (${report.coachName || "—"})`);
  const lines = [
    `Classes held: ${counts.classes}${counts.demos ? ` (${counts.demos} demo)` : ""}`,
    `Forms filled: ${counts.filled}`,
    `Not filled: ${counts.notFilled}`,
    counts.notHeld ? `Cancelled or moved: ${counts.notHeld}` : "",
    "",
    `Teacher video on 30+ min: ${counts.teacherVideo30Plus} · under 30 min: ${counts.teacherVideoUnder30} · never: ${counts.teacherVideoNever}`,
    `Student video off: ${counts.studentVideoOff}`,
    `Wrong lesson taught: ${counts.wrongLesson}`,
    `Class ended on time: ${counts.endedOnTime} · early: ${counts.endedEarly} · late: ${counts.endedLate}`,
    attention.length ? `\nClasses that need attention:\n${attention.join("\n")}` : "",
    unfilled.length ? `\nForms not filled:\n${unfilled.join("\n")}` : "",
  ].filter((line) => line !== "");

  await Promise.all(reviewers.map((reviewer) => sendAutomationEmail({
    to: reviewer.email,
    subject: `Class Monitor daily report: ${dayLabel(dateKey)}`,
    message: [
      `Hello ${reviewer.name || "there"},`,
      `Here is the Class Monitor summary for ${dayLabel(dateKey)}.`,
      ...lines,
      "The full report, with every class, can be downloaded as Excel or CSV from Class Monitor → Reports.",
      "Team Envision Chess Academy",
    ].join("\n"),
    actionLabel: "Open Reports",
    metadata: {
      kind: "class_monitor_daily",
      dateKey,
      href: `${CLASS_MONITOR_REPORTS_HREF}?date=${dateKey}`,
      dedupKey: `class-monitor-daily:${dateKey}:${reviewer.email}`,
    },
  }).catch((error) => console.error("[class-monitor] daily email failed", error))));
  return { sent: true, recipients: reviewers.length, classes: counts.classes };
}

/**
 * Every 5 minutes: keep yesterday's and today's reports in step with the
 * schedule (late-night classes, last-minute cancellations), raise the task for
 * classes about to start, and send yesterday's summary after 09:00 IST.
 */
export async function processClassMonitorSweep(now = new Date()) {
  const todayKey = academyDateKey(now);
  if (todayKey < classMonitorStartKey()) return { skipped: "not_started" };
  const yesterday = await syncClassMonitorDay(addDays(todayKey, -1), now);
  const today = await syncClassMonitorDay(todayKey, now);
  const tasks = await raiseDueClassMonitorTasks(now);
  const digest = await sendDailyClassMonitorSummary(now).catch((error) => {
    console.error("[class-monitor] daily summary failed", error);
    return { sent: false, reason: "error" };
  });
  return { yesterday, today, tasks, digest };
}
