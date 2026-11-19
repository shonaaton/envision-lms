import { describe, expect, it } from "vitest";

import { buildPayEvents, freeClassesForClassroom, summarizePayEvents } from "@/lib/coachPay";
import { groupInvoiceLines } from "@/lib/staffInvoice";
import { coachDecisionSentence } from "@/lib/coachNoShowNotifications";

const COACH = "aaaaaaaaaaaaaaaaaaaaaaa1";
const SUB = "aaaaaaaaaaaaaaaaaaaaaaa2";
const CLASSROOM = "bbbbbbbbbbbbbbbbbbbbbbb1";

function session(id: string, day: number, status = "completed", extra: Record<string, any> = {}) {
  return {
    _id: id,
    sessionNumber: day,
    topicName: `Topic ${day}`,
    scheduledFor: new Date(`2026-11-${String(day).padStart(2, "0")}T00:00:00`),
    startTime: "17:00",
    durationMinutes: 60,
    status,
    ...extra,
  };
}

function classroom(sessions: any[]) {
  return {
    _id: CLASSROOM,
    title: "Viaan 1:1",
    classroomType: "series",
    coach: { _id: COACH, name: "Asha" },
    batches: [],
    students: [{ _id: "s1" }],
    durationMinutes: 60,
    generatedSessions: sessions,
  };
}

function ruling(overrides: Record<string, any> = {}) {
  return {
    classroom: CLASSROOM,
    sessionId: "missed",
    sessionDate: new Date("2026-11-18T11:30:00Z"),
    coach: { _id: COACH, name: "Asha" },
    classroomTitle: "Viaan 1:1",
    chargeFine: false,
    fineAmount: 0,
    freeNextClass: true,
    ...overrides,
  };
}

const rates = [{ _id: "r1", scope: "academy", isActive: true, effectiveFrom: new Date(0), regular: { amount: 30000, unit: "per_class" } }];
const november = { from: new Date("2026-11-01"), to: new Date("2026-11-30T23:59:59.999") };

function build(sessions: any[], coachRulings: any[]) {
  return buildPayEvents({ classrooms: [classroom(sessions)], rates, overrides: [], rulings: [], coachRulings, conversions: new Map(), range: november });
}

describe("coach no-show: free next class", () => {
  it("leaves the coach's next taught class unpaid, and only that one", () => {
    const events = build(
      [session("before", 11), session("missed", 18, "coach_no_show"), session("next", 20), session("after", 22)],
      [ruling()]
    );
    const byId = Object.fromEntries(events.map((event) => [event.sessionId, event]));
    expect(byId.before.status).toBe("payable");
    expect(byId.next.status).toBe("declined");
    expect(byId.next.amount).toBe(0);
    expect(byId.next.note).toMatch(/Free make-up class/);
    expect(byId.after.status).toBe("payable");
    // The missed class itself is never a pay line.
    expect(byId.missed).toBeUndefined();
  });

  it("rolls on past a cancelled class and a class a substitute taught", () => {
    const free = freeClassesForClassroom(
      classroom([
        session("missed", 18, "coach_no_show"),
        session("cancelled", 19, "cancelled"),
        session("subbed", 20, "completed", { substituteCoach: { _id: SUB, name: "Sub" } }),
        session("own", 22),
      ]),
      [ruling()]
    );
    expect(Array.from(free.keys())).toEqual(["own"]);
  });

  it("makes two classes free for two misses, never the same one twice", () => {
    const free = freeClassesForClassroom(
      classroom([
        session("missed", 18, "coach_no_show"),
        session("missed2", 19, "coach_no_show"),
        session("a", 20),
        session("b", 22),
      ]),
      [ruling(), ruling({ sessionId: "missed2", sessionDate: new Date("2026-11-19T11:30:00Z") })]
    );
    expect(Array.from(free.keys()).sort()).toEqual(["a", "b"]);
  });

  it("drops the free class once the missed class is corrected to another outcome", () => {
    const free = freeClassesForClassroom(classroom([session("missed", 18, "completed"), session("next", 20)]), [ruling()]);
    expect(free.size).toBe(0);
  });
});

describe("coach no-show: fine", () => {
  it("is a negative line on the missed class's month, and comes off the total", () => {
    const events = build([session("missed", 18, "coach_no_show"), session("next", 20)], [ruling({ chargeFine: true, fineAmount: 20000, freeNextClass: false })]);
    const fine = events.find((event) => event.kind === "noShowFine");
    expect(fine).toMatchObject({ amount: -20000, status: "payable", coachId: COACH });
    const summary = summarizePayEvents(events);
    expect(summary.fineAmount).toBe(-20000);
    expect(summary.totalAmount).toBe(30000 - 20000);
    expect(summary.payableClasses).toBe(1);
  });

  it("is left out when the class is no longer a coach no-show", () => {
    const events = build([session("missed", 18, "completed")], [ruling({ chargeFine: true, fineAmount: 20000 })]);
    expect(events.some((event) => event.kind === "noShowFine")).toBe(false);
  });

  it("appears on the coach's invoice as its own deduction row", () => {
    const events = build([session("missed", 18, "coach_no_show"), session("next", 20)], [ruling({ chargeFine: true, fineAmount: 20000, freeNextClass: false })]);
    const { groups } = groupInvoiceLines(events);
    const fineRow = groups.find((group) => group.group === "fine");
    expect(fineRow).toMatchObject({ quantity: 1, amount: -20000, kind: "noShowFine" });
    expect(groups[groups.length - 1]).toBe(fineRow);
  });
});

describe("coachDecisionSentence", () => {
  it("names the fine and the free class", () => {
    expect(coachDecisionSentence({ chargeFine: true, fineAmount: 30000, freeNextClass: true })).toBe(
      "a fine of Rs 300 is deducted from your pay, and your next class in this batch is unpaid because it is free for the family. The missed class is not paid."
    );
    expect(coachDecisionSentence({ chargeFine: false, fineAmount: 0, freeNextClass: false })).toBe("no fine this time, and the missed class is not paid.");
  });
});
