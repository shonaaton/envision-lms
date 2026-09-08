import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Attendance } from "@/models/Attendance";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import { buildGeneratedSessions, CLASS_TIME_PATTERN, resolveClassStartTime, scheduleDatesFrom } from "@/lib/classroomSchedule";
import { deleteClassroomSessionInstances, syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { ACADEMY_TIME_ZONE, academyDateKey, academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
import { coachCanAccessClassroomSession, isPrimaryClassroomCoach, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { ensureTopicContinuationSession, hasClassesLeftToTeach, recalculateFutureSessionTopics, shouldContinueTopic, topicCompletedForOutcome } from "@/lib/classroomLifecycle";
import { recordActivity } from "@/lib/activity";
import { User } from "@/models/User";
import { Notification } from "@/models/Fee";
import { Homework, Submission } from "@/models/Homework";
import { AssignmentAutomationLog } from "@/models/AssignmentTemplate";
import { PGN } from "@/models/PGN";
import { Booking } from "@/models/Booking";
import { DemoBooking } from "@/models/Onboarding";
import { Batch } from "@/models/Batch";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";
import { sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";
import { notifyClassroomCoachAssigned } from "@/lib/classroomCoachNotifications";
import { notifyCourseCompleted, notifySessionCancelled } from "@/lib/classSessionNotifications";
import { writeRuntimeLog } from "@/lib/runtimeLogger";

export const dynamic = "force-dynamic";

async function deleteClassroomRecords(classroomId: string) {
  const questions = await LiveQuestion.find({ classroom: classroomId }).select("_id").lean();
  const questionIds = questions.map((question: any) => question._id);
  const homework = await Homework.find({ classroom: classroomId }).select("_id").lean();
  const homeworkIds = homework.map((item: any) => item._id);
  await Promise.all([
    Attendance.deleteMany({ classroom: classroomId }),
    ClassroomSession.deleteMany({ classroom: classroomId }),
    ClassroomChatMessage.deleteMany({ classroom: classroomId }),
    questionIds.length ? LiveQuestionResponse.deleteMany({ question: { $in: questionIds } }) : Promise.resolve(),
    LiveQuestion.deleteMany({ classroom: classroomId }),
    homeworkIds.length ? Submission.deleteMany({ homework: { $in: homeworkIds } }) : Promise.resolve(),
    Homework.deleteMany({ classroom: classroomId }),
    AssignmentAutomationLog.deleteMany({ classroom: classroomId }),
    PGN.updateMany({ classroom: classroomId }, { $unset: { classroom: 1 }, $set: { visibility: "private" } }),
    Booking.updateMany({ classroom: classroomId }, { $unset: { classroom: 1 } }),
    DemoBooking.updateMany({ classroom: classroomId }, { $unset: { classroom: 1 } }),
  ]);
}

async function sessionHasRecords(classroomId: string, scheduledSessionId: string) {
  const [attendance, liveSession, chat, question, homework, automation] = await Promise.all([
    Attendance.exists({ classroom: classroomId, scheduledSessionId }),
    ClassroomSession.exists({ classroom: classroomId, scheduledSessionId }),
    ClassroomChatMessage.exists({ classroom: classroomId, scheduledSessionId }),
    LiveQuestion.exists({ classroom: classroomId, scheduledSessionId }),
    Homework.exists({ classroom: classroomId, sourceSessionId: scheduledSessionId }),
    AssignmentAutomationLog.exists({ classroom: classroomId, scheduledSessionId }),
  ]);
  return Boolean(attendance || liveSession || chat || question || homework || automation);
}

function recordId(value: any) {
  return String(value?._id || value || "");
}

function dateOnly(value: any) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date.toISOString().slice(0, 10);
}

function plainSchedule(value: any) {
  return JSON.parse(JSON.stringify(value?.toObject?.() || value || [])).map((item: any) => {
    const { _id, ...rest } = item;
    return rest;
  });
}

function scheduleFingerprint(source: any) {
  return JSON.stringify({
    classroomType: source.classroomType || "single",
    classDate: dateOnly(source.classDate),
    startTime: source.startTime || "",
    durationMinutes: Number(source.durationMinutes || 60),
    startDate: dateOnly(source.startDate),
    endDate: dateOnly(source.endDate),
    frequency: source.frequency || "weekly",
    daysOfWeek: plainSchedule(source.daysOfWeek),
    endCondition: source.endCondition || "on_date",
    endAfterSessions: Number(source.endAfterSessions || 0),
    sessionPlan: plainSchedule(source.sessionPlan),
    topicName: source.topicName || "",
  });
}

function proposedSchedule(existing: any, body: any) {
  const next: Record<string, any> = {};
  for (const key of ["classroomType", "classDate", "startTime", "durationMinutes", "startDate", "endDate", "frequency", "daysOfWeek", "endCondition", "endAfterSessions", "sessionPlan", "topicName"]) {
    next[key] = body[key] !== undefined ? body[key] : existing[key];
  }
  return next;
}

function safeAcademyDateTime(date: string | Date, time: string) {
  try {
    const value = academyDateTime(date, time);
    return Number.isNaN(value.getTime()) ? null : value;
  } catch {
    return null;
  }
}

function dateKeyToUtc(key: string) {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDaysToDateKey(key: string, days: number) {
  const start = dateKeyToUtc(key);
  if (start === null) return "";
  const next = new Date(start + days * 86400000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function academyDayOffset(from: string | Date, to: string | Date) {
  const fromUtc = dateKeyToUtc(academyDateKey(from));
  const toUtc = dateKeyToUtc(academyDateKey(to));
  if (fromUtc === null || toUtc === null) return 0;
  return Math.round((toUtc - fromUtc) / 86400000);
}

function isShiftableScheduledSession(session: any) {
  const status = String(session?.status || "scheduled").toLowerCase();
  return ["scheduled", "rescheduled"].includes(status) && !session?.actualStartedAt && !session?.actualEndedAt;
}

/**
 * A class that has not been taught, whatever the roster says happened on the
 * day. A missed or abandoned class still owes its topic, so it is pushable even
 * though it is in the past; a completed or cancelled one is not.
 */
function isPushableSession(session: any) {
  const status = String(session?.status || "scheduled").toLowerCase();
  if (session?.actualStartedAt || session?.actualEndedAt) return false;
  return !["completed", "cancelled", "ongoing"].includes(status);
}

function topicOrderForName(classroom: any, topicName: string, fallback: number) {
  const normalized = topicName.trim().toLowerCase();
  const planned = (classroom.sessionPlan || []).find((topic: any) => String(topic?.topicName || "").trim().toLowerCase() === normalized);
  return Number(planned?.topicOrder ?? fallback ?? 0);
}

function normalizePermanentScheduleSlots(value: any) {
  if (!Array.isArray(value)) return [];
  const rows = value
    .map((day: any) => ({
      day: Number(day?.day),
      slots: Array.isArray(day?.slots)
        ? day.slots
            .map((slot: any) => ({
              startTime: String(slot?.startTime || "").trim(),
              durationMinutes: Math.max(15, Number(slot?.durationMinutes || 60)),
            }))
            .filter((slot: any) => /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime))
        : [],
    }))
    .filter((day: any) => Number.isInteger(day.day) && day.day >= 0 && day.day <= 6 && day.slots.length)
    .sort((a: any, b: any) => a.day - b.day);
  const byDay = new Map<number, any[]>();
  rows.forEach((day: any) => byDay.set(day.day, [...(byDay.get(day.day) || []), ...day.slots]));
  return Array.from(byDay.entries())
    .map(([day, slots]) => ({
      day,
      slots: slots.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime)),
    }))
    .sort((a: any, b: any) => a.day - b.day);
}

function buildPermanentScheduleOccurrences(daysOfWeek: any[], effectiveDate: string, count: number) {
  const startUtc = dateKeyToUtc(effectiveDate);
  if (startUtc === null || count <= 0) return [];
  const slots = daysOfWeek
    .flatMap((day: any) => (day.slots || []).map((slot: any) => ({ day: Number(day.day), ...slot })))
    .sort((a: any, b: any) => (a.day - b.day) || String(a.startTime).localeCompare(String(b.startTime)));
  const occurrences: Array<{ dateKey: string; startTime: string; durationMinutes: number }> = [];
  let cursor = new Date(startUtc);
  let guard = 0;

  while (occurrences.length < count && guard < 3700) {
    const dateKey = academyDateKey(cursor);
    const weekDay = cursor.getUTCDay();
    slots
      .filter((slot: any) => slot.day === weekDay)
      .forEach((slot: any) => {
        if (occurrences.length < count) {
          occurrences.push({ dateKey, startTime: slot.startTime, durationMinutes: slot.durationMinutes });
        }
      });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }

  return occurrences;
}

async function canAccessRecord(doc: any, user: any, allowSubstitute = false, scheduledSessionId?: string) {
  const role = user?.role;
  const userId = String(user?.id || "");
  if (doc?.isTestClassroom) {
    return role === "admin" && recordId(doc.testOwner) === userId && isSuperAdminSession(user);
  }
  if (role === "admin" || role === "sub-admin") return true;
  if (role === "instructor") {
    if (scheduledSessionId) return coachCanAccessClassroomSession(doc, userId, scheduledSessionId);
    return isPrimaryClassroomCoach(doc, userId) || (allowSubstitute && coachCanAccessClassroomSession(doc, userId));
  }
  return (doc?.students || []).some((value: any) => recordId(value) === userId);
}

function classroomHref(classroomId: string, sessionId?: string) {
  return sessionId ? `/classrooms/${classroomId}?session=${encodeURIComponent(sessionId)}` : `/classrooms/${classroomId}`;
}

function scheduleTimeLabel(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00+05:30`));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatAcademyDateTime(date);
}

function sessionDateLabel(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ACADEMY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function sessionDayLabel(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ACADEMY_TIME_ZONE,
    weekday: "long",
  }).format(date);
}

function sessionClockLabel(value?: string | Date | null, fallback = "") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ACADEMY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function todayAwareClassDateTime(value?: string | Date | null) {
  if (!value) return "the scheduled date and time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the scheduled date and time";
  const isToday = academyDateKey(date) === academyDateKey(new Date());
  const time = sessionClockLabel(date);
  if (isToday) return `today at ${time}`;
  return `${sessionDateLabel(date)} at ${time}`;
}

function sessionIsToday(value?: string | Date | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && academyDateKey(date) === academyDateKey(new Date());
}

function scheduleChanged(before: any, after: any) {
  if (!before || !after) return false;
  return (
    scheduleTimeLabel(before.scheduledFor) !== scheduleTimeLabel(after.scheduledFor) ||
    String(before.startTime || "") !== String(after.startTime || "") ||
    Number(before.durationMinutes || 0) !== Number(after.durationMinutes || 0)
  );
}

function scheduleChangeCopy({
  action,
  classroom,
  previousSession,
  currentSession,
  previousClassDate,
  shiftedCount,
  restartDate,
  requestSource,
}: {
  action: string;
  classroom: any;
  previousSession?: any;
  currentSession?: any;
  previousClassDate?: any;
  shiftedCount?: number;
  restartDate?: string;
  requestSource?: string;
}) {
  const classTitle = String(classroom?.title || "Class");
  const sessionTitle = String(currentSession?.topicName || previousSession?.topicName || classTitle);
  const previousTime = scheduleTimeLabel(previousSession?.scheduledFor || previousClassDate);
  const nextTime = scheduleTimeLabel(currentSession?.scheduledFor || classroom?.classDate);
  const sourceText = requestSource ? ` due to a rescheduling request from ${requestSource}` : "";

  if (action === "cancel_series") {
    return {
      type: "classroom.series.cancelled",
      title: "Class series cancelled",
      message: `${classTitle} has been cancelled. All unfinished classes in this series are cancelled.`,
    };
  }
  if (action === "cancel_class" || action === "cancel_session") {
    const timeText = previousTime || nextTime ? ` scheduled for ${previousTime || nextTime}` : "";
    return {
      type: "classroom.session.cancelled",
      title: "Class cancelled",
      message: `${sessionTitle}${timeText} has been cancelled.`,
    };
  }
  if (action === "push_session_forward") {
    return {
      type: "classroom.series.rescheduled",
      title: "Class schedule updated",
      message: `${sessionTitle} has been moved to the next class in ${classTitle}. Every later class moves down one slot and an extra class has been added at the end so no topic is missed.`,
    };
  }
  if (action === "shift_future_sessions") {
    const restartText = restartDate ? ` starting from ${scheduleTimeLabel(restartDate) || restartDate}` : "";
    return {
      type: "classroom.series.rescheduled",
      title: "Class schedule updated",
      message: `${shiftedCount || 0} future class${shiftedCount === 1 ? "" : "es"} in ${classTitle} were rescheduled${restartText}.`,
    };
  }
  if (action === "permanent_schedule_change") {
    const restartText = restartDate ? ` from ${scheduleTimeLabel(restartDate) || restartDate}` : "";
    return {
      type: "classroom.series.rescheduled",
      title: "Permanent class timing updated",
      message: `${classTitle} now follows the new weekly timing${restartText}. Future classes have been updated.`,
    };
  }
  const fromText = previousTime ? ` from ${previousTime}` : "";
  const toText = nextTime ? ` to ${nextTime}` : "";
  return {
    type: "classroom.session.rescheduled",
    title: "Class rescheduled",
    message: nextTime
      ? `Your next class is on ${nextTime}${sourceText}.`
      : `${sessionTitle} in ${classTitle} has been rescheduled${fromText}${toText}${sourceText}.`,
  };
}

function rescheduleRequestSource(recipient: any, actor?: { id?: string; role?: string }) {
  if (!actor?.id) return "";
  if (recordId(recipient?._id) === String(actor.id)) return "you";
  if (actor.role === "instructor" || actor.role === "coach") return "your coach";
  return "the academy";
}

function scheduleChangeWhatsAppTemplate(action: string) {
  if (action === "cancel_series") return "class_series_cancelled";
  if (action === "cancel_class" || action === "cancel_session") return "class_session_cancelled";
  if (action === "shift_future_sessions" || action === "push_session_forward") return "class_schedule_updated";
  if (action === "permanent_schedule_change") return "class_permanent_timing_updated";
  return "class_rescheduled";
}

function scheduleChangeWhatsAppParameters(input: {
  action: string;
  recipient: any;
  classroom: any;
  previousSession?: any;
  currentSession?: any;
  previousClassDate?: any;
  restartDate?: string;
}) {
  const name = String(input.recipient?.name || input.recipient?.username || "there");
  const classTitle = String(input.classroom?.title || "Class");
  const previousTime = scheduleTimeLabel(input.previousSession?.scheduledFor || input.previousClassDate);
  const nextTime = scheduleTimeLabel(input.currentSession?.scheduledFor || input.classroom?.classDate);
  if (input.action === "cancel_series") return [name, classTitle];
  if (input.action === "cancel_class" || input.action === "cancel_session") return [name, classTitle, previousTime || nextTime || "the scheduled class time"];
  if (input.action === "shift_future_sessions" || input.action === "push_session_forward") return [name, classTitle, nextTime || "the next scheduled class"];
  if (input.action === "permanent_schedule_change") return [name, classTitle, nextTime || String(input.classroom?.startTime || "the new class time"), input.restartDate ? scheduleTimeLabel(input.restartDate) || input.restartDate : "now"];
  return [name, classTitle, previousTime || "the previous class time", nextTime || "the new class time"];
}

async function notifySubstituteCoachAssignment({
  classroom,
  sessionIds,
  substituteCoachId,
  originalCoachId,
}: {
  classroom: any;
  sessionIds: string[];
  substituteCoachId: string;
  originalCoachId?: string;
}) {
  const classroomId = recordId(classroom?._id);
  const uniqueSessionIds = Array.from(new Set(sessionIds.map(String).filter(Boolean)));
  if (!classroomId || !uniqueSessionIds.length || !substituteCoachId) return;

  const sessions = (classroom?.generatedSessions || [])
    .filter((item: any) => uniqueSessionIds.includes(String(item._id)))
    .sort((a: any, b: any) => new Date(a?.scheduledFor || 0).getTime() - new Date(b?.scheduledFor || 0).getTime())
    .slice(0, 1);
  if (!sessions.length) return;

  const [substituteCoach, originalCoach, students, batches] = await Promise.all([
    User.findById(substituteCoachId).select("_id name email phone username countryCode role").lean(),
    originalCoachId || recordId(classroom?.coach || classroom?.instructor)
      ? User.findById(originalCoachId || recordId(classroom?.coach || classroom?.instructor)).select("_id name email phone username countryCode role").lean()
      : Promise.resolve(null),
    User.find({ _id: { $in: (classroom?.students || []).map(recordId).filter(Boolean) }, isActive: { $ne: false } }).select("_id name email phone username countryCode parentName role").lean(),
    Batch.find({ _id: { $in: (classroom?.batches || []).map(recordId).filter(Boolean) } }).select("name").lean(),
  ]);

  if (!substituteCoach && !students.length) return;

  const classTitle = String(classroom?.title || "Class");
  const batchLabel = batches.map((batch: any) => batch.name).filter(Boolean).join(", ") || classTitle;
  const originalCoachName = String((originalCoach as any)?.name || (originalCoach as any)?.username || "the regular coach");
  const substituteCoachName = String((substituteCoach as any)?.name || (substituteCoach as any)?.username || "the substitute coach");
  const levelLabel = String(classroom?.levelName || classroom?.level || "Not set");

  await sendWhatsAppAutomationTemplates(
    sessions.flatMap((scheduledSession: any) => {
      const sessionId = recordId(scheduledSession?._id);
      const scheduledFor = scheduledSession?.scheduledFor;
      const parentNotice = students.map((student: any) => ({
        user: student,
        templateName: "substitute_coach_parent_notice",
        bodyParameters: [
          classTitle,
          todayAwareClassDateTime(scheduledFor),
          substituteCoachName,
          originalCoachName,
        ],
        metadata: {
          kind: "classroom_substitute_coach",
          recipientType: "parent",
          classroomId,
          sessionId,
          studentId: recordId(student?._id),
          notificationDedupKey: `substitute:${classroomId}:${sessionId}:parent`,
        },
      }));
      const coachNotice = substituteCoach ? [{
        user: substituteCoach as any,
        templateName: "substitute_class_assigned_coach",
        bodyParameters: [
          sessionIsToday(scheduledFor) ? "Today" : sessionDateLabel(scheduledFor) || "the scheduled date",
          batchLabel,
          sessionClockLabel(scheduledFor, String(scheduledSession?.startTime || classroom?.startTime || "Time not set")),
          sessionDayLabel(scheduledFor) || "Day not set",
          sessionDateLabel(scheduledFor) || "Date not set",
          String(scheduledSession?.topicName || classroom?.topicName || "Topic not set"),
          levelLabel,
        ],
        metadata: {
          kind: "classroom_substitute_coach",
          recipientType: "coach",
          classroomId,
          sessionId,
          coachId: substituteCoachId,
          notificationDedupKey: `substitute:${classroomId}:${sessionId}:coach`,
        },
      }] : [];
      return [...parentNotice, ...coachNotice];
    })
  );
}

async function notifyClassroomScheduleChange({
  classroom,
  action,
  previousSession,
  currentSession,
  previousClassDate,
  shiftedCount,
  restartDate,
  actor,
}: {
  classroom: any;
  action: string;
  previousSession?: any;
  currentSession?: any;
  previousClassDate?: any;
  shiftedCount?: number;
  restartDate?: string;
  actor?: { id?: string; role?: string };
}) {
  const classroomId = recordId(classroom?._id);
  if (!classroomId) return;
  const sessionId = recordId(currentSession?._id || previousSession?._id);
  const batchCoachIds = action === "permanent_schedule_change"
    ? (await Batch.find({ _id: { $in: (classroom?.batches || []).map(recordId).filter(Boolean) } }).select("coach").lean())
        .map((batch: any) => recordId(batch.coach))
        .filter(Boolean)
    : [];
  const coachIds = [
    currentSession?.substituteCoach,
    previousSession?.substituteCoach,
    classroom?.coach,
    classroom?.instructor,
    ...batchCoachIds,
  ].map(recordId).filter(Boolean);
  const studentIds = (classroom?.students || []).map(recordId).filter(Boolean);
  const recipientIds = Array.from(new Set([...(action === "permanent_schedule_change" ? coachIds : coachIds.slice(0, 1)), ...studentIds]));
  if (!recipientIds.length) return;

  const recipients = await User.find({ _id: { $in: recipientIds }, isActive: { $ne: false } }).select("_id name email phone username countryCode role").lean();
  if (!recipients.length) return;

  const href = classroomHref(classroomId, sessionId || undefined);
  const metadata = {
    classroom: classroomId,
    sessionId,
    action,
    href,
    previousScheduledFor: previousSession?.scheduledFor || previousClassDate || "",
    scheduledFor: currentSession?.scheduledFor || classroom?.classDate || "",
    shiftedCount: shiftedCount || 0,
  };

  await Notification.insertMany(
    recipients.map((recipient: any) => {
      const copy = scheduleChangeCopy({
        action,
        classroom,
        previousSession,
        currentSession,
        previousClassDate,
        shiftedCount,
        restartDate,
        requestSource: rescheduleRequestSource(recipient, actor),
      });
      return {
        user: recipient._id,
        type: copy.type,
        title: copy.title,
        message: copy.message,
        metadata,
      };
    })
  );

  await Promise.all(
    recipients
      .filter((recipient: any) => recipient.email)
      .map((recipient: any) => {
        const copy = scheduleChangeCopy({
          action,
          classroom,
          previousSession,
          currentSession,
          previousClassDate,
          shiftedCount,
          restartDate,
          requestSource: rescheduleRequestSource(recipient, actor),
        });
        return sendAutomationEmail({
          to: String(recipient.email),
          subject: copy.title,
          message: `Hello ${recipient.name || ""},\n\n${copy.message}`,
          metadata: { kind: "classroom_schedule_change", ...metadata, userId: recordId(recipient._id) },
        });
      })
  );
  await sendWhatsAppAutomationTemplates(
    recipients.map((recipient: any) => ({
      user: recipient,
      templateName: scheduleChangeWhatsAppTemplate(action),
      bodyParameters: scheduleChangeWhatsAppParameters({
        action,
        recipient,
        classroom,
        previousSession,
        currentSession,
        previousClassDate,
        restartDate,
      }),
      metadata: { kind: "classroom_schedule_change", ...metadata, userId: recordId(recipient._id) },
    }))
  );
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessFeature("classrooms", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const doc = await Classroom.findById(params.id)
    .populate("instructor coach", "name email username")
    .populate("generatedSessions.students", "name email username isActive")
    .populate("students", "name email username isActive")
    .populate("batches", "name")
    .populate("course", "name category level")
    .lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scheduledSessionId = new URL(req.url).searchParams.get("session") || undefined;
  if (!(await canAccessRecord(doc, session.user as any, true, scheduledSessionId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json((session.user as any).role === "instructor" ? limitClassroomToCoachSessions(doc, String((session.user as any).id || "")) : doc);
}

/**
 * Every class action funnels through one PATCH. Without this wrapper an
 * unexpected throw reached the browser as a bare 500 with no body, and the
 * admin only ever saw "Could not update class" - so the actual cause is logged
 * and the action that failed is named in the response.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    return await patchClassroom(req, { params });
  } catch (error) {
    writeRuntimeLog({
      source: "api.classrooms.patch",
      message: "Classroom update failed",
      pathname: `/api/classrooms/${params.id}`,
      metadata: { classroomId: params.id },
      error,
    });
    return NextResponse.json(
      { error: `Could not update this class: ${error instanceof Error ? error.message : "unexpected server error"}` },
      { status: 500 }
    );
  }
}

async function patchClassroom(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const permission = ["cancel_class", "cancel_series", "cancel_session", "delete_session", "delete_series"].includes(body.action)
    ? "cancel"
    : body.action === "substitute_coach"
      ? "assign"
      : body.action === "add_extra_class"
        ? "create"
        : "edit";
  if (!(await canAccessFeature("classrooms", session.user as any, permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Closing a course decides that a batch is ready to move up a level, and
  // reopening one undoes that. Both are academy calls rather than teaching
  // calls, so they stay with the admin desk even where a coach has edit rights.
  if (["complete_classroom", "reopen_classroom", "cancel_scheduled_completion"].includes(body.action) && !["admin", "sub-admin"].includes(String((session.user as any).role || ""))) {
    return NextResponse.json({ error: "Only an admin can close or reopen a course" }, { status: 403 });
  }
  await dbConnect();
  const existing: any = await Classroom.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessRecord(existing, session.user as any))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reassignedSessionIds: string[] = [];
  const previousClassroomStatus = String(existing.status || "");
  const previousClassDate = existing.classDate;
  const previousStartTime = existing.startTime;
  const previousDurationMinutes = existing.durationMinutes;
  const previousCoachId = recordId(existing.coach || existing.instructor);
  let shiftedSessionCount = 0;
  let shiftedRestartDate = "";
  let cancelledSessionId = "";
  let addedExtraScheduledFor: Date | null = null;
  const previousSession = body.sessionId
    ? JSON.parse(JSON.stringify(existing.generatedSessions?.id?.(String(body.sessionId || "")) || (existing.generatedSessions || []).find((item: any) => String(item._id) === String(body.sessionId || "")) || null))
    : null;

  if (body.action === "cancel_class" || body.action === "cancel_series") {
    if (existing.status === "completed") return NextResponse.json({ error: "A completed classroom cannot be cancelled" }, { status: 409 });
    existing.status = "cancelled";
    (existing.generatedSessions || []).forEach((session: any) => {
      if (!session.actualEndedAt && session.status !== "completed") {
        session.status = "cancelled";
        session.coachAttendanceStatus = "cancelled";
        session.summary = { ...(session.summary || {}), classOutcome: "cancelled", topicCompleted: false, creditPolicy: "no_charge" };
      }
    });
  } else if (body.action === "complete_classroom") {
    if (existing.isSessionInstance) return NextResponse.json({ error: "A single class mirror cannot be completed on its own" }, { status: 409 });
    if (existing.status === "completed") return NextResponse.json({ error: "This course is already completed" }, { status: 409 });
    if (existing.status === "cancelled") return NextResponse.json({ error: "A cancelled course cannot be completed" }, { status: 409 });
    // "after_last_session" arms the close instead of doing it, so a course that
    // still has classes to teach finishes on its own once the register for the
    // last one is in. Anything else - including no mode at all - closes now.
    if (body.mode === "after_last_session" && hasClassesLeftToTeach(existing)) {
      existing.completeAfterLastSession = true;
      existing.completionArmedAt = new Date();
      existing.completionArmedBy = (session.user as any).id;
    } else {
      existing.status = "completed";
      existing.completedAt = new Date();
      existing.completedBy = (session.user as any).id;
      existing.completeAfterLastSession = false;
      existing.set("completionArmedAt", undefined);
      existing.set("completionArmedBy", undefined);
    }
  } else if (body.action === "cancel_scheduled_completion") {
    if (!existing.completeAfterLastSession) return NextResponse.json({ error: "This course is not waiting to close" }, { status: 409 });
    existing.completeAfterLastSession = false;
    existing.set("completionArmedAt", undefined);
    existing.set("completionArmedBy", undefined);
  } else if (body.action === "reopen_classroom") {
    if (existing.status !== "completed") return NextResponse.json({ error: "Only a completed course can be reopened" }, { status: 409 });
    // The sessions were never touched on close, so reopening is just the status
    // going back - whatever was still scheduled is still scheduled.
    existing.status = (existing.generatedSessions || []).some((item: any) => String(item.status || "") === "scheduled") ? "scheduled" : "ongoing";
    // `.set(..., undefined)` rather than a plain assignment: that is the form
    // mongoose reliably turns into an $unset across versions.
    existing.set("completedAt", undefined);
    existing.set("completedBy", undefined);
    // A reopened course must not be re-closed by the sweep the moment it sees it.
    existing.completeAfterLastSession = false;
    existing.set("completionArmedAt", undefined);
    existing.set("completionArmedBy", undefined);
  } else if (["update_session", "reschedule_session", "cancel_session", "delete_session", "mark_session_outcome", "change_session_topic"].includes(body.action)) {
    const sessionId = String(body.sessionId || "");
    const target = existing.generatedSessions?.id?.(sessionId) || (existing.generatedSessions || []).find((session: any) => String(session._id) === sessionId);
    if (!target) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
    const finished = target.status === "completed" || target.status === "ongoing" || Boolean(target.actualStartedAt || target.actualEndedAt);
    if (finished && !["mark_session_outcome", "change_session_topic"].includes(body.action)) return NextResponse.json({ error: "A started or completed class can no longer be changed or deleted" }, { status: 409 });
    if (target.status === "cancelled" && body.action !== "delete_session") return NextResponse.json({ error: "A cancelled class can only be deleted" }, { status: 409 });

    if (body.action === "mark_session_outcome") {
      const outcome = String(body.classOutcome || "").trim();
      if (!["completed", "completed_continue_topic", "cancelled", "missed", "abandoned", "absent", "coach_no_show", "student_no_show", "technical_issue"].includes(outcome)) {
        return NextResponse.json({ error: "Select a valid class outcome" }, { status: 400 });
      }
      const previousStatus = target.status;
      const sessionStatus = outcome === "completed_continue_topic" ? "completed" : outcome;
      target.status = sessionStatus;
      target.coachAttendanceStatus = outcome === "coach_no_show" ? "coach_no_show" : outcome === "technical_issue" ? "technical_issue" : outcome === "cancelled" ? "cancelled" : target.coachAttendanceStatus || "present";
      target.attendanceMarkedAt = new Date();
      target.summary = {
        ...(target.summary || {}),
        classOutcome: outcome,
        topicCompleted: topicCompletedForOutcome(sessionStatus, outcome),
        creditPolicy: sessionStatus === "completed" ? "charge_present_students" : outcome === "student_no_show" ? "repeat_no_show_policy" : "no_charge",
        adminCorrection: true,
        adminCorrectionReason: String(body.reason || ""),
      };
      if (shouldContinueTopic(outcome)) {
        await ensureTopicContinuationSession(existing, target, (session.user as any).id);
      }
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.session.outcome_corrected",
        label: `Corrected class outcome to ${outcome}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: { sessionId, previousStatus, outcome, reason: body.reason || "" },
      });
    } else if (body.action === "change_session_topic") {
      const actorRole = String((session.user as any)?.role || "");
      if (!["admin", "sub-admin"].includes(actorRole)) {
        return NextResponse.json({ error: "Only admins and sub-admins can recalibrate topics" }, { status: 403 });
      }
      const nextTopicName = String(body.topicName || "").trim();
      if (!nextTopicName) return NextResponse.json({ error: "Enter the corrected topic" }, { status: 400 });
      const previousTopicName = String(target.topicName || "");
      target.topicName = nextTopicName;
      target.topicOrder = topicOrderForName(existing, nextTopicName, target.topicOrder);
      target.topicLocked = true;
      target.topicOverrideReason = String(body.reason || "").trim() || "Manual admin topic correction";
      target.summary = {
        ...(target.summary || {}),
        adminTopicCorrection: true,
        adminTopicCorrectionReason: String(body.reason || ""),
        previousTopicName,
      };
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.session.topic_corrected",
        label: `Corrected class topic to ${nextTopicName}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: { sessionId, previousTopicName, topicName: nextTopicName, reason: body.reason || "" },
      });
    } else if (body.action === "delete_session") {
      if (existing.classroomType === "series" && (existing.generatedSessions?.length || 0) <= 1) {
        return NextResponse.json({ error: "A series must keep at least one class. Delete the entire series instead." }, { status: 409 });
      }
      if (await sessionHasRecords(params.id, sessionId)) {
        return NextResponse.json({ error: "This class already has attendance or live-class records. Cancel it instead of deleting it." }, { status: 409 });
      }
      existing.generatedSessions.pull({ _id: sessionId });
      (existing.generatedSessions || []).forEach((session: any, index: number) => { session.sessionNumber = index + 1; });
    } else if (body.action === "cancel_session") {
      target.status = "cancelled";
      target.coachAttendanceStatus = "cancelled";
      target.summary = { ...(target.summary || {}), classOutcome: "cancelled", topicCompleted: false, creditPolicy: "no_charge" };
      // Same-day cancellations are the ones families need to hear about now.
      // A cancellation further out already reaches them through the schedule
      // change notice below.
      cancelledSessionId = sessionId;
    } else {
      const nextStartTime = String(body.startTime || target.startTime || existing.startTime || "00:00");
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextStartTime)) return NextResponse.json({ error: "Select a valid class time" }, { status: 400 });
      if (body.classDate) {
        if (body.action === "reschedule_session" && !target.originalDate) target.originalDate = target.scheduledFor;
        const scheduledFor = safeAcademyDateTime(String(body.classDate), nextStartTime);
        if (!scheduledFor) return NextResponse.json({ error: "Select a valid class date" }, { status: 400 });
        target.scheduledFor = scheduledFor;
      } else if (body.startTime) {
        if (body.action === "reschedule_session" && !target.originalDate) target.originalDate = target.scheduledFor;
        const scheduledFor = safeAcademyDateTime(target.scheduledFor, nextStartTime);
        if (!scheduledFor) return NextResponse.json({ error: "Select a valid class date" }, { status: 400 });
        target.scheduledFor = scheduledFor;
      }
      target.startTime = nextStartTime;
      target.durationMinutes = Math.max(15, Number(body.durationMinutes || target.durationMinutes || existing.durationMinutes || 60));
      if (String(body.topicName || "").trim()) {
        target.topicName = String(body.topicName).trim();
        target.topicLocked = true;
        target.topicOverrideReason = "Manual topic edit";
      }
      if (body.action === "reschedule_session") {
        target.status = "scheduled";
        target.coachAttendanceStatus = "pending";
      }
    }
    const remainingStatuses = (existing.generatedSessions || []).map((item: any) => String(item.status || "scheduled"));
    if (remainingStatuses.length && remainingStatuses.every((status: string) => status === "cancelled")) existing.status = "cancelled";
    // A finished last class no longer completes the course by itself. It used to,
    // on the weaker "every session is terminal" test, which marked courses done
    // that had classes nobody taught - and it also reset an already completed
    // course back to "scheduled" whenever an old attendance record was edited.
    // `isReadyToComplete` now surfaces this to the admin as a prompt instead.
  } else if (body.action === "reschedule_class") {
    if (existing.status === "completed" || existing.status === "cancelled") return NextResponse.json({ error: "This class can no longer be rescheduled" }, { status: 409 });
    if (!String(body.classDate || "").trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.startTime || ""))) {
      return NextResponse.json({ error: "Select a valid date and time" }, { status: 400 });
    }
    const nextScheduledFor = safeAcademyDateTime(body.classDate, body.startTime);
    if (!nextScheduledFor) return NextResponse.json({ error: "Select a valid class date" }, { status: 400 });
    existing.classDate = body.classDate ? new Date(body.classDate) : existing.classDate;
    existing.startTime = body.startTime || existing.startTime;
    existing.durationMinutes = Math.max(15, Number(body.durationMinutes || existing.durationMinutes || 60));
    if (Array.isArray(existing.generatedSessions) && existing.generatedSessions[0]) {
      existing.generatedSessions[0].originalDate = existing.generatedSessions[0].scheduledFor;
      existing.generatedSessions[0].scheduledFor = nextScheduledFor;
      existing.generatedSessions[0].startTime = body.startTime || existing.generatedSessions[0].startTime;
      existing.generatedSessions[0].durationMinutes = Math.max(15, Number(body.durationMinutes || existing.generatedSessions[0].durationMinutes || 60));
      existing.generatedSessions[0].status = "scheduled";
    }
  } else if (body.action === "shift_future_sessions") {
    if (existing.classroomType !== "series") return NextResponse.json({ error: "Just break shifting is only available for class series" }, { status: 409 });
    if (existing.status === "completed" || existing.status === "cancelled") return NextResponse.json({ error: "This series can no longer be shifted" }, { status: 409 });
    if (!String(body.restartDate || "").trim() || Number.isNaN(new Date(body.restartDate).getTime())) {
      return NextResponse.json({ error: "Select a valid class restart date" }, { status: 400 });
    }
    const restartKey = academyDateKey(String(body.restartDate));
    if (dateKeyToUtc(restartKey) === null) return NextResponse.json({ error: "Select a valid class restart date" }, { status: 400 });
    const movable = (existing.generatedSessions || [])
      .filter(isShiftableScheduledSession)
      .sort((a: any, b: any) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime());
    if (!movable.length) return NextResponse.json({ error: "This series has no future scheduled classes to shift" }, { status: 409 });

    const firstOriginalDate = movable[0].scheduledFor;
    const shiftedDates = movable.map((item: any) => {
      const offset = academyDayOffset(firstOriginalDate, item.scheduledFor || firstOriginalDate);
      const shiftedDateKey = addDaysToDateKey(restartKey, offset);
      const shiftedFor = safeAcademyDateTime(shiftedDateKey, String(item.startTime || existing.startTime || "00:00"));
      return { item, shiftedFor };
    });
    if (shiftedDates.some(({ shiftedFor }: any) => !shiftedFor)) {
      return NextResponse.json({ error: "One or more future classes has an invalid time. Fix the class time before shifting the series." }, { status: 400 });
    }

    shiftedDates.forEach(({ item, shiftedFor }: any) => {
      if (!item.originalDate) item.originalDate = item.scheduledFor;
      item.scheduledFor = shiftedFor;
      item.status = "scheduled";
      item.coachAttendanceStatus = "pending";
      item.notes = String(body.reason || "").trim()
        ? [item.notes, `Just break shift: ${String(body.reason).trim()}`].filter(Boolean).join("\n")
        : item.notes;
    });

    shiftedSessionCount = movable.length;
    shiftedRestartDate = restartKey;
    existing.startDate = new Date(body.restartDate);
    await recordActivity({
      actor: (session.user as any).id,
      type: "classroom.series.exam_break_shifted",
      label: `Shifted ${movable.length} future class${movable.length === 1 ? "" : "es"} after just break`,
      entityType: "Classroom",
      entityId: params.id,
      metadata: { restartDate: restartKey, shiftedSessions: movable.map((item: any) => String(item._id)), reason: body.reason || "" },
    });
  } else if (body.action === "push_session_forward") {
    // Move a class that never happened into the next scheduled slot, taking the
    // rest of the series with it: every later class slides one slot down and one
    // new slot is added at the end, so no topic is skipped and no topic is lost.
    if (existing.classroomType !== "series") {
      return NextResponse.json({ error: "Only a class in a series can be pushed to the next class. Reschedule a single class instead." }, { status: 409 });
    }
    const pushSessionId = String(body.sessionId || "");
    const pushTarget =
      existing.generatedSessions?.id?.(pushSessionId) ||
      (existing.generatedSessions || []).find((item: any) => String(item._id) === pushSessionId);
    if (!pushTarget) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
    if (!isPushableSession(pushTarget)) {
      return NextResponse.json({ error: "A completed, cancelled, or running class cannot be pushed forward." }, { status: 409 });
    }

    const pushFrom = new Date(pushTarget.scheduledFor || 0).getTime();
    const chain = (existing.generatedSessions || [])
      .filter((item: any) => isPushableSession(item) && new Date(item.scheduledFor || 0).getTime() >= pushFrom)
      .sort((a: any, b: any) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime());
    if (!chain.length) return NextResponse.json({ error: "This class has nothing left to push into" }, { status: 409 });

    // Each class inherits the slot of the one after it; the last needs a brand
    // new slot, taken from the classroom's own weekly pattern.
    const last = chain[chain.length - 1];
    const dayAfterLast = new Date(new Date(last.scheduledFor).getTime() + 24 * 60 * 60 * 1000);
    const [patternSlot] = scheduleDatesFrom(
      (existing.daysOfWeek || []) as any,
      dayAfterLast,
      1,
      Number(last.durationMinutes || existing.durationMinutes || 60)
    );
    // A weekly pattern can carry a slot with no time on it, and that slot's own
    // scheduledFor would then be midnight - so only take it when it is usable.
    const extraSlot = patternSlot && CLASS_TIME_PATTERN.test(String(patternSlot.startTime || "")) ? patternSlot : null;
    // No usable weekly pattern to land on - keep the last class's own time, one
    // week later.
    const fallbackSlot = {
      scheduledFor: new Date(new Date(last.scheduledFor).getTime() + 7 * 24 * 60 * 60 * 1000),
      startTime: resolveClassStartTime(last, existing),
      durationMinutes: Number(last.durationMinutes || existing.durationMinutes || 60),
    };
    const donors = [
      ...chain.slice(1).map((item: any) => ({
        scheduledFor: new Date(item.scheduledFor),
        startTime: resolveClassStartTime(item, existing),
        durationMinutes: Number(item.durationMinutes || existing.durationMinutes || 60),
      })),
      extraSlot || fallbackSlot,
    ];
    if (donors.some((slot: any) => !CLASS_TIME_PATTERN.test(String(slot.startTime || "")))) {
      return NextResponse.json({ error: "One or more classes in this series has no class time set. Fix the class time before pushing this class forward." }, { status: 400 });
    }

    chain.forEach((item: any, index: number) => {
      const slot = donors[index];
      if (!item.originalDate) item.originalDate = item.scheduledFor;
      item.scheduledFor = slot.scheduledFor;
      item.startTime = slot.startTime;
      item.durationMinutes = slot.durationMinutes;
      item.status = "scheduled";
      item.coachAttendanceStatus = "pending";
      item.attendanceMarkedAt = undefined;
      item.summary = { ...(item.summary || {}), pushedForward: true, pushedFromSessionId: pushSessionId };
    });

    const newEnd = chain[chain.length - 1].scheduledFor;
    if (!existing.endDate || new Date(newEnd).getTime() > new Date(existing.endDate).getTime()) existing.endDate = newEnd;
    if (existing.status === "completed") existing.status = "scheduled";

    shiftedSessionCount = chain.length;
    await recordActivity({
      actor: (session.user as any).id,
      type: "classroom.session.pushed_forward",
      label: `Pushed ${pushTarget.topicName || "a missed class"} into the next class and moved ${chain.length - 1} later class${chain.length - 1 === 1 ? "" : "es"} down`,
      entityType: "Classroom",
      entityId: params.id,
      metadata: {
        sessionId: pushSessionId,
        movedSessions: chain.map((item: any) => String(item._id)),
        newEndDate: newEnd,
        reason: String(body.reason || ""),
        source: "manual_admin",
      },
    });
  } else if (body.action === "permanent_schedule_change") {
    if (existing.classroomType !== "series") return NextResponse.json({ error: "Permanent timing changes are only available for class series" }, { status: 409 });
    if (existing.status === "completed" || existing.status === "cancelled") return NextResponse.json({ error: "This series can no longer be changed" }, { status: 409 });
    const nextDays = normalizePermanentScheduleSlots(body.daysOfWeek);
    if (!nextDays.length) return NextResponse.json({ error: "Add at least one weekly day and time slot" }, { status: 400 });
    if (nextDays.some((day: any) => new Set((day.slots || []).map((slot: any) => slot.startTime)).size !== (day.slots || []).length)) {
      return NextResponse.json({ error: "Remove duplicate time slots from the same day" }, { status: 400 });
    }
    const movable = (existing.generatedSessions || [])
      .filter(isShiftableScheduledSession)
      .sort((a: any, b: any) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime());
    if (!movable.length) return NextResponse.json({ error: "This series has no future scheduled classes available for a permanent timing change" }, { status: 409 });
    const effectiveKey = String(body.effectiveDate || "").trim()
      ? academyDateKey(String(body.effectiveDate))
      : academyDateKey(movable[0].scheduledFor);
    if (dateKeyToUtc(effectiveKey) === null) return NextResponse.json({ error: "Select a valid effective date" }, { status: 400 });
    const occurrences = buildPermanentScheduleOccurrences(nextDays, effectiveKey, movable.length);
    if (occurrences.length !== movable.length) {
      return NextResponse.json({ error: "The updated weekly timing could not cover all future classes" }, { status: 400 });
    }

    movable.forEach((item: any, index: number) => {
      const occurrence = occurrences[index];
      const scheduledFor = safeAcademyDateTime(occurrence.dateKey, occurrence.startTime);
      if (!scheduledFor) return;
      if (!item.originalDate) item.originalDate = item.scheduledFor;
      item.scheduledFor = scheduledFor;
      item.startTime = occurrence.startTime;
      item.durationMinutes = occurrence.durationMinutes;
      item.status = "scheduled";
      item.coachAttendanceStatus = "pending";
      item.notes = String(body.reason || "").trim()
        ? [item.notes, `Permanent timing change: ${String(body.reason).trim()}`].filter(Boolean).join("\n")
        : item.notes;
    });

    existing.daysOfWeek = nextDays;
    existing.sessionsPerWeek = nextDays.reduce((total: number, day: any) => total + (day.slots?.length || 0), 0);
    existing.durationMinutes = Math.max(15, Number(nextDays[0]?.slots?.[0]?.durationMinutes || existing.durationMinutes || 60));
    shiftedSessionCount = movable.length;
    shiftedRestartDate = effectiveKey;
    await recordActivity({
      actor: (session.user as any).id,
      type: "classroom.series.permanent_timing_changed",
      label: `Changed permanent timing for ${existing.title}`,
      entityType: "Classroom",
      entityId: params.id,
      metadata: {
        effectiveDate: effectiveKey,
        changedSessions: movable.map((item: any) => String(item._id)),
        sessionsPerWeek: existing.sessionsPerWeek,
        daysOfWeek: nextDays,
        reason: body.reason || "",
      },
    });
  } else if (body.action === "substitute_coach") {
    if (!String(body.coach || "").trim()) return NextResponse.json({ error: "Select a substitute coach" }, { status: 400 });
    if (!(await User.exists({ _id: body.coach, role: "instructor", isActive: { $ne: false } }))) return NextResponse.json({ error: "The selected coach is not active" }, { status: 400 });
    if (body.scope === "session" && body.sessionId) {
      const target = existing.generatedSessions?.id?.(body.sessionId);
      if (!target) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
      if (["completed", "cancelled"].includes(target.status) || target.actualEndedAt) return NextResponse.json({ error: "A completed or cancelled class cannot be reassigned" }, { status: 409 });
      target.substituteCoach = body.coach;
      reassignedSessionIds.push(String(target._id));
    } else if (body.scope === "future" && Array.isArray(existing.generatedSessions)) {
      existing.generatedSessions.forEach((item: any) => {
        if (item.status === "scheduled" && !item.actualStartedAt && !item.actualEndedAt) {
          item.substituteCoach = body.coach;
          reassignedSessionIds.push(String(item._id));
        }
      });
      if (!reassignedSessionIds.length) return NextResponse.json({ error: "This series has no future classes available for reassignment" }, { status: 409 });
    } else {
      existing.coach = body.coach;
      existing.instructor = body.coach;
      (existing.generatedSessions || []).forEach((item: any) => {
        if (!["completed", "cancelled"].includes(item.status) && !item.actualEndedAt) {
          item.substituteCoach = undefined;
          reassignedSessionIds.push(String(item._id));
        }
      });
    }
  } else if (body.action === "add_extra_class") {
    if (existing.classroomType !== "series" || existing.status === "completed" || existing.status === "cancelled") return NextResponse.json({ error: "Extra classes can only be added to an active series" }, { status: 409 });
    if (!String(body.classDate || "").trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.startTime || ""))) return NextResponse.json({ error: "Select a valid date and time" }, { status: 400 });
    const extraScheduledFor = safeAcademyDateTime(body.classDate, String(body.startTime));
    if (!extraScheduledFor) return NextResponse.json({ error: "Select a valid class date" }, { status: 400 });
    const nextNumber = (existing.generatedSessions?.length || 0) + 1;
    existing.generatedSessions = [
      ...(existing.generatedSessions || []),
      {
        sessionNumber: nextNumber,
        topicName: String(body.topicName || "Extra Class"),
        scheduledFor: extraScheduledFor,
        startTime: String(body.startTime || existing.startTime || "16:00"),
        durationMinutes: Math.max(15, Number(body.durationMinutes || existing.durationMinutes || 60)),
        status: "scheduled",
        isExtra: true,
      },
    ];
    addedExtraScheduledFor = extraScheduledFor;
  } else if (body.action === "delete_series") {
    await recordActivity({
      actor: (session.user as any).id,
      type: "classroom.series.deleted",
      label: `Deleted classroom series ${existing.title}`,
      entityType: "Classroom",
      entityId: params.id,
      metadata: { title: existing.title, source: "manual_admin" },
    });
    await deleteClassroomRecords(params.id);
    await deleteClassroomSessionInstances(params.id);
    await Classroom.findByIdAndDelete(params.id);
    return NextResponse.json({ ok: true });
  } else {
    const nextDays = Array.isArray(body.daysOfWeek) ? body.daysOfWeek : existing.daysOfWeek || [];
    const nextType = body.classroomType || existing.classroomType || "single";
    if (!String(body.title ?? existing.title ?? "").trim()) return NextResponse.json({ error: "Class name is required" }, { status: 400 });
    if (!String(body.coach ?? existing.coach ?? "").trim()) return NextResponse.json({ error: "Select a coach for this classroom" }, { status: 400 });
    if (body.coach && recordId(body.coach) !== recordId(existing.coach) && !(await canAccessFeature("classrooms", session.user as any, "assign"))) {
      return NextResponse.json({ error: "You do not have permission to reassign this classroom" }, { status: 403 });
    }
    if (body.coach && !(await User.exists({ _id: body.coach, role: "instructor", isActive: { $ne: false } }))) return NextResponse.json({ error: "The selected coach is not active" }, { status: 400 });
    const nextSchedule = proposedSchedule(existing, body);
    if (nextType === "single") {
      if (!nextSchedule.classDate || Number.isNaN(new Date(nextSchedule.classDate).getTime())) return NextResponse.json({ error: "Select a valid class date" }, { status: 400 });
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(nextSchedule.startTime || ""))) return NextResponse.json({ error: "Select a valid class time" }, { status: 400 });
    } else {
      const scheduleDays = Array.isArray(nextSchedule.daysOfWeek) ? nextSchedule.daysOfWeek : [];
      if (!nextSchedule.startDate || Number.isNaN(new Date(nextSchedule.startDate).getTime())) return NextResponse.json({ error: "Select a valid series start date" }, { status: 400 });
      if (!scheduleDays.some((day: any) => Array.isArray(day.slots) && day.slots.length)) return NextResponse.json({ error: "Add at least one day and time slot" }, { status: 400 });
      if (scheduleDays.some((day: any) => new Set((day.slots || []).map((slot: any) => slot.startTime)).size !== (day.slots || []).length)) {
        return NextResponse.json({ error: "Remove duplicate time slots from the same day" }, { status: 400 });
      }
      if (nextSchedule.endCondition === "on_date" && (!nextSchedule.endDate || new Date(nextSchedule.endDate).getTime() < new Date(nextSchedule.startDate).getTime())) {
        return NextResponse.json({ error: "The series end date must be on or after the start date" }, { status: 400 });
      }
    }
    const scheduleChanged = scheduleFingerprint(existing) !== scheduleFingerprint(nextSchedule);
    const previousSessions = (existing.generatedSessions || []).map((item: any) => item.toObject());
    if (scheduleChanged) {
      const hasProtectedSessions = previousSessions.some((item: any) => item.status !== "scheduled" || item.actualStartedAt || item.actualEndedAt || item.attendanceMarkedAt);
      const hasRecords = await Promise.all([
        Attendance.exists({ classroom: params.id }),
        ClassroomSession.exists({ classroom: params.id }),
      ]).then((values) => values.some(Boolean));
      if (hasProtectedSessions || hasRecords) {
        return NextResponse.json({ error: "This classroom already has session history. Use the individual class controls to change future dates, times, durations, or topics." }, { status: 409 });
      }
    }
    const safeBody = { ...body };
    delete safeBody.action;
    delete safeBody.sessionId;
    delete safeBody.generatedSessions;
    delete safeBody._id;
    if ("meetingUrl" in safeBody) {
      const meetingUrl = String(safeBody.meetingUrl || "").trim();
      const normalizedMeetingUrl = meetingUrl ? normalizeGoogleMeetUrl(meetingUrl) : "";
      if (meetingUrl && !normalizedMeetingUrl) {
        return NextResponse.json({ error: "Add the exact Google Meet room link, not a generic Meet start link." }, { status: 400 });
      }
      safeBody.meetingUrl = normalizedMeetingUrl;
    }
    existing.set({
      ...safeBody,
      course: body.course ? body.course : undefined,
      classDate: body.classDate ? new Date(body.classDate) : existing.classDate,
      startDate: body.startDate ? new Date(body.startDate) : existing.startDate,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      durationMinutes: Math.max(15, Number(body.durationMinutes || existing.durationMinutes || 60)),
    });
    if (scheduleChanged) {
      const regenerated = buildGeneratedSessions({
        classroomType: nextType,
        title: existing.title,
        topicName: existing.topicName || existing.title,
        topicOrder: existing.topicOrder || 0,
        classDate: existing.classDate,
        startTime: existing.startTime,
        durationMinutes: existing.durationMinutes,
        startDate: existing.startDate,
        endDate: existing.endDate,
        frequency: existing.frequency || "weekly",
        daysOfWeek: nextDays,
        endCondition: existing.endCondition || "on_date",
        endAfterSessions: existing.endAfterSessions,
        sessionPlan: existing.sessionPlan || [],
      });
      if (!regenerated.length) return NextResponse.json({ error: "The updated schedule did not create any classes. Check the dates, topics, days, and times." }, { status: 400 });
      existing.generatedSessions = regenerated.map((item: any, index: number) => ({
        ...item,
        ...(previousSessions[index]?._id ? { _id: previousSessions[index]._id } : {}),
        ...(previousSessions[index]?.substituteCoach ? { substituteCoach: previousSessions[index].substituteCoach } : {}),
      }));
    }
  }

  await recalculateFutureSessionTopics(existing, (session.user as any).id);
  await existing.save();
  if (reassignedSessionIds.length) {
    await Promise.all([
      ClassroomSession.updateMany(
        { classroom: params.id, scheduledSessionId: { $in: reassignedSessionIds } },
        { $set: { coach: body.coach } }
      ),
      Attendance.updateMany(
        { classroom: params.id, scheduledSessionId: { $in: reassignedSessionIds } },
        { $set: { coach: body.coach } }
      ),
    ]);
  }
  await syncClassroomSessionInstances(params.id);

  // Class lifecycle notices. Both are fire-and-forget: a messaging failure must
  // never fail the admin's save, and both are logged and alerted on internally.
  if (cancelledSessionId) {
    void notifySessionCancelled(existing.toObject?.() ?? existing, cancelledSessionId).catch((error) => {
      console.error("Same-day cancellation notice failed", error);
    });
  }
  if (previousClassroomStatus !== "completed" && String(existing.status || "") === "completed") {
    void notifyCourseCompleted(existing.toObject?.() ?? existing).catch((error) => {
      console.error("Course completion notice failed", error);
    });
  }

  const activityAction = String(body.action || "update_classroom");
  const sessionId = String(body.sessionId || "");
  const currentSession = sessionId
    ? existing.generatedSessions?.id?.(sessionId) || (existing.generatedSessions || []).find((item: any) => String(item._id) === sessionId)
    : Array.isArray(existing.generatedSessions) && existing.generatedSessions.length === 1
      ? existing.generatedSessions[0]
      : null;
  if (activityAction === "add_extra_class" && addedExtraScheduledFor) {
    const addedAt = addedExtraScheduledFor.getTime();
    const addedSession = (existing.generatedSessions || []).find((item: any) => item?.isExtra && new Date(item?.scheduledFor || 0).getTime() === addedAt);
    await notifyClassroomCoachAssigned({ classroom: existing, reason: "extra_class_added", session: addedSession })
      .catch((error) => console.error("Coach extra class notification failed", error));
  }
  if (activityAction === "substitute_coach" && reassignedSessionIds.length) {
    await notifySubstituteCoachAssignment({
      classroom: existing,
      sessionIds: reassignedSessionIds,
      substituteCoachId: String(body.coach || ""),
      originalCoachId: previousCoachId,
    });
  }
  const shouldNotifyScheduleChange = (
    ["cancel_class", "cancel_series", "cancel_session", "reschedule_class", "reschedule_session", "shift_future_sessions", "permanent_schedule_change", "push_session_forward"].includes(activityAction) ||
    (activityAction === "update_session" && scheduleChanged(previousSession, currentSession))
  );
  if (shouldNotifyScheduleChange) {
    const notificationPreviousSession = previousSession || (["cancel_class", "reschedule_class"].includes(activityAction)
      ? {
          _id: currentSession?._id,
          topicName: existing.topicName || existing.title,
          scheduledFor: previousClassDate ? safeAcademyDateTime(previousClassDate, String(previousStartTime || existing.startTime || "00:00")) : undefined,
          startTime: previousStartTime,
          durationMinutes: previousDurationMinutes,
        }
      : undefined);
    await notifyClassroomScheduleChange({
      classroom: existing,
      action: activityAction,
      previousSession: notificationPreviousSession,
      currentSession,
      previousClassDate,
      shiftedCount: shiftedSessionCount,
      restartDate: shiftedRestartDate,
      actor: { id: String((session.user as any).id || ""), role: String((session.user as any).role || "") },
    });
  }
  if (!["mark_session_outcome", "shift_future_sessions", "permanent_schedule_change", "push_session_forward"].includes(activityAction)) {
    const commonMetadata = {
      action: activityAction,
      title: existing.title,
      previousClassroomStatus,
      classroomStatus: existing.status,
      source: "manual_admin",
    };
    if (activityAction === "reschedule_session") {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.session.rescheduled",
        label: `Rescheduled ${currentSession?.topicName || "class session"} in ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: {
          ...commonMetadata,
          sessionId,
          previousScheduledFor: previousSession?.scheduledFor || "",
          scheduledFor: currentSession?.scheduledFor || "",
          previousStartTime: previousSession?.startTime || "",
          startTime: currentSession?.startTime || "",
          previousDurationMinutes: previousSession?.durationMinutes || 0,
          durationMinutes: currentSession?.durationMinutes || 0,
        },
      });
    } else if (activityAction === "reschedule_class") {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.class.rescheduled",
        label: `Rescheduled class ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: {
          ...commonMetadata,
          previousClassDate,
          classDate: existing.classDate,
          previousStartTime,
          startTime: existing.startTime,
          previousDurationMinutes,
          durationMinutes: existing.durationMinutes,
        },
      });
    } else if (activityAction === "cancel_session") {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.session.cancelled",
        label: `Cancelled ${currentSession?.topicName || "class session"} in ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: { ...commonMetadata, sessionId, previousStatus: previousSession?.status || "", status: currentSession?.status || "" },
      });
    } else if (activityAction === "delete_session") {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.session.deleted",
        label: `Deleted ${previousSession?.topicName || "class session"} from ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: { ...commonMetadata, sessionId, previousScheduledFor: previousSession?.scheduledFor || "" },
      });
    } else if (activityAction === "substitute_coach") {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.coach.reassigned",
        label: `Changed coach assignment for ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: { ...commonMetadata, coach: body.coach || "", scope: body.scope || "classroom", reassignedSessionIds },
      });
    } else if (activityAction === "add_extra_class") {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.session.extra_added",
        label: `Added extra class to ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: { ...commonMetadata, classDate: body.classDate || "", startTime: body.startTime || "", topicName: body.topicName || "Extra Class" },
      });
    } else if (activityAction === "cancel_class" || activityAction === "cancel_series") {
      await recordActivity({
        actor: (session.user as any).id,
        type: activityAction === "cancel_series" ? "classroom.series.cancelled" : "classroom.class.cancelled",
        label: `Cancelled ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: commonMetadata,
      });
    } else if (activityAction === "update_session") {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.session.updated",
        label: `Updated ${currentSession?.topicName || "class session"} in ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: {
          ...commonMetadata,
          sessionId,
          previousScheduledFor: previousSession?.scheduledFor || "",
          scheduledFor: currentSession?.scheduledFor || "",
          previousStartTime: previousSession?.startTime || "",
          startTime: currentSession?.startTime || "",
          previousDurationMinutes: previousSession?.durationMinutes || 0,
          durationMinutes: currentSession?.durationMinutes || 0,
        },
      });
    } else {
      await recordActivity({
        actor: (session.user as any).id,
        type: "classroom.updated",
        label: `Updated classroom ${existing.title}`,
        entityType: "Classroom",
        entityId: params.id,
        metadata: commonMetadata,
      });
    }
  }
  const updated = await Classroom.findById(params.id)
    .populate("coach instructor", "name email username")
    .populate("generatedSessions.substituteCoach", "name email username")
    .populate("generatedSessions.students", "name email username isActive")
    .populate("students", "name email username isActive")
    .populate("batches", "name")
    .populate("course", "name category level");
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || !(await canAccessFeature("classrooms", session.user as any, "cancel"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const existing = await Classroom.findById(params.id).select("coach instructor students isTestClassroom testOwner").lean();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessRecord(existing, session.user as any))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteClassroomRecords(params.id);
  await deleteClassroomSessionInstances(params.id);
  await Classroom.findByIdAndDelete(params.id);
  await recordActivity({
    actor: (session.user as any).id,
    type: "classroom.deleted",
    label: "Deleted classroom",
    entityType: "Classroom",
    entityId: params.id,
    metadata: { source: "manual_admin" },
  });
  return NextResponse.json({ ok: true });
}
