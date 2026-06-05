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

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part || 0));
  return { hours, minutes };
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
        scheduledFor: new Date(input.classDate),
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

  const start = startOfDay(new Date(input.startDate));
  const end = input.endDate ? startOfDay(new Date(input.endDate)) : null;
  const maxSessions =
    input.endCondition === "after_n_sessions"
      ? Math.max(1, Number(input.endAfterSessions || 1))
      : input.endCondition === "course_complete"
        ? plan.length
        : input.endCondition === "never"
          ? Math.max(plan.length, 52)
          : Math.max(plan.length, 1);

  const sessions: Array<{
    sessionNumber: number;
    topicName: string;
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
    const weekDay = cursor.getDay();
    const todaySlots = slots.filter((slot) => slot.day === weekDay);
    if (todaySlots.length) {
      for (const slot of todaySlots) {
        if (sessions.length >= maxSessions) break;
        if (end && cursor > end) break;
        const topic = plan[Math.min(topicIndex, plan.length - 1)];
        const sessionDate = new Date(cursor);
        const { hours, minutes } = parseClock(slot.startTime);
        sessionDate.setHours(hours, minutes, 0, 0);
        if (sessionDate < new Date(input.startDate)) continue;
        sessions.push({
          sessionNumber: sessions.length + 1,
          topicName: topic?.topicName || input.title,
          scheduledFor: new Date(sessionDate),
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes || input.durationMinutes,
          status: "scheduled",
          isExtra: false,
        });
        if (topicIndex < plan.length - 1) topicIndex += 1;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    if (input.endCondition === "course_complete" && sessions.length >= plan.length) break;
    if (input.endCondition === "on_date" && end && sameDay(cursor, new Date(end.getTime() + 86400000))) break;
  }

  return sessions;
}
