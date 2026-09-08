import { ACADEMY_TIME_ZONE, academyDateTime, academyTimeOfDay } from "@/lib/academyTime";

type TopicPlan = { topicName: string; topicOrder: number };
type TimeSlot = { startTime: string; durationMinutes: number };
type DaySlot = { day: number; slots: TimeSlot[] };

type ClassroomBuildInput = {
  classroomType: "single" | "series";
  title: string;
  topicName: string;
  topicOrder?: number;
  classDate?: string | Date;
  startTime?: string;
  durationMinutes: number;
  startDate?: string | Date;
  endDate?: string | Date;
  frequency: "weekly" | "custom";
  daysOfWeek: DaySlot[];
  endCondition: "on_date" | "after_n_sessions" | "course_complete" | "never";
  endAfterSessions?: number;
  sessionPlan?: TopicPlan[];
};

function calendarParts(value: string | Date) {
  if (typeof value === "string") {
    // Anchored at both ends: only a bare "YYYY-MM-DD" (already timezone-less)
    // takes the fast path. A full ISO timestamp (e.g. "2026-09-04T19:35:00Z")
    // must fall through to the Intl.DateTimeFormat conversion below, or its
    // UTC calendar day would be used instead of the academy's Asia/Kolkata day.
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ACADEMY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function calendarCursor(value: string | Date) {
  const { year, month, day } = calendarParts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

function calendarDateString(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export const CLASS_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The "HH:mm" a class actually runs at. A slot built from a classroom's weekly
 * pattern can carry a blank time, and generatedSessions.startTime is required -
 * so fall back to the clock time already baked into scheduledFor rather than
 * handing back an empty string the Classroom schema rejects.
 */
export function resolveClassStartTime(session: any, classroom?: any) {
  for (const candidate of [session?.startTime, classroom?.startTime]) {
    const value = String(candidate || "").trim();
    if (CLASS_TIME_PATTERN.test(value)) return value;
  }
  const scheduledFor = session?.scheduledFor || classroom?.classDate;
  if (!scheduledFor || Number.isNaN(new Date(scheduledFor).getTime())) return "";
  const derived = academyTimeOfDay(new Date(scheduledFor));
  return CLASS_TIME_PATTERN.test(derived) ? derived : "";
}

export function buildSessionPlan(topics: Array<{ name: string; order?: number }>) {
  return topics.map((topic, index) => ({
    sessionNumber: index + 1,
    topicName: topic.name,
    topicOrder: Number(topic.order ?? index),
  }));
}

/**
 * The next `count` slots the weekly schedule lands on from `fromDate` onwards.
 *
 * Used when a pause ends: the classes that were waiting are put back on the
 * calendar on the days the classroom actually runs, starting from the restart
 * day, rather than being left on the dates that passed during the pause.
 */
export function scheduleDatesFrom(daysOfWeek: DaySlot[], fromDate: string | Date, count: number, fallbackDurationMinutes = 60) {
  const slots = (daysOfWeek || [])
    .flatMap((daySlot) => (daySlot.slots || []).map((slot) => ({ day: daySlot.day, ...slot })))
    .sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));
  if (!slots.length || count <= 0) return [];

  const dates: Array<{ scheduledFor: Date; startTime: string; durationMinutes: number }> = [];
  const cursor = calendarCursor(fromDate);
  // One slot a week at worst, so a year of days covers any sane series and stops
  // a malformed schedule from spinning forever.
  for (let day = 0; day < 366 && dates.length < count; day += 1) {
    for (const slot of slots.filter((item) => item.day === cursor.getUTCDay())) {
      if (dates.length >= count) break;
      dates.push({
        scheduledFor: new Date(academyDateTime(calendarDateString(cursor), slot.startTime)),
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes || fallbackDurationMinutes,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function buildGeneratedSessions(input: ClassroomBuildInput) {
  if (input.classroomType === "single") {
    if (!input.classDate || !input.startTime) return [];
    return [
      {
        sessionNumber: 1,
        topicName: input.topicName || input.title,
        topicOrder: Number(input.topicOrder || 0),
        scheduledFor: academyDateTime(input.classDate, input.startTime),
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        status: "scheduled",
        isExtra: false,
      },
    ];
  }

  const plan = input.sessionPlan || [];
  const slots = (input.daysOfWeek || [])
    .flatMap((daySlot) => (daySlot.slots || []).map((slot) => ({ day: daySlot.day, ...slot })))
    .sort((a, b) => (a.day - b.day) || a.startTime.localeCompare(b.startTime));
  if (!input.startDate || !slots.length) return [];

  const start = calendarCursor(input.startDate);
  const end = input.endDate ? calendarCursor(input.endDate) : null;
  const maxSessions =
    input.endCondition === "after_n_sessions"
      ? Math.max(1, Number(input.endAfterSessions || 1))
      : input.endCondition === "course_complete"
        ? plan.length || Math.max(1, Number(input.endAfterSessions || 1))
        : input.endCondition === "never"
          ? 52
          : 1000;

  const sessions: Array<{
    sessionNumber: number;
    topicName: string;
    topicOrder: number;
    scheduledFor: Date;
    startTime: string;
    durationMinutes: number;
    status: "scheduled";
    isExtra: false;
  }> = [];

  let cursor = new Date(start);
  let topicIndex = 0;

  while (sessions.length < maxSessions) {
    if (end && cursor > end) break;
    const weekDay = cursor.getUTCDay();
    const todaySlots = slots.filter((slot) => slot.day === weekDay);
    if (todaySlots.length) {
      for (const slot of todaySlots) {
        if (sessions.length >= maxSessions) break;
        if (end && cursor > end) break;
        const topic = plan[Math.min(topicIndex, plan.length - 1)];
        const sessionDate = academyDateTime(calendarDateString(cursor), slot.startTime);
        sessions.push({
          sessionNumber: sessions.length + 1,
          topicName: topic?.topicName || input.topicName || input.title,
          topicOrder: Number(topic?.topicOrder ?? topicIndex),
          scheduledFor: new Date(sessionDate),
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes || input.durationMinutes,
          status: "scheduled",
          isExtra: false,
        });
        if (topicIndex < plan.length - 1) topicIndex += 1;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (input.endCondition === "course_complete" && plan.length > 0 && sessions.length >= plan.length) break;
  }

  return sessions;
}
