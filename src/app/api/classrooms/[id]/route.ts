import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Attendance } from "@/models/Attendance";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import { buildGeneratedSessions } from "@/lib/classroomSchedule";
import { deleteClassroomSessionInstances, syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { academyDateKey, academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
import { coachCanAccessClassroomSession, isPrimaryClassroomCoach, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { ensureTopicContinuationSession, recalculateFutureSessionTopics, shouldContinueTopic, topicCompletedForOutcome } from "@/lib/classroomLifecycle";
import { recordActivity } from "@/lib/activity";
import { User } from "@/models/User";
import { Notification } from "@/models/Fee";
import { Homework, Submission } from "@/models/Homework";
import { AssignmentAutomationLog } from "@/models/AssignmentTemplate";
import { PGN } from "@/models/PGN";
import { Booking } from "@/models/Booking";
import { DemoBooking } from "@/models/Onboarding";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";
import { sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";

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
  if (action === "shift_future_sessions") return "class_schedule_updated";
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
  if (input.action === "shift_future_sessions") return [name, classTitle, nextTime || "the next scheduled class"];
  if (input.action === "permanent_schedule_change") return [name, classTitle, nextTime || String(input.classroom?.startTime || "the new class time"), input.restartDate ? scheduleTimeLabel(input.restartDate) || input.restartDate : "now"];
  return [name, classTitle, previousTime || "the previous class time", nextTime || "the new class time"];
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
  const coachIds = [
    currentSession?.substituteCoach,
    previousSession?.substituteCoach,
    classroom?.coach,
    classroom?.instructor,
  ].map(recordId).filter(Boolean);
  const studentIds = (classroom?.students || []).map(recordId).filter(Boolean);
  const recipientIds = Array.from(new Set([...coachIds.slice(0, 1), ...studentIds]));
  if (!recipientIds.length) return;

  const recipients = await User.find({ _id: { $in: recipientIds }, isActive: { $ne: false } }).select("_id name email phone username role").lean();
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
    .populate("students", "name email username isActive")
    .populate("batches", "name")
    .populate("course", "name category level")
    .lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scheduledSessionId = new URL(req.url).searchParams.get("session") || undefined;
  if (!(await canAccessRecord(doc, session.user as any, true, scheduledSessionId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json((session.user as any).role === "instructor" ? limitClassroomToCoachSessions(doc, String((session.user as any).id || "")) : doc);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
  await dbConnect();
  const existing: any = await Classroom.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessRecord(existing, session.user as any))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reassignedSessionIds: string[] = [];
  const previousClassroomStatus = String(existing.status || "");
  const previousClassDate = existing.classDate;
  const previousStartTime = existing.startTime;
  const previousDurationMinutes = existing.durationMinutes;
  let shiftedSessionCount = 0;
  let shiftedRestartDate = "";
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
  } else if (["update_session", "reschedule_session", "cancel_session", "delete_session", "mark_session_outcome", "change_session_topic"].includes(body.action)) {
    const sessionId = String(body.sessionId || "");
    const target = existing.generatedSessions?.id?.(sessionId) || (existing.generatedSessions || []).find((session: any) => String(session._id) === sessionId);
    if (!target) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
    const finished = target.status === "completed" || target.status === "ongoing" || Boolean(target.actualStartedAt || target.actualEndedAt);
    if (finished && !["mark_session_outcome", "change_session_topic"].includes(body.action)) return NextResponse.json({ error: "A started or completed class can no longer be changed or deleted" }, { status: 409 });
    if (target.status === "cancelled" && body.action !== "delete_session") return NextResponse.json({ error: "A cancelled class can only be deleted" }, { status: 409 });

    if (body.action === "mark_session_outcome") {
      const outcome = String(body.classOutcome || "").trim();
      if (!["completed", "completed_continue_topic", "cancelled", "missed", "abandoned", "coach_no_show", "student_no_show", "technical_issue"].includes(outcome)) {
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
    else if (remainingStatuses.length && remainingStatuses.every((status: string) => ["completed", "cancelled", "missed", "abandoned", "coach_no_show", "student_no_show", "technical_issue"].includes(status))) existing.status = "completed";
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
  const activityAction = String(body.action || "update_classroom");
  const sessionId = String(body.sessionId || "");
  const currentSession = sessionId
    ? existing.generatedSessions?.id?.(sessionId) || (existing.generatedSessions || []).find((item: any) => String(item._id) === sessionId)
    : Array.isArray(existing.generatedSessions) && existing.generatedSessions.length === 1
      ? existing.generatedSessions[0]
      : null;
  const shouldNotifyScheduleChange = (
    ["cancel_class", "cancel_series", "cancel_session", "reschedule_class", "reschedule_session", "shift_future_sessions", "permanent_schedule_change"].includes(activityAction) ||
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
  if (!["mark_session_outcome", "shift_future_sessions", "permanent_schedule_change"].includes(activityAction)) {
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
