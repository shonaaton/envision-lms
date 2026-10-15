import { describe, expect, it } from "vitest";
import { holidayRangeError, planHolidayRestore, planHolidayShift } from "@/lib/holidays/holidayPlan";

// Thu 2026-10-15 12:00 IST
const NOW = new Date("2026-10-15T06:30:00Z");

function ist(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00+05:30`);
}

function key(date: Date) {
  return new Date(date.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

// Mon + Thu, 17:00 IST
const monThu17 = [
  { day: 1, slots: [{ startTime: "17:00", durationMinutes: 60 }] },
  { day: 4, slots: [{ startTime: "17:00", durationMinutes: 60 }] },
];

function series() {
  return [
    { _id: "past-unmarked", status: "scheduled", scheduledFor: ist("2026-10-12", "17:00"), startTime: "17:00", topicName: "T1" },
    { _id: "oct-15", status: "scheduled", scheduledFor: ist("2026-10-15", "17:00"), startTime: "17:00", topicName: "T2" },
    { _id: "oct-19", status: "scheduled", scheduledFor: ist("2026-10-19", "17:00"), startTime: "17:00", topicName: "T3" },
    { _id: "oct-22", status: "scheduled", scheduledFor: ist("2026-10-22", "17:00"), startTime: "17:00", topicName: "T4" },
    { _id: "oct-26", status: "scheduled", scheduledFor: ist("2026-10-26", "17:00"), startTime: "17:00", topicName: "T5" },
  ];
}

function landing(plan: ReturnType<typeof planHolidayShift>) {
  return Object.fromEntries(plan.moves.map((move) => [move.sessionId, key(move.to.scheduledFor)]));
}

describe("planHolidayShift", () => {
  it("moves a class on the holiday to the next class and slides the rest down one slot", () => {
    const plan = planHolidayShift({ sessions: series(), daysOfWeek: monThu17, holiday: { startKey: "2026-10-19", endKey: "2026-10-19" }, now: NOW });
    expect(plan.inHoliday).toBe(1);
    expect(plan.appended).toBe(1);
    expect(landing(plan)).toEqual({ "oct-19": "2026-10-22", "oct-22": "2026-10-26", "oct-26": "2026-10-29" });
    expect(key(plan.newEndDate!)).toBe("2026-10-29");
    // Classes before the holiday stay put.
    expect(plan.moves.map((move) => move.sessionId)).not.toContain("oct-15");
  });

  it("keeps the order of the classes, so each topic travels with its class", () => {
    const plan = planHolidayShift({ sessions: series(), daysOfWeek: monThu17, holiday: { startKey: "2026-10-19", endKey: "2026-10-22" }, now: NOW });
    const order = plan.moves.sort((a, b) => a.to.scheduledFor.getTime() - b.to.scheduledFor.getTime()).map((move) => move.session.topicName);
    expect(order).toEqual(["T3", "T4", "T5"]);
  });

  it("handles a closure several classes long", () => {
    const plan = planHolidayShift({ sessions: series(), daysOfWeek: monThu17, holiday: { startKey: "2026-10-16", endKey: "2026-10-25" }, now: NOW });
    expect(plan.inHoliday).toBe(2);
    expect(plan.appended).toBe(2);
    expect(landing(plan)).toEqual({ "oct-19": "2026-10-26", "oct-22": "2026-10-29", "oct-26": "2026-11-02" });
  });

  it("changes nothing when no class falls on the holiday", () => {
    const plan = planHolidayShift({ sessions: series(), daysOfWeek: monThu17, holiday: { startKey: "2026-10-20", endKey: "2026-10-21" }, now: NOW });
    expect(plan.moves).toEqual([]);
    expect(plan.newEndDate).toBeNull();
  });

  it("never moves an unmarked past class or one that has already started", () => {
    const sessions = series();
    sessions[1] = { ...sessions[1], scheduledFor: ist("2026-10-15", "11:00") }; // started this morning
    const plan = planHolidayShift({ sessions, daysOfWeek: monThu17, holiday: { startKey: "2026-10-12", endKey: "2026-10-15" }, now: NOW });
    expect(plan.moves).toEqual([]);
  });

  it("does not land the appended class on the holiday or another closure", () => {
    const plan = planHolidayShift({
      sessions: series(),
      daysOfWeek: monThu17,
      holiday: { startKey: "2026-10-19", endKey: "2026-10-19" },
      otherClosures: [{ startKey: "2026-10-29", endKey: "2026-10-29" }],
      now: NOW,
    });
    expect(landing(plan)["oct-26"]).toBe("2026-11-02");
  });

  it("reads a weekly pattern whose slots are Mongoose subdocuments", () => {
    // Fields live on the prototype, as with a subdocument, so a spread loses them.
    class Slot {
      get startTime() { return "17:00"; }
      get durationMinutes() { return 60; }
    }
    const subdocPattern = [{ day: 1, slots: [new Slot()] }, { day: 4, slots: [new Slot()] }];
    const plan = planHolidayShift({ sessions: series(), daysOfWeek: subdocPattern, holiday: { startKey: "2026-10-26", endKey: "2026-10-26" }, now: NOW });
    expect(landing(plan)).toEqual({ "oct-26": "2026-10-29" });
    expect(plan.moves[0].to.startTime).toBe("17:00");
  });

  it("falls back to a week later at the same time when the series has no weekly pattern", () => {
    const plan = planHolidayShift({ sessions: series(), daysOfWeek: [], holiday: { startKey: "2026-10-26", endKey: "2026-10-26" }, now: NOW });
    expect(landing(plan)).toEqual({ "oct-26": "2026-11-02" });
    expect(plan.moves[0].to.startTime).toBe("17:00");
  });

  it("keeps a one-off timing after the holiday for whichever class lands on it", () => {
    const sessions = series();
    sessions[3] = { ...sessions[3], scheduledFor: ist("2026-10-23", "10:00"), startTime: "10:00" }; // moved to Fri morning once
    const plan = planHolidayShift({ sessions, daysOfWeek: monThu17, holiday: { startKey: "2026-10-19", endKey: "2026-10-19" }, now: NOW });
    const move = plan.moves.find((item) => item.sessionId === "oct-19")!;
    expect(key(move.to.scheduledFor)).toBe("2026-10-23");
    expect(move.to.startTime).toBe("10:00");
  });
});

/** Declare the holiday on a copy of the series, as the service would. */
function declared(holiday: { startKey: string; endKey: string }) {
  const sessions = series();
  const plan = planHolidayShift({ sessions, daysOfWeek: monThu17, holiday, now: NOW });
  const moves = plan.moves.map((move) => {
    move.session.scheduledFor = move.to.scheduledFor;
    move.session.startTime = move.to.startTime;
    return {
      sessionId: move.sessionId,
      fromScheduledFor: move.from.scheduledFor,
      fromStartTime: move.from.startTime,
      fromDurationMinutes: move.from.durationMinutes,
      toScheduledFor: move.to.scheduledFor,
      toStartTime: move.to.startTime,
      toDurationMinutes: move.to.durationMinutes,
    };
  });
  return { sessions, moves };
}

function restoredTo(result: ReturnType<typeof planHolidayRestore>) {
  return Object.fromEntries(result.restores.map((item) => [item.move.sessionId, key(item.to.scheduledFor)]));
}

describe("planHolidayRestore", () => {
  it("puts every class back on its own day when cancelled before the holiday", () => {
    const { sessions, moves } = declared({ startKey: "2026-10-19", endKey: "2026-10-19" });
    const result = planHolidayRestore({ sessions, moves, now: NOW });
    expect(restoredTo(result)).toEqual({ "oct-19": "2026-10-19", "oct-22": "2026-10-22", "oct-26": "2026-10-26" });
    expect(result.restores.every((item) => item.backHome)).toBe(true);
    expect(result.unrestored).toEqual([]);
  });

  it("leaves a class that was moved again since, and reports it", () => {
    const { sessions, moves } = declared({ startKey: "2026-10-19", endKey: "2026-10-19" });
    sessions.find((s) => s._id === "oct-26")!.scheduledFor = ist("2026-11-05", "17:00");
    const result = planHolidayRestore({ sessions, moves, now: NOW });
    expect(result.unrestored.map((move) => move.sessionId)).toEqual(["oct-26"]);
    expect(restoredTo(result)).toEqual({ "oct-19": "2026-10-19", "oct-22": "2026-10-22" });
  });

  it("never puts two classes on one day once part of the holiday has passed", () => {
    const { sessions, moves } = declared({ startKey: "2026-10-19", endKey: "2026-10-19" });
    // Cancelled on 20 Oct: the 19 Oct slot is gone, so the cascade stands.
    const result = planHolidayRestore({ sessions, moves, now: ist("2026-10-20", "09:00") });
    expect(result.restores).toEqual([]);
  });
});

describe("holidayRangeError", () => {
  it("accepts a single day from today", () => {
    expect(holidayRangeError({ startKey: "2026-10-15", endKey: "2026-10-15" }, "2026-10-15")).toBe("");
  });

  it("rejects past, reversed and overlong ranges", () => {
    expect(holidayRangeError({ startKey: "2026-10-14", endKey: "2026-10-16" }, "2026-10-15")).toMatch(/past/);
    expect(holidayRangeError({ startKey: "2026-10-20", endKey: "2026-10-18" }, "2026-10-15")).toMatch(/end on or after/);
    expect(holidayRangeError({ startKey: "2026-10-20", endKey: "2027-01-20" }, "2026-10-15")).toMatch(/at most/);
    expect(holidayRangeError({ startKey: "bad", endKey: "2026-10-18" }, "2026-10-15")).toMatch(/valid/);
  });
});
