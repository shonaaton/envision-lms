import { academyDateKey, academyDateTime } from "@/lib/academyTime";

/**
 * Which classes a series-wide timing action ("Permanent Timing", "Just break")
 * may move.
 *
 * Both used to take every class still marked "scheduled", whatever its date. A
 * class whose register was never marked stays "scheduled" forever, so on a
 * series with unmarked history the whole past was lifted out of its dates and
 * re-laid after the new start date - the class history vanished from the
 * calendar and, because topics follow date order, the syllabus restarted from
 * its first topic. A past class is history, marked or not: only a class that
 * has not started yet can move.
 */
export function isMovableUpcomingSession(session: any, now: Date) {
  const status = String(session?.status || "scheduled").toLowerCase();
  if (!["scheduled", "rescheduled"].includes(status)) return false;
  if (session?.actualStartedAt || session?.actualEndedAt || session?.attendanceMarkedAt) return false;
  const startsAt = new Date(session?.scheduledFor || 0).getTime();
  return Number.isFinite(startsAt) && startsAt > now.getTime();
}

export function upcomingMovableSessions(sessions: any[], now: Date) {
  return (sessions || [])
    .filter((session: any) => isMovableUpcomingSession(session, now))
    .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
}

function dateKeyToUtc(key: string) {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export type TimingOccurrence = { dateKey: string; startTime: string; durationMinutes: number; scheduledFor: Date };

/**
 * The next `count` slots of a weekly pattern, from `effectiveKey` (an IST date
 * key) onward. A slot that has already started - today's earlier slot when the
 * change applies from today - is skipped rather than handed a class.
 */
export function buildWeeklyOccurrences(daysOfWeek: any[], effectiveKey: string, count: number, now: Date) {
  const startUtc = dateKeyToUtc(effectiveKey);
  if (startUtc === null || count <= 0) return [];
  const slots = (daysOfWeek || [])
    .flatMap((day: any) => (day.slots || []).map((slot: any) => ({ day: Number(day.day), ...slot })))
    .sort((a: any, b: any) => (a.day - b.day) || String(a.startTime).localeCompare(String(b.startTime)));
  if (!slots.length) return [];
  const occurrences: TimingOccurrence[] = [];
  const cursor = new Date(startUtc);
  let guard = 0;

  while (occurrences.length < count && guard < 3700) {
    const dateKey = academyDateKey(cursor);
    const weekDay = cursor.getUTCDay();
    for (const slot of slots) {
      if (occurrences.length >= count) break;
      if (slot.day !== weekDay) continue;
      const scheduledFor = academyDateTime(dateKey, slot.startTime);
      if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= now.getTime()) continue;
      occurrences.push({ dateKey, startTime: slot.startTime, durationMinutes: slot.durationMinutes, scheduledFor });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }

  return occurrences;
}

/**
 * A permanent timing change "applies from" a date: classes before it keep the
 * timing they were booked on, and only the upcoming classes on or after it are
 * re-laid on the new weekly pattern, in their original order. Past classes are
 * never touched (see isMovableUpcomingSession).
 */
export function planPermanentTimingChange(input: { sessions: any[]; daysOfWeek: any[]; effectiveKey: string; now: Date }) {
  const moving = upcomingMovableSessions(input.sessions, input.now)
    .filter((session: any) => academyDateKey(new Date(session.scheduledFor)) >= input.effectiveKey);
  const occurrences = buildWeeklyOccurrences(input.daysOfWeek, input.effectiveKey, moving.length, input.now);
  return { moving, occurrences };
}
