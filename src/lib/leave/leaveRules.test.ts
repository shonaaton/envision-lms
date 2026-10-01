import { describe, expect, it } from "vitest";
import { academyDateTime } from "@/lib/academyTime";
import {
  applyLeaveSchema,
  availableCredits,
  canApplyForLeave,
  cancelBlockReason,
  creditCheckError,
  creditCost,
  formatCredits,
  halfDayNoticeHours,
  isSessionCovered,
  leaveActionSchema,
  leaveCreditActionSchema,
  leaveStartsAt,
  noticeError,
  serializeLeave,
} from "./leaveRules";

const COACH = "64b000000000000000000001";
const SUB = "64b000000000000000000002";
const classOn = (dateKey: string, time: string) => ({ sessionId: `s-${time}`, title: `Class ${time}`, start: academyDateTime(dateKey, time) });

describe("who can apply", () => {
  it("lets coaches and sub-admins apply, including sales", () => {
    expect(canApplyForLeave("instructor")).toBe(true);
    expect(canApplyForLeave("sub-admin")).toBe(true);
    expect(canApplyForLeave("sub-admin", "Sales and Relationship Management")).toBe(true);
  });
  it("keeps marketing staff, admins and students out", () => {
    expect(canApplyForLeave("sub-admin", "Marketing")).toBe(false);
    expect(canApplyForLeave("sub-admin", " marketing ")).toBe(false);
    expect(canApplyForLeave("admin")).toBe(false);
    expect(canApplyForLeave("student")).toBe(false);
  });
});

describe("notice", () => {
  const day = "2026-10-10";
  const midnight = academyDateTime(day, "00:00").getTime();

  it("needs 24 hours before IST midnight for a full day", () => {
    expect(noticeError({ type: "full_day", dateKey: day, sessions: [] }, new Date(midnight - 24 * 3600_000 - 60_000))).toBeNull();
    expect(noticeError({ type: "full_day", dateKey: day, sessions: [] }, new Date(midnight - 24 * 3600_000))).toBeNull();
    expect(noticeError({ type: "full_day", dateKey: day, sessions: [] }, new Date(midnight - 24 * 3600_000 + 60_000))).toMatch(/24 hours/);
  });

  it("measures a half day from the first chosen class, not the order chosen", () => {
    const sessions = [classOn(day, "18:00"), classOn(day, "16:00")];
    const first = academyDateTime(day, "16:00").getTime();
    expect(noticeError({ type: "half_day", dateKey: day, sessions }, new Date(first - 3 * 3600_000 - 60_000), 3)).toBeNull();
    expect(noticeError({ type: "half_day", dateKey: day, sessions }, new Date(first - 3 * 3600_000 + 60_000), 3)).toMatch(/3 hours/);
    expect(leaveStartsAt({ type: "half_day", dateKey: day, sessions }).getTime()).toBe(first);
  });

  it("allows a class-free half day for today but not a past day", () => {
    const noon = new Date(academyDateTime(day, "12:00"));
    expect(noticeError({ type: "half_day", dateKey: day, sessions: [] }, noon)).toBeNull();
    expect(noticeError({ type: "half_day", dateKey: "2026-10-09", sessions: [] }, noon)).toMatch(/today or a later date/);
  });

  it("starts a full day at IST midnight even when it has classes", () => {
    expect(leaveStartsAt({ type: "full_day", dateKey: day, sessions: [classOn(day, "18:00")] }).getTime()).toBe(midnight);
  });

  it("reads the half-day hours from the environment, defaulting to 3", () => {
    expect(halfDayNoticeHours(undefined)).toBe(3);
    expect(halfDayNoticeHours("")).toBe(3);
    expect(halfDayNoticeHours("5")).toBe(5);
    expect(halfDayNoticeHours("soon")).toBe(3);
  });
});

describe("credits", () => {
  it("costs 1 for a full day and 0.5 for a half day", () => {
    expect(creditCost("full_day")).toBe(1);
    expect(creditCost("half_day")).toBe(0.5);
  });

  it("puts no limit on someone without an account", () => {
    expect(creditCheckError(null, [1, 1, 1], 1)).toBeNull();
  });

  it("counts pending requests against the balance", () => {
    expect(availableCredits(2, [1, 0.5])).toEqual({ held: 1.5, available: 0.5 });
    expect(creditCheckError({ balance: 2 }, [1, 0.5], 0.5)).toBeNull();
    expect(creditCheckError({ balance: 2 }, [1, 0.5], 1)).toMatch(/0\.5 leave credit/);
    expect(creditCheckError({ balance: 0 }, [], 0.5)).toMatch(/Ask an admin/);
  });

  it("formats halves", () => {
    expect(formatCredits(2)).toBe("2");
    expect(formatCredits(2.5)).toBe("2.5");
    expect(formatCredits(-0.5)).toBe("-0.5");
  });

  it("only accepts adjustments in steps of 0.5", () => {
    expect(leaveCreditActionSchema.safeParse({ action: "adjust", userId: COACH, amount: 1.5 }).success).toBe(true);
    expect(leaveCreditActionSchema.safeParse({ action: "adjust", userId: COACH, amount: -0.5 }).success).toBe(true);
    expect(leaveCreditActionSchema.safeParse({ action: "adjust", userId: COACH, amount: 0.25 }).success).toBe(false);
    expect(leaveCreditActionSchema.safeParse({ action: "adjust", userId: COACH, amount: 0 }).success).toBe(false);
  });
});

