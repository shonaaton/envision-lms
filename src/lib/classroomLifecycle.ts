import { Types } from "mongoose";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { getSessionEnd } from "@/lib/classroomSessions";

export const MIN_COMPLETED_TEACHING_MINUTES = 30;
export const COACH_NO_SHOW_GRACE_MINUTES = 20;
export const MONTHLY_NO_SHOW_FLAG_THRESHOLD = 3;
export const STUDENT_NO_SHOW_FREE_ALLOWANCE_PER_MONTH = 1;
export const CONTINUE_TOPIC_OUTCOME = "completed_continue_topic";

export const NON_TOPIC_CONSUMING_STATUSES = new Set([
  "scheduled",
  "ongoing",
  "in_progress",
  "rescheduled",
  "cancelled",
  "missed",
  "abandoned",
  "coach_no_show",
  "student_no_show",
  "technical_issue",
]);

export function normalizeSessionOutcome(value: unknown, actualTeachingMinutes = 0, adminOverride = false) {
  const requested = String(value || "").toLowerCase();
  const allowed = new Set([
    "completed",
    CONTINUE_TOPIC_OUTCOME,
    "cancelled",
    "missed",
    "abandoned",
    "coach_no_show",
    "student_no_show",
    "technical_issue",
    "rescheduled",
  ]);
  if (requested === "completed" || requested === CONTINUE_TOPIC_OUTCOME) {
    return actualTeachingMinutes >= MIN_COMPLETED_TEACHING_MINUTES || adminOverride ? "completed" : "abandoned";
  }
  if (allowed.has(requested)) return requested;
  return actualTeachingMinutes >= MIN_COMPLETED_TEACHING_MINUTES ? "completed" : "abandoned";
}

export function sessionConsumesTopic(session: any) {
  return String(session?.status || "").toLowerCase() === "completed" && session?.summary?.topicCompleted !== false;
}

export function shouldContinueTopic(value: unknown) {
  return String(value || "").toLowerCase() === CONTINUE_TOPIC_OUTCOME;
}

export function topicCompletedForOutcome(status: string, requestedOutcome: unknown) {
  return status === "completed" && !shouldContinueTopic(requestedOutcome);
}

export function isFutureTopicAssignable(session: any) {
  const status = String(session?.status || "scheduled").toLowerCase();
  return !session?.actualEndedAt && !["completed", "cancelled", "missed", "abandoned", "coach_no_show", "student_no_show", "technical_issue"].includes(status);
}

export function coachNoShowDeadline(session: any) {
  const end = getSessionEnd(session);
  if (!end) return null;
  return new Date(end.getTime() + COACH_NO_SHOW_GRACE_MINUTES * 60000);
}

export function isCoachNoShowExpired(session: any, now = new Date()) {
  const deadline = coachNoShowDeadline(session);
  return Boolean(deadline && now > deadline);
}

function monthRange(date = new Date()) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}

async function notifyAdminsAndSubAdmins(title: string, message: string, metadata: Record<string, unknown>) {
  const users = await User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } }).select("_id").lean();
  if (!users.length) return;
  await Notification.insertMany(
    users.map((user: any) => ({
      user: user._id,
      type: String(metadata.type || "classroom_lifecycle"),
      title,
      message,
      metadata,
    })),
    { ordered: false }
  ).catch(() => undefined);
}

export async function notifyCoachNoShowIfThreshold(coachId: string, context: Record<string, unknown> = {}) {
  if (!coachId) return 0;
  const { start, end } = monthRange();
  const count = await Attendance.countDocuments({
    coach: coachId,
    coachStatus: "coach_no_show",
    sessionDate: { $gte: start, $lt: end },
  });
  if (count >= MONTHLY_NO_SHOW_FLAG_THRESHOLD) {
    await notifyAdminsAndSubAdmins(
      "Coach no-show threshold reached",
      `A coach has ${count} coach no-shows this month. Please review the class records.`,
      { type: "coach_no_show_threshold", coach: coachId, count, ...context }
    );
  }
  return count;
}

export async function studentNoShowCountThisMonth(studentId: string, date = new Date()) {
  const { start, end } = monthRange(date);
  return Attendance.countDocuments({
    sessionDate: { $gte: start, $lt: end },
    records: { $elemMatch: { student: new Types.ObjectId(studentId), status: "student_no_show" } },
  });
}

export async function notifyStudentNoShowCreditDeduction(studentId: string, count: number, context: Record<string, unknown> = {}) {
  await notifyAdminsAndSubAdmins(
    "Repeated student no-show charged",
    `A student reached ${count} no-shows this month, so the no-show credit rule was applied.`,
    { type: "student_no_show_credit_deducted", student: studentId, count, ...context }
  );
}

