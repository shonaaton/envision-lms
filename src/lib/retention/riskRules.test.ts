import { describe, expect, it } from "vitest";
import { assessRisk, coachHeadsUp, homeworkMissedStreak, levelFor, missedStreak, needsCall, type RiskSnapshot } from "@/lib/retention/riskRules";

const NOW = new Date("2026-10-06T06:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function snapshot(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    now: NOW,
    isActive: true,
    joinedAt: daysAgo(200),
    attendance: [
      { date: daysAgo(3), status: "present" },
      { date: daysAgo(10), status: "present" },
      { date: daysAgo(17), status: "present" },
    ],
    lastAttendedAt: daysAgo(3),
    homework: [],
    lastPracticeAt: null,
    latestEffort: 4,
    coachChangedAt: null,
    fees: { planType: "monthly", nextInvoiceDueAt: daysAhead(25) },
    pause: null,
    recentPauseCount: 0,
    ...overrides,
  };
}

const missed = (...days: number[]) => days.map((n) => ({ date: daysAgo(n), status: "absent" }));

describe("missedStreak", () => {
  it("counts back from the latest class and stops at an attended one", () => {
    expect(missedStreak([...missed(2, 9), { date: daysAgo(16), status: "present" }, ...missed(23)])).toBe(2);
  });

  it("skips excused and coach-side outcomes instead of counting or breaking on them", () => {
    expect(missedStreak([
      { date: daysAgo(2), status: "absent" },
      { date: daysAgo(5), status: "excused" },
      { date: daysAgo(9), status: "coach_no_show" },
      { date: daysAgo(12), status: "student_no_show" },
      { date: daysAgo(16), status: "present" },
    ])).toBe(2);
  });
});

describe("homeworkMissedStreak", () => {
  it("counts unsubmitted homework back from the most recently due", () => {
    expect(homeworkMissedStreak([
      { dueAt: daysAgo(20), submitted: true },
      { dueAt: daysAgo(2), submitted: false },
      { dueAt: daysAgo(9), submitted: false },
    ])).toBe(2);
  });
});

