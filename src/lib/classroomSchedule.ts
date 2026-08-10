import { ACADEMY_TIME_ZONE, academyDateTime } from "@/lib/academyTime";

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
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
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

export function buildSessionPlan(topics: Array<{ name: string; order?: number }>) {
  return topics.map((topic, index) => ({
    sessionNumber: index + 1,
    topicName: topic.name,
    topicOrder: Number(topic.order ?? index),
  }));
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
  if (!input.startDate || !slots.length || !plan.length) return [];

  const start = calendarCursor(input.startDate);
  const end = input.endDate ? calendarCursor(input.endDate) : null;
  const maxSessions =
    input.endCondition === "after_n_sessions"
      ? Math.max(1, Number(input.endAfterSessions || 1))
      : input.endCondition === "course_complete"
        ? plan.length
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
          topicName: topic?.topicName || input.title,
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
    if (input.endCondition === "course_complete" && sessions.length >= plan.length) break;
  }

  return sessions;
}
