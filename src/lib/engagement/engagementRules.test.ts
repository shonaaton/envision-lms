import { describe, expect, it } from "vitest";
import {
  DIGEST_TEMPLATE,
  NUDGE_TEMPLATE,
  decideWeeklyMessage,
  engagementWeekKey,
  inSendWindow,
  pickTask,
  type WeeklyAudience,
  type WeeklySnapshot,
} from "./engagementRules";

const DAY = 86_400_000;
// Sunday 25 Oct 2026, 18:30 IST.
const NOW = new Date("2026-10-25T13:00:00Z");

const audience: WeeklyAudience = { role: "student", accountStatus: "enrolled", isActive: true, isPaused: false, optedOut: false, phone: "9876543210", inClass: true };

function snapshot(overrides: Partial<WeeklySnapshot> = {}): WeeklySnapshot {
  return {
    studentName: "Aarav",
    classesScheduled: 2,
    classesAttended: 2,
    homeworkSubmitted: 1,
    puzzlesSolved: 10,
    lessonsCompleted: 2,
    xpEarned: 120,
    nextClassAt: new Date("2026-10-31T11:30:00Z"),
    lastActivityAt: new Date(NOW.getTime() - 1 * DAY),
    lastSeenAt: new Date(NOW.getTime() - 1 * DAY),
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    task: pickTask({ pendingHomework: null, canLearnChess: true }),
    ...overrides,
  };
}

const decide = (snap: WeeklySnapshot, extra: Partial<Parameters<typeof decideWeeklyMessage>[0]> = {}) =>
  decideWeeklyMessage({ audience, snapshot: snap, now: NOW, portalUrl: "https://lms.test/", previousKind: null, ...extra });

describe("engagementWeekKey", () => {
  it("is the Monday of the academy week, Sunday included", () => {
    expect(engagementWeekKey(NOW)).toBe("2026-10-19");
    // Monday 00:10 IST is Sunday 18:40 UTC - already the next week in India.
    expect(engagementWeekKey(new Date("2026-10-25T18:40:00Z"))).toBe("2026-10-26");
  });

  it("does not shift the day for 00:xx IST (prod ICU prints hour 24)", () => {
    // Sunday 00:30 IST.
    expect(engagementWeekKey(new Date("2026-10-24T19:00:00Z"))).toBe("2026-10-19");
  });
});

describe("inSendWindow", () => {
  it("opens on Sunday at 18:00 IST and closes at 22:00", () => {
    expect(inSendWindow(new Date("2026-10-25T12:29:00Z"))).toBe(false); // 17:59
    expect(inSendWindow(new Date("2026-10-25T12:30:00Z"))).toBe(true); // 18:00
    expect(inSendWindow(new Date("2026-10-25T16:29:00Z"))).toBe(true); // 21:59
    expect(inSendWindow(new Date("2026-10-25T16:30:00Z"))).toBe(false); // 22:00
  });

  it("is closed on other days", () => {
    expect(inSendWindow(new Date("2026-10-24T13:00:00Z"))).toBe(false); // Saturday 18:30
  });
});

describe("decideWeeklyMessage", () => {
  it("sends an active student the digest with the week's numbers", () => {
    const decision = decide(snapshot());
    expect(decision.kind).toBe("digest");
    if (decision.kind !== "digest") return;
    expect(decision.templateName).toBe(DIGEST_TEMPLATE);
    expect(decision.bodyParameters).toEqual(["Aarav", "2", "2", "1", "12", expect.stringContaining("31 Oct"), "https://lms.test/dashboard"]);
  });

  it("nudges a student idle for a week and names the task", () => {
    const decision = decide(snapshot({ lastActivityAt: new Date(NOW.getTime() - 9 * DAY), lastSeenAt: new Date(NOW.getTime() - 8 * DAY) }));
    expect(decision.kind).toBe("nudge");
    if (decision.kind !== "nudge") return;
    expect(decision.templateName).toBe(NUDGE_TEMPLATE);
    expect(decision.bodyParameters).toEqual(["Aarav", "8", "the next Learn Chess lesson", "https://lms.test/learn"]);
  });

  it("a recent portal visit counts as active even with no practice", () => {
    const decision = decide(snapshot({ lastActivityAt: null, lastSeenAt: new Date(NOW.getTime() - 2 * DAY) }));
    expect(decision.kind).toBe("digest");
  });

  it("never nudges two weeks running: the week after a nudge gets the digest", () => {
    const idle = snapshot({ lastActivityAt: null, lastSeenAt: null, joinedAt: new Date(NOW.getTime() - 60 * DAY) });
    expect(decide(idle).kind).toBe("nudge");
    expect(decide(idle, { previousKind: "nudge" }).kind).toBe("digest");
  });

  it("skips a week with nothing to report after a nudge", () => {
    const empty = snapshot({ classesScheduled: 0, classesAttended: 0, homeworkSubmitted: 0, puzzlesSolved: 0, lessonsCompleted: 0, lastActivityAt: null, lastSeenAt: null });
    expect(decide(empty, { previousKind: "nudge" })).toEqual({ kind: "skip", reason: "nothing_to_report" });
  });

  it.each([
    ["paused", { isPaused: true }],
    ["opted_out", { optedOut: true }],
    ["demo", { accountStatus: "demo" }],
    ["no_phone", { phone: " " }],
    ["inactive", { isActive: false }],
    ["not_in_class", { inClass: false }],
  ] as const)("skips %s students", (reason, change) => {
    expect(decideWeeklyMessage({ audience: { ...audience, ...change }, snapshot: snapshot(), now: NOW, portalUrl: "https://lms.test" })).toEqual({ kind: "skip", reason });
  });
});

describe("pickTask", () => {
  it("prefers pending homework, then Learn Chess, then puzzles", () => {
    expect(pickTask({ pendingHomework: { id: "h1", title: "Forks" }, canLearnChess: true })).toMatchObject({ kind: "homework", label: 'the homework "Forks"', href: "/homework/h1" });
    expect(pickTask({ pendingHomework: null, canLearnChess: true }).kind).toBe("learn");
    expect(pickTask({ pendingHomework: null, canLearnChess: false }).kind).toBe("tactics");
  });
});
