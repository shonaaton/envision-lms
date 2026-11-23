import { getSessionEnd, getSessionStart, JOIN_OPENS_MINUTES_BEFORE, type ScheduledSessionLike } from "@/lib/classroomSessions";

/**
 * No pop-up while someone's own class is on: from when the room opens (15
 * minutes before the start) to the scheduled end, and for as long as a class
 * that was actually started has not been ended. A class left "ongoing" by
 * mistake stops counting four hours after it was started, so a stuck record
 * never silences pop-ups for good. Pure; the loading lives in popupService.ts.
 */
const STARTED_CLASS_LIMIT_MS = 4 * 60 * 60_000;
const NOT_RUNNING = new Set(["cancelled", "rescheduled", "completed", "missed", "abandoned", "absent", "coach_no_show", "student_no_show", "technical_issue"]);

export function sessionHoldsPopups(session: ScheduledSessionLike, now: Date) {
  if (session.actualEndedAt) return false;
  if (session.actualStartedAt) {
    const startedAt = new Date(session.actualStartedAt).getTime();
    if (startedAt <= now.getTime() && now.getTime() - startedAt <= STARTED_CLASS_LIMIT_MS) return true;
  }
  if (NOT_RUNNING.has(String(session.status || "").toLowerCase())) return false;
  const start = getSessionStart(session);
  const end = getSessionEnd(session);
  if (!start || !end) return false;
  return now.getTime() >= start.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000 && now <= end;
}