describe("assessRisk", () => {
  it("leaves a student attending normally alone", () => {
    expect(assessRisk(snapshot())).toEqual({ level: "none", reasons: [], inWindow: false });
  });

  it("two misses in a row is only worth watching", () => {
    const result = assessRisk(snapshot({ attendance: missed(3, 10), lastAttendedAt: daysAgo(17) }));
    expect(result.level).toBe("watch");
    expect(needsCall(result.level)).toBe(false);
  });

  it("the same two misses just before a fee is due is worth a call", () => {
    const result = assessRisk(snapshot({ attendance: missed(3, 10), lastAttendedAt: daysAgo(17), fees: { planType: "monthly", nextInvoiceDueAt: daysAhead(4) } }));
    expect(result.level).toBe("at_risk");
    expect(result.inWindow).toBe(true);
    expect(result.reasons.map((reason) => reason.code)).toEqual(["missed_streak", "renewal_invoice"]);
  });

  it("low credits on a credit plan opens the renewal window", () => {
    const result = assessRisk(snapshot({ attendance: missed(3, 10), lastAttendedAt: daysAgo(17), fees: { planType: "credits", creditBalance: 1 } }));
    expect(result.level).toBe("at_risk");
    expect(result.reasons.find((reason) => reason.code === "renewal_credits")?.label).toBe("1 credit left");
  });

  it("three misses in a row is at risk on its own, and high inside the renewal window", () => {
    expect(assessRisk(snapshot({ attendance: missed(3, 10, 17), lastAttendedAt: daysAgo(24) })).level).toBe("at_risk");
    expect(assessRisk(snapshot({ attendance: missed(3, 10, 17), lastAttendedAt: daysAgo(24), fees: { planType: "credits", creditBalance: 0 } })).level).toBe("high");
  });

  it("counts one attendance problem once, not as a streak plus a gap plus a low rate", () => {
    const result = assessRisk(snapshot({ attendance: missed(3, 10, 17), lastAttendedAt: daysAgo(40) }));
    expect(result.reasons.filter((reason) => ["missed_streak", "no_class", "low_attendance"].includes(reason.code))).toHaveLength(1);
  });

  it("a renewal window on its own is not a risk", () => {
    expect(assessRisk(snapshot({ fees: { planType: "credits", creditBalance: 0 } }))).toEqual({ level: "none", reasons: [], inWindow: false });
  });

  it("does not flag a brand-new student for having no classes yet", () => {
    expect(assessRisk(snapshot({ joinedAt: daysAgo(5), attendance: [], lastAttendedAt: null })).level).toBe("none");
  });

  it("flags a student who joined weeks ago and never attended", () => {
    const result = assessRisk(snapshot({ joinedAt: daysAgo(25), attendance: [], lastAttendedAt: null }));
    expect(result.reasons[0]).toMatchObject({ code: "no_class", severity: "strong" });
  });

  it("only flags stopped practice for a student who used to practise", () => {
    expect(assessRisk(snapshot({ lastPracticeAt: null })).level).toBe("none");
    expect(assessRisk(snapshot({ lastPracticeAt: daysAgo(30) })).reasons[0].code).toBe("practice_stopped");
  });

  it("adds up separate engagement signals", () => {
    const result = assessRisk(snapshot({
      latestEffort: 2,
      homework: [{ dueAt: daysAgo(2), submitted: false }, { dueAt: daysAgo(9), submitted: false }, { dueAt: daysAgo(16), submitted: false }],
    }));
    expect(result.level).toBe("at_risk");
  });

  it("a pause that ended days ago without a return is worth a call", () => {
    const result = assessRisk(snapshot({ pause: { pausedFrom: daysAgo(30), pausedUntil: daysAgo(4) } }));
    expect(result.level).toBe("at_risk");
    expect(result.reasons[0].code).toBe("pause_overdue");
  });

  it("ignores attendance while a student is paused", () => {
    const result = assessRisk(snapshot({
      attendance: missed(3, 10, 17),
      lastAttendedAt: daysAgo(40),
      pause: { pausedFrom: daysAgo(20), pausedUntil: daysAhead(20) },
    }));
    expect(result.level).toBe("none");
  });

  it("a second pause in six months, close to its end, is worth a call", () => {
    const result = assessRisk(snapshot({ pause: { pausedFrom: daysAgo(20), pausedUntil: daysAhead(5) }, recentPauseCount: 2 }));
    expect(result.level).toBe("at_risk");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["pause_ending", "repeat_pause"]);
  });

  it("never flags a student who has left", () => {
    expect(assessRisk(snapshot({ isActive: false, attendance: missed(3, 10, 17) })).level).toBe("none");
  });

  it("steps down as the student comes back, and clears once they are regular again", () => {
    const before = assessRisk(snapshot({ attendance: missed(3, 10, 17), lastAttendedAt: daysAgo(24) }));
    // One class back breaks the streak, but 1 of 4 in a month is still low.
    const oneBack = assessRisk(snapshot({ attendance: [{ date: daysAgo(1), status: "present" }, ...missed(8, 15, 22)], lastAttendedAt: daysAgo(1) }));
    const regular = assessRisk(snapshot({
      attendance: [1, 4, 8, 11, 15].map((n) => ({ date: daysAgo(n), status: "present" })).concat(missed(18, 25)),
      lastAttendedAt: daysAgo(1),
    }));
    expect(before.level).toBe("at_risk");
    expect(oneBack.level).toBe("watch");
    expect(regular).toEqual({ level: "none", reasons: [], inWindow: false });
  });
});

describe("levelFor", () => {
  it("two strong signs are high", () => {
    expect(levelFor([
      { code: "a", severity: "strong", label: "", detail: "", coachSafe: true },
      { code: "b", severity: "strong", label: "", detail: "", coachSafe: true },
    ])).toBe("high");
  });
});

describe("coachHeadsUp", () => {
  it("tells the coach about the class only, never fees or pauses", () => {
    const result = assessRisk(snapshot({ attendance: missed(3, 10, 17), lastAttendedAt: daysAgo(24), fees: { planType: "credits", creditBalance: 0 } }));
    const note = coachHeadsUp("Aarav Sharma", result.reasons)!;
    expect(note.title).toBe("Aarav may be drifting away");
    expect(note.message).toContain("Missed 3 classes in a row");
    expect(note.message).not.toMatch(/credit|fee|invoice/i);
  });

  it("sends nothing when no reason is about the class", () => {
    const result = assessRisk(snapshot({ pause: { pausedFrom: daysAgo(30), pausedUntil: daysAgo(4) } }));
    expect(coachHeadsUp("Aarav", result.reasons)).toBeNull();
  });
});
