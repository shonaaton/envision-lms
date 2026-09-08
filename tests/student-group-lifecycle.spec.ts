import { expect, test } from "@playwright/test";
import { shouldCloseGroup } from "../src/lib/groupLifecycle";
import { CLASS_TIME_PATTERN, resolveClassStartTime, scheduleDatesFrom } from "../src/lib/classroomSchedule";

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

// Pushing a missed class into the next slot: every later class inherits the slot
// of the one after it, and one new slot is added at the end so the last topic is
// not lost. This mirrors the date arithmetic in the push_session_forward action.

import { isPushableSessionStatus, isUntaughtSessionStatus } from "../src/lib/classroomSessions";

test("an untaught class is one whose date went by with the topic still owed", () => {
  expect(isUntaughtSessionStatus("missed")).toBe(true);
  expect(isUntaughtSessionStatus("abandoned")).toBe(true);
  expect(isUntaughtSessionStatus("coach_no_show")).toBe(true);
  expect(isUntaughtSessionStatus("completed")).toBe(false);
  expect(isUntaughtSessionStatus("cancelled")).toBe(false);
  expect(isUntaughtSessionStatus("upcoming")).toBe(false);
});

test("any class that is not taught, cancelled, or started can be pushed", () => {
  // Untaught classes are the usual reason to push, but an upcoming one counts
  // too - this is the same rule isPushableSession enforces on the API side.
  expect(isPushableSessionStatus({}, "upcoming")).toBe(true);
  expect(isPushableSessionStatus({}, "join_available")).toBe(true);
  expect(isPushableSessionStatus({}, "missed")).toBe(true);
  expect(isPushableSessionStatus({}, "coach_no_show")).toBe(true);
  expect(isPushableSessionStatus({}, "completed")).toBe(false);
  expect(isPushableSessionStatus({}, "cancelled")).toBe(false);
  expect(isPushableSessionStatus({}, "ongoing")).toBe(false);
  // A class already under way, whatever its derived status, stays put.
  expect(isPushableSessionStatus({ actualStartedAt: new Date() }, "upcoming")).toBe(false);
  expect(isPushableSessionStatus({ actualEndedAt: new Date() }, "upcoming")).toBe(false);
});

test("a pushed class never lands on an empty start time", () => {
  // The push that failed in production: the classroom's weekly pattern handed
  // back a slot with no time on it, and generatedSessions.startTime is required,
  // so the whole save was rejected. The class time is recoverable from
  // scheduledFor, which is what the class already displays.
  expect(resolveClassStartTime({ startTime: "20:00" })).toBe("20:00");
  expect(resolveClassStartTime({ startTime: "" }, { startTime: "16:30" })).toBe("16:30");
  expect(resolveClassStartTime({ startTime: "", scheduledFor: new Date("2026-10-16T14:30:00Z") })).toBe("20:00");
  expect(resolveClassStartTime({ startTime: " 20:00 " })).toBe("20:00");
  // Nothing to recover from at all - the caller has to reject this, not save it.
  expect(resolveClassStartTime({})).toBe("");
  expect(resolveClassStartTime({ startTime: "25:00", scheduledFor: "not a date" })).toBe("");
  expect(CLASS_TIME_PATTERN.test("")).toBe(false);
});

test("the pushed chain keeps its length and gains one slot at the end", () => {
  // S2 missed, S3 and S4 still ahead, on a Mon/Thu schedule.
  const chain = ["2026-03-09", "2026-03-12", "2026-03-16"].map((day) => new Date(`${day}T11:30:00Z`));
  const dayAfterLast = new Date(chain[chain.length - 1].getTime() + 86400000);
  const [extra] = scheduleDatesFrom(monThu, dayAfterLast, 1);
  const donors = [...chain.slice(1), extra.scheduledFor];

  expect(donors).toHaveLength(chain.length);
  // Each class takes the slot of the one after it.
  expect(donors[0].toISOString()).toBe(chain[1].toISOString());
  expect(donors[1].toISOString()).toBe(chain[2].toISOString());
  // The last lands on a brand new slot after the old end of the series.
  expect(donors[2].getTime()).toBeGreaterThan(chain[2].getTime());
  expect(donors[2].getUTCDay()).toBe(4);
});