export async function recalculateFutureSessionTopics(classroomOrId: any, actorId?: string) {
  const classroom: any = typeof classroomOrId === "string" ? await Classroom.findById(classroomOrId) : classroomOrId;
  if (!classroom || !Array.isArray(classroom.generatedSessions) || !classroom.generatedSessions.length) return classroom;
  const plan = (classroom.sessionPlan || [])
    .map((topic: any, index: number) => ({
      topicName: String(topic.topicName || "").trim(),
      topicOrder: Number(topic.topicOrder ?? index),
    }))
    .filter((topic: any) => topic.topicName)
    .sort((a: any, b: any) => a.topicOrder - b.topicOrder);
  if (!plan.length) return classroom;

  const consumed = new Set<string>();
  (classroom.generatedSessions || []).forEach((session: any) => {
    if (sessionConsumesTopic(session)) consumed.add(String(session.topicName || "").trim().toLowerCase());
    if (session?.topicLocked && isFutureTopicAssignable(session)) consumed.add(String(session.topicName || "").trim().toLowerCase());
  });
  const pending = plan.filter((topic: any) => !consumed.has(topic.topicName.toLowerCase()));
  let pendingIndex = 0;
  const futureSessions = (classroom.generatedSessions || [])
    .filter((session: any) => isFutureTopicAssignable(session) && (!session.isExtra || session.summary?.createdForTopicContinuation) && !session.topicLocked)
    .sort((a: any, b: any) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime());

  const changes: Array<{ sessionId: string; from: string; to: string }> = [];
  futureSessions.forEach((session: any) => {
    const nextTopic = pending[pendingIndex];
    if (!nextTopic) return;
    pendingIndex += 1;
    const from = String(session.topicName || "");
    if (from !== nextTopic.topicName || Number(session.topicOrder || 0) !== nextTopic.topicOrder) {
      session.topicName = nextTopic.topicName;
      session.topicOrder = nextTopic.topicOrder;
      changes.push({ sessionId: String(session._id), from, to: nextTopic.topicName });
    }
  });

  if (changes.length) {
    await recordActivity({
      actor: actorId,
      type: "classroom.topics.recalculated",
      label: `Recalculated ${changes.length} future class topic${changes.length === 1 ? "" : "s"}`,
      entityType: "Classroom",
      entityId: String(classroom._id),
      metadata: { classroom: String(classroom._id), changes },
    });
  }
  return classroom;
}

function nextSessionDate(classroom: any) {
  const sessions = [...(classroom.generatedSessions || [])]
    .filter((session: any) => session?.scheduledFor)
    .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  const last = sessions.at(-1);
  if (!last) return null;
  const previous = sessions.length > 1 ? sessions.at(-2) : null;
  const fallbackMs = 7 * 24 * 60 * 60 * 1000;
  const gapMs = previous
    ? Math.max(24 * 60 * 60 * 1000, new Date(last.scheduledFor).getTime() - new Date(previous.scheduledFor).getTime())
    : fallbackMs;
  return new Date(new Date(last.scheduledFor).getTime() + gapMs);
}

export async function ensureTopicContinuationSession(classroom: any, sourceSession: any, actorId?: string) {
  if (!classroom || !sourceSession || !Array.isArray(classroom.generatedSessions)) return;
  const sourceSessionId = String(sourceSession._id || "");
  if (!sourceSessionId) return;
  const exists = classroom.generatedSessions.some((session: any) => String(session?.summary?.continuesFromSessionId || "") === sourceSessionId);
  if (exists) return;
  const scheduledFor = nextSessionDate(classroom);
  if (!scheduledFor) return;
  const sessions = classroom.generatedSessions || [];
  const last = [...sessions].sort((a: any, b: any) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime()).at(-1);
  const sessionNumber = Math.max(0, ...sessions.map((session: any) => Number(session.sessionNumber || 0))) + 1;
  classroom.generatedSessions.push({
    sessionNumber,
    topicName: String(last?.topicName || sourceSession.topicName || classroom.topicName || classroom.title || "Continuation"),
    topicOrder: Number(last?.topicOrder ?? sourceSession.topicOrder ?? 0),
    scheduledFor,
    startTime: String(last?.startTime || sourceSession.startTime || classroom.startTime || "16:00"),
    durationMinutes: Math.max(15, Number(last?.durationMinutes || sourceSession.durationMinutes || classroom.durationMinutes || 60)),
    status: "scheduled",
    isExtra: true,
    notes: `Created because ${sourceSession.topicName || "the topic"} needs one more class.`,
    summary: {
      createdForTopicContinuation: true,
      continuesFromSessionId: sourceSessionId,
      continuedTopicName: sourceSession.topicName || "",
    },
  });
  await recordActivity({
    actor: actorId,
    type: "classroom.topic_continuation.extra_session_created",
    label: "Created extra class for topic continuation",
    entityType: "Classroom",
    entityId: String(classroom._id),
    metadata: { classroom: String(classroom._id), sourceSessionId, topicName: sourceSession.topicName || "", newSessionNumber: sessionNumber },
  });
}
