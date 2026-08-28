export type ScheduledSessionLike = {
  _id?: any;
  scheduledFor?: string | Date;
  classDate?: string | Date;
  startTime?: string;
  durationMinutes?: number;
  topicName?: string;
  status?: string;
  actualStartedAt?: string | Date | null;
  actualEndedAt?: string | Date | null;
};

export type ScheduledSessionStatus =
  | "upcoming"
  | "join_available"
  | "ongoing"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "missed"
  | "abandoned"
  | "coach_no_show"
  | "student_no_show"
  | "technical_issue";

export function getSessionStart(session: ScheduledSessionLike) {
  const base = session.scheduledFor || session.classDate;
  if (!base) return null;
  const date = session.startTime ? academyDateTime(base, String(session.startTime)) : new Date(base);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function getSessionEnd(session: ScheduledSessionLike) {
  const start = getSessionStart(session);
  if (!start) return null;
  return new Date(start.getTime() + Math.max(15, Number(session.durationMinutes || 60)) * 60000);
}

export function isJoinWindowOpen(session: ScheduledSessionLike, now = new Date(), earlyMinutes = 5, graceMinutes = 120) {
  const start = getSessionStart(session);
  const end = getSessionEnd(session);
  if (!start || !end) return false;
  const opensAt = new Date(start.getTime() - earlyMinutes * 60000);
  const closesAt = new Date(end.getTime() + graceMinutes * 60000);
  return now >= opensAt && now <= closesAt;
}

export function deriveScheduledSessionStatus(
  session: ScheduledSessionLike,
  now = new Date(),
  options?: { attendanceStatus?: string | null }
): ScheduledSessionStatus {
  const raw = String(session?.status || "scheduled").toLowerCase();
  const attendanceStatus = String(options?.attendanceStatus || "").toLowerCase();
  if (raw === "cancelled") return "cancelled";
  if (raw === "rescheduled") return "rescheduled";
  if (raw === "abandoned") return "abandoned";
  if (raw === "coach_no_show") return "coach_no_show";
  if (raw === "student_no_show") return "student_no_show";
  if (raw === "technical_issue") return "technical_issue";
  if (raw === "missed") return "missed";
  if (session?.actualEndedAt) return attendanceStatus === "absent" ? "missed" : "completed";
  if (session?.actualStartedAt && !session?.actualEndedAt) return "ongoing";
  if (raw === "completed") return attendanceStatus === "absent" ? "missed" : "completed";
  if (raw === "ongoing" || raw === "live") return "ongoing";
  if (attendanceStatus === "absent") return "missed";
  if (attendanceStatus === "present" || attendanceStatus === "late") return "completed";

  const start = getSessionStart(session);
  const end = getSessionEnd(session);
  if (!start || !end) return "upcoming";

  const opensAt = new Date(start.getTime() - 5 * 60000);
  if (now >= opensAt && now < start) return "join_available";
  if (now < opensAt) return "upcoming";
  if (now >= start && now <= end) return "ongoing";
  return "missed";
}

export function isSessionUpcomingLike(status: ScheduledSessionStatus) {
  return ["upcoming", "join_available", "ongoing"].includes(status);
}

export function flattenScheduledSessions(classrooms: any[]) {
  return classrooms.flatMap((classroom: any) => {
    const sessions = Array.isArray(classroom?.generatedSessions) && classroom.generatedSessions.length
      ? classroom.generatedSessions
      : classroom?.classDate
        ? [{
            _id: `${classroom._id}-single`,
            sessionNumber: 1,
            topicName: classroom.topicName || classroom.title,
            scheduledFor: classroom.classDate,
            startTime: classroom.startTime,
            durationMinutes: classroom.durationMinutes || 60,
            status: classroom.status || "scheduled",
          }]
        : [];

    return sessions.map((session: any) => ({
      classroom,
      session,
      start: getSessionStart(session),
      end: getSessionEnd(session),
      derivedStatus: deriveScheduledSessionStatus(session),
    }));
  });
}

export function formatJoinWindowLabel(session: ScheduledSessionLike, now = new Date()) {
  const start = getSessionStart(session);
  if (!start) return "Schedule pending";
  const status = deriveScheduledSessionStatus(session, now);
  if (status === "join_available") return "Join available";
  if (status === "ongoing") return "Ongoing";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "rescheduled") return "Rescheduled";
  if (status === "missed") return "Missed";
  if (status === "abandoned") return "Not completed";
  if (status === "coach_no_show") return "Coach no-show";
  if (status === "student_no_show") return "Student no-show";
  if (status === "technical_issue") return "Technical issue";
  if (now < start) return `Opens ${formatAcademyDateTime(start, { year: undefined })}`;
  return "Session closed";
}
import { academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
