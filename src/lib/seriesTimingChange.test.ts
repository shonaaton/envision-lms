import { describe, expect, it } from "vitest";
import { buildWeeklyOccurrences, planPermanentTimingChange, upcomingMovableSessions } from "@/lib/seriesTimingChange";

// Wed 2026-10-07 12:00 IST
const NOW = new Date("2026-10-07T06:30:00Z");

function ist(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00+05:30`);
}

// A twice-weekly series (Mon + Thu, 17:00 IST) whose August-September registers
// were never marked - the shape that lost its history to a timing change.
const sessions = [
  { _id: "aug-1", status: "scheduled", scheduledFor: ist("2026-08-31", "17:00"), topicName: "T1" },
  { _id: "sep-1", status: "scheduled", scheduledFor: ist("2026-09-03", "17:00"), topicName: "T2" },
  { _id: "taught", status: "completed", scheduledFor: ist("2026-09-07", "17:00"), actualEndedAt: ist("2026-09-07", "18:00"), topicName: "T3" },
  { _id: "marked", status: "scheduled", attendanceMarkedAt: ist("2026-10-05", "18:00"), scheduledFor: ist("2026-10-05", "17:00"), topicName: "T4" },
  { _id: "oct-8", status: "scheduled", scheduledFor: ist("2026-10-08", "17:00"), topicName: "T5" },
  { _id: "oct-12", status: "scheduled", scheduledFor: ist("2026-10-12", "17:00"), topicName: "T6" },
  { _id: "oct-15", status: "rescheduled", scheduledFor: ist("2026-10-15", "17:00"), topicName: "T7" },
  { _id: "oct-19", status: "scheduled", scheduledFor: ist("2026-10-19", "17:00"), topicName: "T8" },
];

const tueSat18 = [
  { day: 2, slots: [{ startTime: "18:00", durationMinutes: 60 }] },
  { day: 6, slots: [{ startTime: "18:00", durationMinutes: 60 }] },
];

describe("upcomingMovableSessions", () => {
  it("never picks up a past class, even one whose register was never marked", () => {
    expect(upcomingMovableSessions(sessions, NOW).map((s) => s._id)).toEqual(["oct-8", "oct-12", "oct-15", "oct-19"]);
  });

  it("leaves a class that has already started today", () => {
    const today = [{ _id: "now", status: "scheduled", scheduledFor: ist("2026-10-07", "11:30") }];
    expect(upcomingMovableSessions(today, NOW)).toEqual([]);
  });
});

describe("planPermanentTimingChange", () => {
  it("re-lays only upcoming classes on or after the apply-from date", () => {
    const { moving, occurrences } = planPermanentTimingChange({ sessions, daysOfWeek: tueSat18, effectiveKey: "2026-10-13", now: NOW });
    expect(moving.map((s) => s._id)).toEqual(["oct-15", "oct-19"]);
    expect(occurrences.map((o) => `${o.dateKey} ${o.startTime}`)).toEqual(["2026-10-13 18:00", "2026-10-17 18:00"]);
  });

  it("moves every upcoming class when it applies from the next class", () => {
    const { moving, occurrences } = planPermanentTimingChange({ sessions, daysOfWeek: tueSat18, effectiveKey: "2026-10-08", now: NOW });
    expect(moving.map((s) => s._id)).toEqual(["oct-8", "oct-12", "oct-15", "oct-19"]);
    expect(occurrences.map((o) => o.dateKey)).toEqual(["2026-10-10", "2026-10-13", "2026-10-17", "2026-10-20"]);
  });
});

describe("buildWeeklyOccurrences", () => {
  it("skips a slot earlier today rather than placing a class in the past", () => {
    const wed = [{ day: 3, slots: [{ startTime: "09:00", durationMinutes: 60 }, { startTime: "19:00", durationMinutes: 60 }] }];
    const result = buildWeeklyOccurrences(wed, "2026-10-07", 2, NOW);
    expect(result.map((o) => `${o.dateKey} ${o.startTime}`)).toEqual(["2026-10-07 19:00", "2026-10-14 09:00"]);
    expect(result[0].scheduledFor.toISOString()).toBe("2026-10-07T13:30:00.000Z");
  });
});
