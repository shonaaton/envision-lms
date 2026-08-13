import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";
import { autoAssignHomeworkForSession } from "@/lib/assignmentAutomation";
import { ensureTopicContinuationSession, normalizeSessionOutcome, recalculateFutureSessionTopics, shouldContinueTopic, topicCompletedForOutcome } from "@/lib/classroomLifecycle";
import { actualSessionMinutes, punctualityBreakdown, scheduledPaymentMinutes } from "@/lib/teachingStats";

export function getRequestedSessionId(req: Request) {
  const url = new URL(req.url);
  return String(url.searchParams.get("sessionId") || url.searchParams.get("session") || "").trim();
}

export function resolveScheduledSession(classroom: any, requestedSessionId?: string | null) {
  const singleSession =
    classroom?.classDate
      ? {
          _id: `${classroom._id}-single`,
          sessionNumber: 1,
          topicName: classroom.topicName || classroom.title,
          scheduledFor: classroom.classDate,
          startTime: classroom.startTime,
          durationMinutes: classroom.durationMinutes || 60,
          status: classroom.status || "scheduled",
        }
      : null;

  if (requestedSessionId) {
    return (classroom?.generatedSessions || []).find((item: any) => String(item._id) === requestedSessionId) ||
      (singleSession && String(singleSession._id) === requestedSessionId ? singleSession : null);
  }

  if (Array.isArray(classroom?.generatedSessions) && classroom.generatedSessions.length) {
    return classroom.generatedSessions[0];
  }

  if (singleSession) return singleSession;

  return null;
}

export function buildLiveSessionKey(classroomId: string, scheduledSessionId: string) {
  return `${classroomId}:${scheduledSessionId}`;
}

export async function ensureLiveSessionIndexes() {
  return Promise.resolve();
}

export async function markScheduledSessionStarted({
  classroomId,
  scheduledSessionId,
  actorId,
}: {
  classroomId: string;
  scheduledSessionId: string;
  actorId?: string;
}) {
  const classroom: any = await Classroom.findById(classroomId);
  if (!classroom) return;
  const target = classroom.generatedSessions?.id?.(scheduledSessionId);
  if (!target) return;
  if (["cancelled", "completed", "coach_no_show", "student_no_show"].includes(String(target.status || ""))) return;
  target.status = "ongoing";
  target.actualStartedAt = target.actualStartedAt || new Date();
  target.conductedBy = actorId || target.conductedBy;
  target.coachAttendanceStatus = "present";
  classroom.status = "ongoing";
  await classroom.save();
}

export async function markScheduledSessionFinished({
  classroomId,
  scheduledSessionId,
  actorId,
  endedAt,
  summary,
}: {
  classroomId: string;
  scheduledSessionId: string;
  actorId?: string;
  endedAt?: Date;
  summary?: Record<string, unknown>;
}) {
  const classroom: any = await Classroom.findById(classroomId);
  if (!classroom) return;
  const target = classroom.generatedSessions?.id?.(scheduledSessionId);
  if (!target) return;
  const finish = endedAt || new Date();
  target.actualStartedAt = target.actualStartedAt || finish;
  target.actualEndedAt = finish;
  target.conductedBy = actorId || target.conductedBy;
  target.teachingMinutes = scheduledPaymentMinutes(target, classroom);
  target.actualTeachingMinutes = actualSessionMinutes(target);
  const requestedOutcome = (summary as any)?.classOutcome;
  const adminOverride = Boolean((summary as any)?.adminOverrideCompletion);
  const outcome = normalizeSessionOutcome(requestedOutcome, target.actualTeachingMinutes, adminOverride);
  const topicCompleted = topicCompletedForOutcome(outcome, requestedOutcome);
  const storedOutcome = shouldContinueTopic(requestedOutcome) && outcome === "completed" ? "completed_continue_topic" : outcome;
  target.status = outcome;
  target.coachAttendanceStatus = outcome === "coach_no_show" ? "coach_no_show" : outcome === "technical_issue" ? "technical_issue" : "present";
  target.punctualityScore = punctualityBreakdown(target, classroom).punctualityScore;
  target.attendanceMarkedAt = new Date();
  target.summary = {
    ...(target.summary || {}),
    ...(summary || {}),
    classOutcome: storedOutcome,
    topicCompleted,
    creditPolicy: outcome === "completed" ? "charge_present_students" : outcome === "student_no_show" ? "repeat_no_show_policy" : "no_charge",
    scheduledTeachingMinutes: target.teachingMinutes,
    actualTeachingMinutes: target.actualTeachingMinutes,
    punctualityScore: target.punctualityScore,
  };
  if (shouldContinueTopic(requestedOutcome) && outcome === "completed") {
    await ensureTopicContinuationSession(classroom, target, actorId);
  }
  const allDone = (classroom.generatedSessions || []).every((session: any) =>
    ["completed", "cancelled", "missed", "abandoned", "coach_no_show", "student_no_show", "technical_issue"].includes(String(session.status || "").toLowerCase())
  );
  classroom.status = allDone ? "completed" : "scheduled";
  await recalculateFutureSessionTopics(classroom, actorId);
  await classroom.save();
  if (outcome === "completed") {
    try {
      await autoAssignHomeworkForSession({ classroomId, scheduledSessionId, actorId, endedAt: finish });
    } catch (error) {
      console.error("Homework auto-assignment failed", error);
    }
  }
}
