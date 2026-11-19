import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isCoachNoShowDue } from "@/lib/coachNoShowAutoClose";

// 18 Nov 2026, 17:00 IST class of 60 minutes: ends 18:00, grace ends 18:20 IST (12:50 UTC).
const scheduled = { _id: "s1", scheduledFor: new Date("2026-11-18T00:00:00+05:30"), startTime: "17:00", durationMinutes: 60, status: "scheduled" };
const studentOnly = { status: "live", participants: [{ role: "student", user: "kid", presenceStatus: "left" }] };
const afterGrace = new Date("2026-11-18T12:51:00Z");
const beforeGrace = new Date("2026-11-18T12:45:00Z");

describe("isCoachNoShowDue", () => {
  it("closes a room the student joined and left, once the grace has passed", () => {
    expect(isCoachNoShowDue({ live: studentOnly, scheduledSession: scheduled, now: afterGrace, requireStudent: true })).toBe(true);
  });

  it("waits until the grace period is over", () => {
    expect(isCoachNoShowDue({ live: studentOnly, scheduledSession: scheduled, now: beforeGrace, requireStudent: true })).toBe(false);
  });

  it("never closes a room a coach or admin entered", () => {
    for (const role of ["instructor", "admin", "sub-admin"]) {
      const live = { status: "live", participants: [...studentOnly.participants, { role, user: "c" }] };
      expect(isCoachNoShowDue({ live, scheduledSession: scheduled, now: afterGrace })).toBe(false);
    }
  });

  it("leaves a class alone once someone has recorded its outcome", () => {
    for (const status of ["completed", "cancelled", "coach_no_show", "student_no_show"]) {
      expect(isCoachNoShowDue({ live: studentOnly, scheduledSession: { ...scheduled, status }, now: afterGrace })).toBe(false);
    }
  });

  it("the sweep needs a student to have come; an empty room is not evidence", () => {
    const empty = { status: "live", participants: [] };
    expect(isCoachNoShowDue({ live: empty, scheduledSession: scheduled, now: afterGrace, requireStudent: true })).toBe(false);
  });

  it("ignores a room that is already ended", () => {
    expect(isCoachNoShowDue({ live: { ...studentOnly, status: "ended" }, scheduledSession: scheduled, now: afterGrace })).toBe(false);
  });
});
