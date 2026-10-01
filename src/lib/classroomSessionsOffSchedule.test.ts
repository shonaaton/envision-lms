import { describe, expect, it } from "vitest";
import { isSessionOffSchedule } from "@/lib/classroomSessions";

// PIC-99101, 1 Oct 2026: the old classroom was completed at 08:23 IST and the
// batch's new classroom held - and marked - the 11:00 class.
const oldClass = { scheduledFor: new Date("2026-10-01T05:30:00.000Z"), startTime: "11:00", durationMinutes: 45, status: "scheduled" };

describe("isSessionOffSchedule", () => {
  it("drops a class left behind by a course completed before it", () => {
    expect(isSessionOffSchedule({ status: "completed", completedAt: new Date("2026-10-01T02:53:55.318Z") }, oldClass)).toBe(true);
  });

  it("keeps a class that was due before the course was completed", () => {
    expect(isSessionOffSchedule({ status: "completed", completedAt: new Date("2026-10-02T00:00:00.000Z") }, oldClass)).toBe(false);
  });

  it("drops a class of a paused batch from the pause on, but not before it", () => {
    expect(isSessionOffSchedule({ status: "scheduled", isPaused: true, pausedFrom: new Date("2026-09-30T18:30:00.000Z") }, oldClass)).toBe(true);
    expect(isSessionOffSchedule({ status: "scheduled", isPaused: true, pausedFrom: new Date("2026-10-05T18:30:00.000Z") }, oldClass)).toBe(false);
    expect(isSessionOffSchedule({ status: "scheduled", isPaused: true }, oldClass)).toBe(true);
  });

  it("drops a class of a closed or cancelled classroom", () => {
    expect(isSessionOffSchedule({ status: "scheduled", isActive: false }, oldClass)).toBe(true);
    expect(isSessionOffSchedule({ status: "cancelled" }, oldClass)).toBe(true);
  });

  it("keeps a class that was actually started, whatever happened to the classroom after", () => {
    const started = { ...oldClass, actualStartedAt: new Date("2026-10-01T05:31:00.000Z") };
    expect(isSessionOffSchedule({ status: "completed", completedAt: new Date("2026-10-01T02:53:55.318Z") }, started)).toBe(false);
    expect(isSessionOffSchedule({ status: "scheduled", isPaused: true }, started)).toBe(false);
  });

  it("keeps a class of a running classroom", () => {
    expect(isSessionOffSchedule({ status: "scheduled", isActive: true }, oldClass)).toBe(false);
  });
});
