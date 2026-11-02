import { describe, expect, it } from "vitest";
import {
  childNames,
  dailyTarget,
  daysLeftInMonth,
  familyCallSchema,
  familyKeyOf,
  missedMessage,
  monthKeyOf,
  oneLine,
  queueState,
  recentlyCalled,
  summaryMessage,
  talkingPoints,
  type QueueInput,
} from "@/lib/retention/familyRules";
import type { RiskSnapshot } from "@/lib/retention/riskRules";

// 2 Nov 2026, 11:30 IST
const NOW = new Date("2026-11-02T06:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const STUDENT = "64b000000000000000000001";

function snapshot(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    now: NOW,
    isActive: true,
    joinedAt: daysAgo(200),
    attendance: [
      { date: daysAgo(3), status: "present" },
      { date: daysAgo(10), status: "present" },
    ],
    lastAttendedAt: daysAgo(3),
    homework: [],
    lastPracticeAt: daysAgo(2),
    latestEffort: 4,
    coachChangedAt: null,
    fees: {},
    pause: null,
    recentPauseCount: 0,
    ...overrides,
  };
}

function queue(overrides: Partial<QueueInput> = {}): QueueInput {
  return { flagLevel: "none", renewalSoon: false, lastConnectedAt: daysAgo(40), callsThisMonth: [], pendingCallbackAt: null, ...overrides };
}

describe("familyKeyOf", () => {
  it("puts siblings on one phone in one family", () => {
    const a = familyKeyOf({ _id: "a", phone: "98765 43210", countryCode: "+91" });
    const b = familyKeyOf({ _id: "b", phone: "+919876543210", countryCode: "+91" });
    expect(a).toBe(b);
    expect(a.startsWith("phone:")).toBe(true);
  });

  it("prefers the stored canonical phone and falls back to the student id", () => {
    expect(familyKeyOf({ _id: "x", phoneCanonical: "919876543210" })).toBe("phone:919876543210");
    expect(familyKeyOf({ _id: "x" })).toBe("student:x");
  });
});

describe("recentlyCalled (the 15-day rule)", () => {
  it("holds back inside 15 days and lets go after", () => {
    expect(recentlyCalled(daysAgo(14), NOW)).toBe(true);
    expect(recentlyCalled(daysAgo(16), NOW)).toBe(false);
    expect(recentlyCalled(null, NOW)).toBe(false);
  });
});

describe("monthKeyOf", () => {
  it("uses the academy's time zone", () => {
    // 31 Oct 20:00 UTC is already 1 Nov in India.
    expect(monthKeyOf(new Date("2026-10-31T20:00:00.000Z"))).toBe("2026-11");
  });
});

describe("childNames", () => {
  it("joins first names", () => {
    expect(childNames(["Aarav Sharma"])).toBe("Aarav");
    expect(childNames(["Aarav Sharma", "Riya Sharma"])).toBe("Aarav and Riya");
    expect(childNames(["A B", "C D", "E F"])).toBe("A, C and E");
  });
});

describe("talkingPoints", () => {
  it("lists what the child is not doing before what is going well", () => {
    const points = talkingPoints(snapshot({
      attendance: [
        { date: daysAgo(3), status: "absent" },
        { date: daysAgo(10), status: "present" },
        { date: daysAgo(17), status: "present" },
      ],
      homework: [
        { dueAt: daysAgo(2), submitted: false },
        { dueAt: daysAgo(9), submitted: false },
        { dueAt: daysAgo(16), submitted: true },
      ],
      lastPracticeAt: daysAgo(18),
      latestEffort: 2,
    }), { lastSeenAt: daysAgo(20), pendingExam: { label: "Beginner Level 2", availableUntil: null, started: false } });
    const codes = points.map((point) => point.code);
    expect(codes).toEqual(["attendance", "homework", "practice", "portal", "effort", "exam"]);
    expect(points[1].label).toContain("2 of the last 3");
    expect(points[1].label).toContain("last 2 in a row");
    expect(points[2].label).toContain("18 days");
  });

  it("says a child who never practised is not using the portal", () => {
    const points = talkingPoints(snapshot({ lastPracticeAt: null }), { lastSeenAt: daysAgo(1) });
    expect(points.find((point) => point.code === "practice")?.label).toMatch(/Not practising/);
  });

  it("gives the good news too", () => {
    const points = talkingPoints(snapshot({ homework: [{ dueAt: daysAgo(2), submitted: true }, { dueAt: daysAgo(9), submitted: true }] }), { lastSeenAt: daysAgo(1), puzzlesLast30: 12, lessonsLast30: 3 });
    expect(points.every((point) => point.tone === "good")).toBe(true);
    expect(points.map((point) => point.code)).toEqual(["attendance_good", "homework_good", "practice_good"]);
  });

  it("skips class-side points while paused", () => {
    const points = talkingPoints(snapshot({
      attendance: [{ date: daysAgo(3), status: "absent" }],
      pause: { pausedFrom: daysAgo(10), pausedUntil: new Date(NOW.getTime() + 20 * 86_400_000) },
    }), { lastSeenAt: daysAgo(1) });
    expect(points.map((point) => point.code)).toEqual(["pause"]);
  });
});

