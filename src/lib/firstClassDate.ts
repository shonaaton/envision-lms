import { academyDayBounds, formatAcademyDateTime } from "@/lib/academyTime";

/**
 * When the coach's first class actually starts.
 *
 * `Classroom.startDate` and `Classroom.classDate` come from a date input, so
 * they are stored as midnight UTC - a date with no time of day. Formatting one
 * with an hour prints "5:30 am IST", and because midnight UTC also sorts before
 * every real session on the same day, a plain start date won any "earliest
 * timestamp" comparison it was thrown into. That is how a Sunday 18:30 batch
 * was announced to its coach as "First Class Date: 13 Sept 2026, 5:30 am IST"
 * directly under a schedule line reading 18:30.
 *
 * So the two kinds of candidate are never sorted together: a generated session
 * carries a real instant and always wins, and the plain dates are a fallback
 * rendered as a date, with the scheduled start time appended when the classroom
 * knows one.
 */

function toDate(value: unknown) {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

function earliest(values: unknown[]) {
  return values
    .map(toDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;
}

/** "HH:mm" the classroom is scheduled at, from its own field or its first weekly slot. */
function scheduledStartTime(classroom: any) {
  const slotTime = (classroom?.daysOfWeek || [])
    .flatMap((day: any) => day?.slots || [])
    .map((slot: any) => String(slot?.startTime || "").trim())
    .find(Boolean);
  return String(classroom?.startTime || "").trim() || slotTime || "";
}

/**
 * A classroom's own date rendered with the time it is scheduled at.
 *
 * Use wherever `classDate` or `startDate` reaches a message: printing either
 * through a date-and-time formatter is what produces the phantom "5:30 am IST".
 */
export function scheduledDateLabel(classroom: any, value: unknown, options: Intl.DateTimeFormatOptions = {}) {
  const date = toDate(value);
  if (!date) return "Not set";
  const dateLabel = formatAcademyDateTime(date, { ...options, hour: undefined, minute: undefined });
  const startTime = scheduledStartTime(classroom);
  return startTime ? `${dateLabel} at ${startTime}` : dateLabel;
}

/** The earliest real, time-carrying session across these classrooms. */
export function firstScheduledSessionStart(classrooms: any[]) {
  return earliest(
    classrooms.flatMap((classroom) => (classroom?.generatedSessions || []).map((session: any) => session?.scheduledFor))
  );
}

/**
 * The "First Class Date" line for a coach notification. Pass `session` when the
 * message is about one specific class, such as an extra class added to a series.
 */
export function firstClassDateLabel(classrooms: any[], session?: any) {
  const sessionStart = toDate(session?.scheduledFor) || firstScheduledSessionStart(classrooms);
  if (sessionStart) return formatAcademyDateTime(sessionStart, { timeZoneName: "short" });

  const dated = classrooms
    .map((classroom) => ({ classroom, date: earliest([classroom?.classDate, classroom?.startDate]) }))
    .filter((entry): entry is { classroom: any; date: Date } => Boolean(entry.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  if (!dated) return "Not set";

  return scheduledDateLabel(dated.classroom, dated.date);
}

/** The earliest session on or after `from`, across these classrooms. */
export function nextScheduledSessionStart(classrooms: any[], from: Date = new Date()) {
  return earliest(
    classrooms
      .flatMap((classroom) => (classroom?.generatedSessions || []).map((session: any) => session?.scheduledFor))
      .filter((value) => {
        const date = toDate(value);
        return Boolean(date && date.getTime() >= from.getTime());
      })
  );
}

/**
 * The "Next Class Date" line for a student notification.
 *
 * Unlike `firstClassDateLabel`, which announces where a series begins, this
 * answers "when do I next turn up" - so a batch that has been running for
 * months names its next session rather than its first one, and only sessions
 * still ahead of `from` count.
 *
 * The fallback compares the classroom's own `classDate`/`startDate` against the
 * start of the academy day, not against the instant: those fields are stored as
 * midnight UTC, which is 5:30 am IST, so a class starting later today would
 * otherwise be read as already past.
 */
export function nextClassDateLabel(classrooms: any[], from: Date = new Date()) {
  const sessionStart = nextScheduledSessionStart(classrooms, from);
  if (sessionStart) return formatAcademyDateTime(sessionStart, { timeZoneName: "short" });

  const dayStart = academyDayBounds(from).start.getTime();
  const dated = classrooms
    .map((classroom) => ({ classroom, date: earliest([classroom?.classDate, classroom?.startDate]) }))
    .filter((entry): entry is { classroom: any; date: Date } => Boolean(entry.date))
    .filter((entry) => entry.date.getTime() >= dayStart)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  if (!dated) return "As per the batch timings";

  return scheduledDateLabel(dated.classroom, dated.date);
}
