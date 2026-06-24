import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";
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
  if (target.status === "cancelled" || target.status === "completed") return;
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
  target.status = "completed";
  target.actualStartedAt = target.actualStartedAt || finish;
  target.actualEndedAt = finish;
  target.conductedBy = actorId || target.conductedBy;
  target.coachAttendanceStatus = "present";
  target.teachingMinutes = scheduledPaymentMinutes(target, classroom);
  target.actualTeachingMinutes = actualSessionMinutes(target);
  target.punctualityScore = punctualityBreakdown(target, classroom).punctualityScore;
  target.attendanceMarkedAt = new Date();
  target.summary = {
    ...(target.summary || {}),
    ...(summary || {}),
    scheduledTeachingMinutes: target.teachingMinutes,
    actualTeachingMinutes: target.actualTeachingMinutes,
    punctualityScore: target.punctualityScore,
  };
  const allDone = (classroom.generatedSessions || []).every((session: any) =>
    ["completed", "cancelled"].includes(String(session.status || "").toLowerCase())
  );
  classroom.status = allDone ? "completed" : "scheduled";
  await classroom.save();
}
