import { describe, expect, it } from "vitest";
import { monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { monthTeachingCoachId, reportCoachId } from "@/lib/feedback/feedbackCoach";

const OLD = "64a000000000000000000001";
const NEW = "64a000000000000000000002";
const SUB = "64a000000000000000000003";

const at = (iso: string) => new Date(iso);
const session = (iso: string, extra: Record<string, unknown> = {}) => ({ scheduledFor: at(iso), status: "completed", ...extra });

// A group handed from OLD to NEW for October: September's classes were pinned
// to OLD before the swap, October's are taught by NEW (the classroom coach).
const handedOver = {
  coach: NEW,
  generatedSessions: [
    session("2026-09-03T12:00:00Z", { conductedBy: OLD }),
    session("2026-09-10T12:00:00Z", { conductedBy: OLD }),
    session("2026-09-17T12:00:00Z", { conductedBy: OLD }),
    session("2026-09-24T12:00:00Z", { conductedBy: OLD }),
    session("2026-10-01T12:00:00Z"),
    session("2026-10-08T12:00:00Z", { status: "scheduled" }),
  ],
};

describe("which coach a month's report belongs to", () => {
  it("keeps last month with the coach who taught it after a hand-over", () => {
    expect(monthTeachingCoachId(handedOver, monthBounds("2026-09"))).toBe(OLD);
    expect(monthTeachingCoachId(handedOver, monthBounds("2026-10"))).toBe(NEW);
  });

  it("does not let a one-off substitute take the month", () => {
    const classroom = {
      coach: OLD,
      generatedSessions: [session("2026-09-03T12:00:00Z"), session("2026-09-10T12:00:00Z", { substituteCoach: SUB }), session("2026-09-17T12:00:00Z")],
    };
    expect(monthTeachingCoachId(classroom, monthBounds("2026-09"))).toBe(OLD);
  });

  it("ignores classes that did not happen", () => {
    const classroom = {
      coach: NEW,
      generatedSessions: [session("2026-09-03T12:00:00Z", { conductedBy: OLD }), session("2026-09-10T12:00:00Z", { status: "cancelled" }), session("2026-09-17T12:00:00Z", { status: "coach_no_show" })],
    };
    expect(monthTeachingCoachId(classroom, monthBounds("2026-09"))).toBe(OLD);
  });

  it("falls back to today's coach when the teaching coach has left, or the month has no classes", () => {
    expect(reportCoachId(handedOver, monthBounds("2026-09"), (id) => id !== OLD)).toBe(NEW);
    expect(reportCoachId(handedOver, monthBounds("2026-08"), () => true)).toBe(NEW);
    expect(reportCoachId(handedOver, monthBounds("2026-09"), () => true)).toBe(OLD);
  });
});