describe("queueState", () => {
  it("marks a family done once a call connected this month", () => {
    const state = queueState(queue({ callsThisMonth: [{ at: daysAgo(1), outcome: "connected" }], lastConnectedAt: daysAgo(1) }), NOW);
    expect(state.state).toBe("done");
    expect(state.dueToday).toBe(false);
  });

  it("puts a due callback first, even on a family called today", () => {
    const state = queueState(queue({ callsThisMonth: [{ at: daysAgo(0), outcome: "callback_requested" }], pendingCallbackAt: NOW }), NOW);
    expect(state.state).toBe("callback");
    expect(state.priority).toBe(100);
    expect(state.dueToday).toBe(true);
  });

  it("brings a missed family back tomorrow, not today", () => {
    const today = queueState(queue({ callsThisMonth: [{ at: new Date(NOW.getTime() - 60_000), outcome: "no_answer" }] }), NOW);
    expect(today.state).toBe("missed");
    expect(today.dueToday).toBe(false);
    const tomorrow = queueState(queue({ callsThisMonth: [{ at: daysAgo(1), outcome: "no_answer" }] }), NOW);
    expect(tomorrow.dueToday).toBe(true);
  });

  it("sinks a family that missed three calls", () => {
    const fresh = queueState(queue(), NOW);
    const unreachable = queueState(queue({ callsThisMonth: [1, 2, 3].map((n) => ({ at: daysAgo(n), outcome: "no_answer" })) }), NOW);
    expect(unreachable.state).toBe("unreachable");
    expect(unreachable.priority).toBeLessThan(fresh.priority);
  });

  it("ranks risk above renewal above an ordinary check-in", () => {
    const high = queueState(queue({ flagLevel: "high" }), NOW).priority;
    const atRisk = queueState(queue({ flagLevel: "at_risk" }), NOW).priority;
    const renewal = queueState(queue({ renewalSoon: true }), NOW).priority;
    const plain = queueState(queue(), NOW).priority;
    expect(high).toBeGreaterThan(atRisk);
    expect(atRisk).toBeGreaterThan(renewal);
    expect(renewal).toBeGreaterThan(plain);
  });

  it("does not hand out a risk call inside the quiet days", () => {
    const state = queueState(queue({ flagLevel: "high", lastConnectedAt: daysAgo(5), callsThisMonth: [{ at: daysAgo(5), outcome: "connected" }] }), NOW);
    expect(state.dueToday).toBe(false);
    const later = queueState(queue({ flagLevel: "high", lastConnectedAt: daysAgo(20) }), NOW);
    expect(later.why[0]).toBe("High risk");
  });
});

describe("daily target", () => {
  it("spreads what is left over the days left", () => {
    expect(daysLeftInMonth(NOW)).toBe(29);
    expect(dailyTarget(58, NOW)).toBe(2);
    expect(dailyTarget(0, NOW)).toBe(0);
  });
});

describe("familyCallSchema", () => {
  const base = { studentId: STUDENT, outcome: "connected", satisfaction: 4, leavingIntent: "no", notes: "Happy with classes." };

  it("needs a score, the leaving question and notes when the call connected", () => {
    const result = familyCallSchema.safeParse({ studentId: STUDENT, outcome: "connected" });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["satisfaction", "leavingIntent", "notes"]));
    expect(familyCallSchema.safeParse(base).success).toBe(true);
  });

  it("needs a time for a callback and nothing else for a missed call", () => {
    expect(familyCallSchema.safeParse({ studentId: STUDENT, outcome: "callback_requested" }).success).toBe(false);
    expect(familyCallSchema.safeParse({ studentId: STUDENT, outcome: "callback_requested", callbackAt: "2026-11-04T12:30:00.000Z" }).success).toBe(true);
    expect(familyCallSchema.safeParse({ studentId: STUDENT, outcome: "no_answer" }).success).toBe(true);
  });

  it("does not ask a family that already left whether they will stop", () => {
    expect(familyCallSchema.safeParse({ ...base, kind: "win_back", leavingIntent: undefined }).success).toBe(true);
  });

  it("only settles a flag after a real conversation", () => {
    const settleFlag = { flagId: STUDENT, outcome: "stayed" };
    expect(familyCallSchema.safeParse({ ...base, settleFlag }).success).toBe(true);
    expect(familyCallSchema.safeParse({ studentId: STUDENT, outcome: "no_answer", settleFlag }).success).toBe(false);
  });
});

describe("messages", () => {
  it("keeps WhatsApp parameters on one line", () => {
    expect(oneLine("Move to\nSaturday   5pm\tbatch")).toBe("Move to Saturday 5pm batch");
    expect(oneLine("x".repeat(400)).length).toBe(300);
  });

  it("thanks the parent and falls back when nothing was agreed", () => {
    const message = summaryMessage({ parentName: "Mrs Sen", callerName: "Priya", children: "Aarav", parentSummary: "", discussed: ["Homework not submitted: 2 of the last 3"] });
    expect(message.whatsappParams).toEqual(["Mrs Sen", "Priya", "Aarav", "We will keep you posted on progress."]);
    expect(message.email).toContain("• Homework not submitted");
  });

  it("tells the family a representative tried to reach them", () => {
    const message = missedMessage({ parentName: "", children: "Aarav and Riya" });
    expect(message.whatsappParams).toEqual(["there", "Aarav and Riya"]);
    expect(message.email).toContain("A representative from Envision Chess Academy tried to reach you");
  });
});
