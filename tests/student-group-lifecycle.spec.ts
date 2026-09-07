import { expect, test } from "@playwright/test";
import { shouldCloseGroup } from "../src/lib/groupLifecycle";
import { scheduleDatesFrom } from "../src/lib/classroomSchedule";

// Deactivating or pausing a student takes their batch with them only when that
// student was the last attending member of it. Everything in the lifecycle flow
// hangs off this one decision, so it is checked on its own.

const student = "s1";

test("closes a group the student was the only member of", () => {
  expect(shouldCloseGroup([student], student, new Set())).toBe(true);
});

test("keeps a group that still has another attending student", () => {
  expect(shouldCloseGroup([student, "s2"], student, new Set(["s2"]))).toBe(false);
});

test("closes a group whose other members are all away", () => {
  // s2 is deactivated and s3 is paused, so neither is in the attending set.
  expect(shouldCloseGroup([student, "s2", "s3"], student, new Set())).toBe(true);
});

test("leaves a group the student never belonged to", () => {
  expect(shouldCloseGroup(["s2", "s3"], student, new Set())).toBe(false);
});

test("ignores empty roster entries left by removed references", () => {
  expect(shouldCloseGroup(["", student, ""], student, new Set())).toBe(true);
});

// Resuming a pause puts the waiting classes back on the days the classroom
// actually runs, counting from the restart day rather than from the dates that
// went by during the pause.

const monThu = [
  { day: 1, slots: [{ startTime: "17:00", durationMinutes: 60 }] },
  { day: 4, slots: [{ startTime: "17:00", durationMinutes: 60 }] },
];

test("reschedules onto the classroom's own weekly days from the restart date", () => {
  // 2026-03-11 is a Wednesday, so the first slot is the Thursday after it.
  const dates = scheduleDatesFrom(monThu, "2026-03-11", 4);
  expect(dates).toHaveLength(4);
  const days = dates.map((slot) => slot.scheduledFor.getUTCDay());
  // Asia/Kolkata 17:00 is 11:30 UTC the same day, so the weekday survives.
  expect(days).toEqual([4, 1, 4, 1]);
  expect(dates[0].startTime).toBe("17:00");
  expect(dates[0].durationMinutes).toBe(60);
});

test("includes the restart day itself when the schedule lands on it", () => {
  // 2026-03-09 is a Monday, which the schedule runs on.
  const [first] = scheduleDatesFrom(monThu, "2026-03-09", 1);
  expect(first.scheduledFor.getUTCDay()).toBe(1);
});

test("returns nothing to reschedule when the classroom has no weekly pattern", () => {
  // A single class has no daysOfWeek, so the caller falls back to shifting it.
  expect(scheduleDatesFrom([], "2026-03-11", 3)).toEqual([]);
  expect(scheduleDatesFrom(monThu, "2026-03-11", 0)).toEqual([]);
});

// A paused student's outstanding invoice waits for them: it comes due the day
// after they restart, not on a date that went by while they were away.

import { anchoredDueDates } from "../src/lib/studentPause";

const restartPlusOne = new Date("2026-03-12T18:29:59.999Z");

test("the outstanding invoice lands on the day after the restart", () => {
  const [due] = anchoredDueDates([new Date("2026-02-05T18:29:59.999Z")], restartPlusOne);
  expect(due.toISOString()).toBe(restartPlusOne.toISOString());
});

test("a second pending invoice keeps its gap instead of piling onto the same day", () => {
  const [first, second] = anchoredDueDates(
    [new Date("2026-02-05T18:29:59.999Z"), new Date("2026-03-05T18:29:59.999Z")],
    restartPlusOne
  );
  expect(first.toISOString()).toBe(restartPlusOne.toISOString());
  // 5 Feb -> 5 Mar is 28 days, so the second lands 28 days after the first.
  expect(Math.round((second.getTime() - first.getTime()) / 86400000)).toBe(28);
});

test("nothing pending means nothing to move", () => {
  expect(anchoredDueDates([], restartPlusOne)).toEqual([]);
});
