import { describe, expect, it } from "vitest";
import { MIN_CLASSES_FOR_FEEDBACK, WITHDRAWABLE_STATUSES, cleanRatings, duplicateReportsToWithdraw, feedbackActionSchema, hasEnoughClasses, missingForSubmit, serializeFeedback } from "@/lib/feedback/feedbackRules";

const COACH = "aaaaaaaaaaaaaaaaaaaaaaaa";
const STUDENT = "bbbbbbbbbbbbbbbbbbbbbbbb";

function doc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "cccccccccccccccccccccccc",
    month: "2026-09",
    coach: COACH,
    student: STUDENT,
    tier: "beginner",
    status: "sent",
    studentName: "Aarav",
    coachName: "Priya",
    stats: { classesScheduled: 8, classesAttended: 7, topicsCovered: ["Forks"] },
    ratings: new Map([["rules", 4]]),
    highlights: ["Learnt all the piece moves"],
    focusAreas: [],
    parentNote: "Great month",
    internalNote: "Parent asked about fee discount",
    reviewNote: "fix tone",
    skipReason: "",
    emailTo: "parent@example.com",
    ...overrides,
  };
}

describe("feedback serialization", () => {
  it("never gives a student the internal note or review trail", () => {
    const out: any = serializeFeedback(doc(), { id: STUDENT, role: "student" });
    expect(out).toBeTruthy();
    expect(JSON.stringify(out)).not.toContain("fee discount");
    expect(out.reviewNote).toBeUndefined();
    expect(out.emailTo).toBeUndefined();
    expect(out.ratings).toEqual({ rules: 4 });
  });

  it("hides reports from students until they are sent", () => {
    for (const status of ["pending", "draft", "submitted", "approved", "changes_requested", "skipped"]) {
      expect(serializeFeedback(doc({ status }), { id: STUDENT, role: "student" })).toBeNull();
    }
    expect(serializeFeedback(doc(), { id: "dddddddddddddddddddddddd", role: "student" })).toBeNull();
  });

  it("lets a coach see only their own reports, including the internal note", () => {
    expect((serializeFeedback(doc(), { id: COACH, role: "instructor" }) as any).internalNote).toContain("fee discount");
    expect(serializeFeedback(doc(), { id: "dddddddddddddddddddddddd", role: "instructor" })).toBeNull();
  });
});

describe("feedback submission rules", () => {
  it("lists what is missing before submit, including the parent note", () => {
    const full = { rules: 3, checkmates: 3, board_vision: 3, opening_principles: 3, effort: 5 };
    expect(missingForSubmit("beginner", { ratings: { rules: 3 }, parentNote: "" })).toHaveLength(5);
    expect(missingForSubmit("beginner", { ratings: full, parentNote: "ok" })).toEqual(["the note for parents"]);
    expect(missingForSubmit("beginner", { ratings: full, parentNote: "Great progress with checkmates this month." })).toEqual([]);
  });

  it("will not let an admin approve with a blanked-out parent note", () => {
    expect(() => feedbackActionSchema.parse({ action: "approve", parentNote: "  " })).toThrow();
    expect(feedbackActionSchema.parse({ action: "approve" })).toEqual({ action: "approve" });
  });

  it("drops rating keys that are not in the tier's question set", () => {
    expect(cleanRatings("beginner", { rules: 3, tactics: 5, hacked: 1 })).toEqual({ rules: 3 });
  });

  it("rejects out-of-range ratings and too many focus areas", () => {
    expect(() => feedbackActionSchema.parse({ action: "submit", ratings: { rules: 6 } })).toThrow();
    expect(() => feedbackActionSchema.parse({ action: "submit", focusAreas: ["a", "b", "c"] })).toThrow();
  });
});

describe("minimum attendance", () => {
  it("holds back a new student until three classes in total", () => {
    expect(MIN_CLASSES_FOR_FEEDBACK).toBe(3);
    expect(hasEnoughClasses(2)).toBe(false);
    expect(hasEnoughClasses(3)).toBe(true);
    expect(hasEnoughClasses(40)).toBe(true);
    expect(hasEnoughClasses(undefined)).toBe(false);
  });

  it("never withdraws a report the family already has", () => {
    expect(WITHDRAWABLE_STATUSES).not.toContain("sent");
    expect(WITHDRAWABLE_STATUSES).toContain("submitted");
  });
});

describe("one report per student per month", () => {
  const OLD = "old";
  const NEW = "new";

  it("withdraws the new group's copy when the family already has the old coach's report (live, 2026-10-05)", () => {
    const withdraw = duplicateReportsToWithdraw([
      { id: "akkula", status: "sent", coachId: OLD, taughtCoachId: OLD, createdAt: "2026-09-25" },
      { id: "shreyash", status: "submitted", coachId: NEW, taughtCoachId: OLD, createdAt: "2026-10-03" },
    ]);
    expect(withdraw).toEqual(["shreyash"]);
  });

  it("keeps the copy with the coach who taught the month when neither is started", () => {
    const withdraw = duplicateReportsToWithdraw([
      { id: "shanthosh", status: "pending", coachId: NEW, taughtCoachId: OLD, createdAt: "2026-10-04" },
      { id: "bhavya", status: "pending", coachId: OLD, taughtCoachId: OLD, createdAt: "2026-09-25" },
    ]);
    expect(withdraw).toEqual(["shanthosh"]);
  });

  it("never withdraws a report that was already sent, even as the extra copy", () => {
    expect(duplicateReportsToWithdraw([
      { id: "a", status: "sent", coachId: OLD, createdAt: "2026-09-25" },
      { id: "b", status: "sent", coachId: NEW, createdAt: "2026-10-03" },
    ])).toEqual([]);
    expect(duplicateReportsToWithdraw([{ id: "only", status: "pending", coachId: OLD }])).toEqual([]);
  });
});
