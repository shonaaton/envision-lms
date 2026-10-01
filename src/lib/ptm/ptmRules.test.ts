import { describe, expect, it } from "vitest";
import { canGiveFeedback, isJoinWindowOpen, nextPtmEligibleAt, ptmCreditSummary, ptmYearOf, requestPtmSchema, schedulePtmSchema, serializePtm } from "./ptmRules";
const now = new Date("2026-10-01T00:00:00+05:30");
const row = (status: string, extra: Record<string, any> = {}) => ({ _id: "ptm", student: "student", coach: "coach", status, ptmYear: "2026-27", preferredAt: "2026-10-04T10:00:00+05:30", ...extra });
describe("PTM credit rules", () => {
  it("resets exactly at 1 October midnight IST", () => {
    expect(ptmYearOf(new Date("2026-09-30T23:59:59+05:30"))).toBe("2025-26");
    expect(ptmYearOf(now)).toBe("2026-27");
    expect(ptmYearOf(new Date("2027-09-30T23:59:59+05:30"))).toBe("2026-27");
    expect(ptmYearOf(new Date("2027-10-01T00:00:00+05:30"))).toBe("2027-28");
  });
  it("starts with 12 and separates held and spent credits", () => {
    expect(ptmCreditSummary([], now)).toMatchObject({ total: 12, used: 0, held: 0, remaining: 12, openRequest: null });
    expect(ptmCreditSummary([row("requested"), row("approved"), row("scheduled"), row("completed")], now)).toMatchObject({ used: 2, held: 2, remaining: 8, openRequest: "ptm" });
    expect(ptmCreditSummary(Array.from({ length: 12 }, () => row("completed")), now).remaining).toBe(0);
  });
  it("rejected, cancelled and prior-year records do not consume credits", () => {
    expect(ptmCreditSummary([row("rejected"), row("cancelled"), row("completed", { ptmYear: "2025-26" })], now).remaining).toBe(12);
  });
  it("has one open request and a 30-day gap from the actual meeting date", () => {
    const p = row("scheduled", { scheduledAt: "2026-10-04T10:00:00+05:30" });
    expect(ptmCreditSummary([p], now).nextEligibleAt).toBe(new Date("2026-11-03T10:00:00+05:30").toISOString());
    expect(ptmCreditSummary([row("approved")], now).openRequest).toBeTruthy();
    expect(ptmCreditSummary([row("cancelled")], now).openRequest).toBeNull();
    expect(nextPtmEligibleAt([row("completed", { ptmYear: "2025-26", scheduledAt: "2026-09-28T10:00:00+05:30" })])).toBe(new Date("2026-10-28T10:00:00+05:30").toISOString());
  });
});
describe("PTM access windows", () => {
  const p = row("scheduled", { scheduledAt: "2026-10-04T10:00:00Z", durationMinutes: 30 });
  it("opens at T-10 and closes after end+60", () => {
    expect(isJoinWindowOpen(p, new Date("2026-10-04T09:49:59Z"))).toBe(false);
    expect(isJoinWindowOpen(p, new Date("2026-10-04T09:50:00Z"))).toBe(true);
    expect(isJoinWindowOpen(p, new Date("2026-10-04T11:30:00Z"))).toBe(true);
    expect(isJoinWindowOpen(p, new Date("2026-10-04T11:30:00.001Z"))).toBe(false);
    expect(isJoinWindowOpen({ ...p, status: "cancelled" }, new Date("2026-10-04T10:00:00Z"))).toBe(false);
  });
  it("feedback is once, after the meeting ends, on scheduled or completed PTMs", () => {
    const end = new Date("2026-10-04T10:30:00Z");
    expect(canGiveFeedback(p, new Date(end.getTime() - 1))).toBe(false);
    expect(canGiveFeedback(p, end)).toBe(true);
    expect(canGiveFeedback({ ...p, status: "completed" }, end)).toBe(true);
    expect(canGiveFeedback({ ...p, feedback: { submittedAt: end } }, end)).toBe(false);
    expect(canGiveFeedback({ ...p, status: "approved" }, end)).toBe(false);
  });
});
describe("PTM serialization and input", () => {
  it("never leaks feedback or Meet URLs to coach or student, including unknown fields", () => {
    const p = row("completed", { meetingUrl: "https://meet.google.com/abc-defg-hij", feedback: { rating: 5, preparedness: 4, clarity: 3, comments: "Private", submittedAt: now }, privateExtra: "secret" });
    for (const role of ["student", "instructor"] as const) {
      const view = serializePtm(p, { id: role, role });
      expect(view).not.toHaveProperty("feedback"); expect(view).not.toHaveProperty("meetingUrl"); expect(view).not.toHaveProperty("privateExtra");
    }
    for (const role of ["admin", "sub-admin"] as const) expect(serializePtm(p, { id: role, role }).feedback.comments).toBe("Private");
  });
  it("parses local inputs in IST and validates topic and Meet URL", () => {
    const input = { coach: "a".repeat(24), preferredAt: "2026-10-01T00:00", reason: "Practice routine" };
    expect(requestPtmSchema.parse(input).preferredAt.toISOString()).toBe(now.toISOString());
    expect(requestPtmSchema.safeParse({ ...input, reason: "short" }).success).toBe(false);
    const schedule = { action: "schedule", scheduledAt: input.preferredAt, meetingUrl: "meet.google.com/abc-defg-hij" };
    expect(schedulePtmSchema.parse(schedule).meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    for (const meetingUrl of ["https://evil.com", "https://meet.google.com/new", "https://meet.google.com/"]) expect(schedulePtmSchema.safeParse({ ...schedule, meetingUrl }).success).toBe(false);
  });
});
