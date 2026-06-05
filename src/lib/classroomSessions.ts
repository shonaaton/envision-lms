export type ScheduledSessionLike = {
  _id?: any;
  scheduledFor?: string | Date;
  classDate?: string | Date;
  startTime?: string;
  durationMinutes?: number;
  topicName?: string;
  status?: string;
};

export function getSessionStart(session: ScheduledSessionLike) {
  const base = session.scheduledFor || session.classDate;
  if (!base) return null;
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return null;
  if (session.startTime) {
    const [hours, minutes] = String(session.startTime).split(":").map((part) => Number(part || 0));
    date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

export function getSessionEnd(session: ScheduledSessionLike) {
  const start = getSessionStart(session);
  if (!start) return null;
  return new Date(start.getTime() + Math.max(15, Number(session.durationMinutes || 60)) * 60000);
}

export function isJoinWindowOpen(session: ScheduledSessionLike, now = new Date(), earlyMinutes = 15, graceMinutes = 120) {
  const start = getSessionStart(session);
  const end = getSessionEnd(session);
  if (!start || !end) return false;
  const opensAt = new Date(start.getTime() - earlyMinutes * 60000);
  const closesAt = new Date(end.getTime() + graceMinutes * 60000);
  return now >= opensAt && now <= closesAt;
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
    }));
  });
}

export function formatJoinWindowLabel(session: ScheduledSessionLike, now = new Date()) {
  const start = getSessionStart(session);
  if (!start) return "Schedule pending";
  if (isJoinWindowOpen(session, now)) return "Join now";
  if (now < start) return `Opens ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(start)}`;
  return "Session closed";
}
