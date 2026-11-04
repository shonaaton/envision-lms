import { describe, expect, it } from "vitest";
import { monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { CURRENT_COACH_RULE_FROM, monthTeachingCoachId, monthTopCoach, reportCoachId } from "@/lib/feedback/feedbackCoach";

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
    expect(reportCoachId(handedOver, "2026-09", (id) => id !== OLD)).toBe(NEW);
    expect(reportCoachId(handedOver, "2026-08", () => true)).toBe(NEW);
    expect(reportCoachId(handedOver, "2026-09", () => true)).toBe(OLD);
  });
});

describe("from November 2026: the batch's current permanent coach", () => {
  // OLD taught most of November, then the batch was handed to NEW.
  const lateHandover = {
    coach: NEW,
    generatedSessions: [
      session("2026-11-03T12:00:00Z", { conductedBy: OLD }),
      session("2026-11-10T12:00:00Z", { conductedBy: OLD }),
      session("2026-11-17T12:00:00Z", { conductedBy: OLD }),
      session("2026-11-24T12:00:00Z"),
    ],
  };

  it("gives the report to the current coach, not the one who taught most of the month", () => {
    expect(CURRENT_COACH_RULE_FROM).toBe("2026-11");
    expect(monthTeachingCoachId(lateHandover, monthBounds("2026-11"))).toBe(OLD);
    expect(reportCoachId(lateHandover, "2026-11", () => true)).toBe(NEW);
    expect(reportCoachId(lateHandover, "2026-12", () => true)).toBe(NEW);
  });

  it("never gives it to a one-off substitute", () => {
    const classroom = { coach: OLD, generatedSessions: [session("2026-11-03T12:00:00Z", { substituteCoach: SUB }), session("2026-11-10T12:00:00Z", { substituteCoach: SUB })] };
    expect(reportCoachId(classroom, "2026-11", () => true)).toBe(OLD);
  });

  it("falls back to the month's teaching coach only if the current coach has left", () => {
    expect(reportCoachId(lateHandover, "2026-11", (id) => id !== NEW)).toBe(OLD);
  });

  it("leaves months before the switch on the old rule", () => {
    expect(reportCoachId(handedOver, "2026-09", () => true)).toBe(OLD);
  });
});

describe("monthTopCoach (admin list: most classes taken this month)", () => {
  const classroom = {
    coach: NEW,
    generatedSessions: [
      session("2026-11-03T12:00:00Z", { conductedBy: OLD }),
      session("2026-11-10T12:00:00Z", { conductedBy: OLD }),
      session("2026-11-17T12:00:00Z"),
      session("2026-11-24T12:00:00Z", { status: "scheduled" }),
      session("2026-11-27T12:00:00Z", { status: "scheduled" }),
    ],
  };

  it("counts only classes held so far when given a cut-off", () => {
    expect(monthTopCoach(classroom, monthBounds("2026-11"), { until: at("2026-11-20T00:00:00Z") })).toEqual({ coachId: OLD, classes: 2 });
  });

  it("counts booked classes too without one", () => {
    expect(monthTopCoach(classroom, monthBounds("2026-11"))).toEqual({ coachId: NEW, classes: 3 });
  });

  it("is empty for a month with no classes", () => {
    expect(monthTopCoach(classroom, monthBounds("2026-12"))).toEqual({ coachId: "", classes: 0 });
  });
});
