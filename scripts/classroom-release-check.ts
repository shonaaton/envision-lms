import { academyDayBounds } from "../src/lib/academyTime";
import { buildGeneratedSessions } from "../src/lib/classroomSchedule";
import { coachCanAccessClassroomSession, limitClassroomToCoachSessions } from "../src/lib/classroomCoachAccess";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function topics(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    topicName: `Topic ${index + 1}`,
    topicOrder: index + 1,
  }));
}

const base = {
  classroomType: "series" as const,
  title: "Release check",
  topicName: "Topic",
  durationMinutes: 60,
  startDate: "2026-08-03",
  frequency: "weekly" as const,
  daysOfWeek: [{ day: 1, slots: [{ startTime: "16:00", durationMinutes: 60 }] }],
  sessionPlan: topics(1),
};

const single = buildGeneratedSessions({
  ...base,
  classroomType: "single",
  classDate: "2026-08-03",
  startTime: "16:00",
  endCondition: "course_complete",
});
assert(single[0]?.scheduledFor.toISOString() === "2026-08-03T10:30:00.000Z", "Single class was not stored as 4:00 PM IST");

const onDate = buildGeneratedSessions({ ...base, endCondition: "on_date", endDate: "2026-08-17" });
assert(onDate.length === 3, "End-on-date series stopped before its end date");
assert(onDate.at(-1)?.scheduledFor.toISOString() === "2026-08-17T10:30:00.000Z", "End-on-date series used the wrong final IST date");

const courseComplete = buildGeneratedSessions({
  ...base,
  daysOfWeek: [
    { day: 1, slots: [{ startTime: "16:00", durationMinutes: 60 }] },
    { day: 3, slots: [{ startTime: "17:00", durationMinutes: 60 }] },
  ],
  sessionPlan: topics(3),
  endCondition: "course_complete",
});
assert(courseComplete.length === 3, "Course-complete series did not create one class per topic");

const fixedCount = buildGeneratedSessions({ ...base, endCondition: "after_n_sessions", endAfterSessions: 5 });
assert(fixedCount.length === 5, "Fixed-count series did not create the requested number of classes");

const rolling = buildGeneratedSessions({ ...base, endCondition: "never" });
assert(rolling.length === 52, "Rolling schedule did not create exactly 52 future classes");

const bounds = academyDayBounds("2026-08-03");
assert(bounds.start.toISOString() === "2026-08-02T18:30:00.000Z", "IST day start is incorrect");
assert(bounds.end.toISOString() === "2026-08-03T18:29:59.999Z", "IST day end is incorrect");

const classroom = {
  coach: "primary-coach",
  generatedSessions: [
    { _id: "session-1", substituteCoach: "substitute-coach" },
    { _id: "session-2" },
  ],
};
assert(coachCanAccessClassroomSession(classroom, "substitute-coach", "session-1"), "Substitute coach cannot access the assigned class");
assert(!coachCanAccessClassroomSession(classroom, "substitute-coach", "session-2"), "Substitute coach can access an unassigned class");
assert(!coachCanAccessClassroomSession(classroom, "primary-coach", "session-1"), "Primary coach can still enter a substituted class");
assert(coachCanAccessClassroomSession(classroom, "primary-coach", "session-2"), "Primary coach cannot enter an unsubstituted class");
assert(limitClassroomToCoachSessions(classroom, "substitute-coach").generatedSessions.length === 1, "Substitute coach list was not limited to assigned classes");
assert(limitClassroomToCoachSessions(classroom, "primary-coach").generatedSessions.length === 1, "Primary coach list still includes substituted classes");

console.log("Classroom release checks passed: IST scheduling, recurrence limits, and substitute-coach visibility.");