describe("cancelling", () => {
  const day = "2026-10-10";
  const firstClass = academyDateTime(day, "16:00");
  const approved = { applicant: COACH, status: "approved", startsAt: firstClass, dateKey: day };
  const applicant = { id: COACH, isApprover: false };
  const approverApplicant = { id: COACH, isApprover: true };
  const otherApprover = { id: SUB, isApprover: true };
  const before = new Date(firstClass.getTime() - 60_000);
  const after = new Date(firstClass.getTime() + 60_000);

  it("lets the applicant cancel an approved leave until it starts, and not after", () => {
    expect(cancelBlockReason(approved, applicant, before)).toBeNull();
    expect(cancelBlockReason(approved, applicant, after)).toMatch(/already started/);
  });
  it("holds the applicant to that even when they are an approver", () => {
    expect(cancelBlockReason(approved, approverApplicant, after)).toMatch(/already started/);
  });
  it("lets the applicant withdraw a request at any time", () => {
    expect(cancelBlockReason({ ...approved, status: "requested" }, applicant, after)).toBeNull();
  });
  it("lets another approver cancel until the day ends, and nobody else at all", () => {
    expect(cancelBlockReason(approved, otherApprover, after)).toBeNull();
    expect(cancelBlockReason(approved, otherApprover, new Date(academyDateTime("2026-10-11", "09:00")))).toMatch(/passed/);
    expect(cancelBlockReason(approved, { id: SUB, isApprover: false }, before)).toMatch(/cannot cancel/);
  });
});

describe("action schema", () => {
  it("says why a rejection without a reason fails", () => {
    const result = leaveActionSchema.safeParse({ action: "reject" });
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0].message).toMatch(/reason/i);
    expect(leaveActionSchema.safeParse({ action: "cancel" }).success).toBe(true);
  });
});

describe("apply schema", () => {
  it("rejects impossible dates and short reasons", () => {
    expect(applyLeaveSchema.safeParse({ type: "full_day", date: "2026-02-30", reason: "Family function" }).success).toBe(false);
    expect(applyLeaveSchema.safeParse({ type: "full_day", date: "2026-10-10", reason: "ok" }).success).toBe(false);
    expect(applyLeaveSchema.safeParse({ type: "half_day", date: "2026-10-10", reason: "Doctor visit", sessionIds: ["a", "b"] }).success).toBe(true);
  });
});

describe("coverage", () => {
  const day = "2026-10-10";
  const classroom = { coach: COACH };
  const session = (extra: Record<string, unknown> = {}) => ({ _id: "s1", scheduledFor: academyDateTime(day, "00:00"), startTime: "18:00", status: "scheduled", ...extra });

  it("needs cover while the applicant still teaches the class", () => {
    expect(isSessionCovered(session(), classroom, COACH, day)).toBe(false);
  });
  it("is covered by a substitute", () => {
    expect(isSessionCovered(session({ substituteCoach: { _id: SUB, name: "Sub" } }), classroom, COACH, day)).toBe(true);
  });
  it("is covered when the class is cancelled, rescheduled away, or gone", () => {
    expect(isSessionCovered(session({ status: "cancelled" }), classroom, COACH, day)).toBe(true);
    expect(isSessionCovered(session({ scheduledFor: academyDateTime("2026-10-11", "00:00") }), classroom, COACH, day)).toBe(true);
    expect(isSessionCovered(undefined, classroom, COACH, day)).toBe(true);
  });
  it("is covered when the classroom changed coach", () => {
    expect(isSessionCovered(session(), { coach: SUB }, COACH, day)).toBe(true);
  });
});

describe("serializeLeave", () => {
  it("returns only the allowlisted fields, with coverage per class", () => {
    const out = serializeLeave({
      _id: "l1", applicant: { _id: COACH, passwordHash: "x" }, applicantName: "Coach", applicantRole: "instructor", type: "half_day", dateKey: "2026-10-10",
      startsAt: new Date("2026-10-10T10:30:00Z"), reason: "Doctor", status: "approved", creditCost: 0.5, creditCharged: 0.5, secret: "no",
      sessions: [{ classroom: "c1", sessionId: "s1", title: "I2-100", start: new Date("2026-10-10T12:30:00Z") }],
    }, { "c1:s1": { covered: true, substituteName: "Sub" } });
    expect(out.applicant).toBe(COACH);
    expect((out as any).secret).toBeUndefined();
    expect(out.sessions[0]).toMatchObject({ classroom: "c1", sessionId: "s1", covered: true, substituteName: "Sub" });
  });
});
