import { describe, expect, it } from "vitest";

import { amountForRate, buildPayEvents, resolveRate, summarizePayEvents } from "@/lib/coachPay";
import { financialYearOf, resolvePayPeriod } from "@/lib/payPeriods";

const COACH = "aaaaaaaaaaaaaaaaaaaaaaa1";
const OTHER_COACH = "aaaaaaaaaaaaaaaaaaaaaaa2";
const CLASSROOM = "bbbbbbbbbbbbbbbbbbbbbbb1";
const BATCH = "ccccccccccccccccccccccc1";

function card(overrides: Record<string, any>) {
  return { _id: `rate-${Math.random()}`, isActive: true, effectiveFrom: new Date(0), ...overrides };
}

function money(amount: number) {
  return { amount, unit: "per_class" };
}

function session(overrides: Record<string, any> = {}) {
  return {
    _id: "session-1",
    sessionNumber: 3,
    topicName: "Forks",
    scheduledFor: new Date("2026-05-10T00:00:00"),
    startTime: "17:00",
    durationMinutes: 60,
    status: "completed",
    ...overrides,
  };
}

function classroom(overrides: Record<string, any> = {}) {
  return {
    _id: CLASSROOM,
    title: "Intermediate Tactics",
    classroomType: "series",
    coach: { _id: COACH, name: "Asha" },
    batches: [{ _id: BATCH, name: "Tuesday 5pm" }],
    students: [{ _id: "s1" }, { _id: "s2" }],
    durationMinutes: 60,
    generatedSessions: [session()],
    ...overrides,
  };
}

function build(overrides: Partial<Parameters<typeof buildPayEvents>[0]> = {}) {
  return buildPayEvents({
    classrooms: [classroom()],
    rates: [card({ scope: "academy", regular: money(30000) })],
    overrides: [],
    rulings: [],
    conversions: new Map(),
    range: { from: new Date("2026-05-01"), to: new Date("2026-05-31T23:59:59.999") },
    ...overrides,
  });
}

describe("resolveRate", () => {
  const base = { coachId: COACH, classroomId: CLASSROOM, batchIds: [BATCH], date: new Date("2026-05-10") };

  it("prefers the most specific rung that names a price", () => {
    const rates = [
      card({ scope: "academy", regular: money(30000) }),
      card({ scope: "batch", batch: BATCH, regular: money(45000) }),
      card({ scope: "classroom_coach", classroom: CLASSROOM, coach: COACH, regular: money(60000) }),
    ];
    expect(resolveRate({ ...base, kind: "regular", rates })).toMatchObject({ amount: 60000, source: "classroom_coach" });
  });

  it("treats a zero as a real price, not as silence", () => {
    const rates = [
      card({ scope: "academy", demo: money(50000) }),
      card({ scope: "coach", coach: COACH, demo: money(0) }),
    ];
    // This coach is explicitly not paid for demos; the academy default must not
    // quietly pay them anyway.
    expect(resolveRate({ ...base, kind: "demo", rates })).toMatchObject({ amount: 0, source: "coach" });
  });

  it("skips a card that is silent about the kind being asked for", () => {
    const rates = [
      card({ scope: "academy", substitute: money(20000) }),
      card({ scope: "classroom", classroom: CLASSROOM, regular: money(60000) }),
    ];
    // The classroom card is more specific but says nothing about substitutions,
    // so the academy's explicit substitution rate wins over its regular rate.
    expect(resolveRate({ ...base, kind: "substitute", rates })).toMatchObject({ amount: 20000, source: "academy" });
  });

  it("falls back from demo to regular only when no rung prices demos", () => {
    const rates = [card({ scope: "classroom", classroom: CLASSROOM, regular: money(40000) })];
    expect(resolveRate({ ...base, kind: "demo", rates })).toMatchObject({ amount: 40000, kind: "regular" });
  });

  it("never falls back for a conversion bonus", () => {
    const rates = [card({ scope: "academy", regular: money(40000) })];
    expect(resolveRate({ ...base, kind: "demoConversionBonus", rates })).toBeNull();
  });

  it("uses the card in force on the class date, not the newest one", () => {
    const rates = [
      card({ scope: "coach", coach: COACH, regular: money(30000), effectiveFrom: new Date("2026-01-01") }),
      card({ scope: "coach", coach: COACH, regular: money(50000), effectiveFrom: new Date("2026-08-01") }),
    ];
    expect(resolveRate({ ...base, kind: "regular", rates })).toMatchObject({ amount: 30000 });
    expect(resolveRate({ ...base, date: new Date("2026-09-01"), kind: "regular", rates })).toMatchObject({ amount: 50000 });
  });

  it("ignores rates belonging to another coach or batch", () => {
    const rates = [
      card({ scope: "coach", coach: OTHER_COACH, regular: money(90000) }),
      card({ scope: "batch", batch: "ccccccccccccccccccccccc9", regular: money(90000) }),
      card({ scope: "academy", regular: money(30000) }),
    ];
    expect(resolveRate({ ...base, kind: "regular", rates })).toMatchObject({ amount: 30000, source: "academy" });
  });
});

describe("amountForRate", () => {
  it("pays a per-class rate whatever the class length", () => {
    expect(amountForRate({ amount: 50000, unit: "per_class" }, 90)).toBe(50000);
  });

  it("pro-rates an hourly rate by the class length", () => {
    expect(amountForRate({ amount: 60000, unit: "per_hour" }, 90)).toBe(90000);
    expect(amountForRate({ amount: 60000, unit: "per_hour" }, 45)).toBe(45000);
  });
});

describe("buildPayEvents", () => {
  it("pays the assigned coach for a completed class", () => {
    const [event] = build();
    expect(event).toMatchObject({ coachId: COACH, kind: "regular", status: "payable", amount: 30000 });
  });

  it("pays the substitute and nobody else when someone covers", () => {
    const events = build({
      classrooms: [
        classroom({
          generatedSessions: [session({ substituteCoach: { _id: OTHER_COACH, name: "Ravi" } })],
        }),
      ],
      rates: [card({ scope: "academy", regular: money(30000), substitute: money(20000) })],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      coachId: OTHER_COACH,
      kind: "substitute",
      amount: 20000,
      isSubstitution: true,
      substitutedForName: "Asha",
    });
  });

  it("lets a one-off override beat every rate card", () => {
    const events = build({
      overrides: [{ _id: "o1", classroom: CLASSROOM, sessionId: "session-1", coach: COACH, amount: 75000, unit: "per_class", reason: "Agreed cover" }],
    });
    expect(events[0]).toMatchObject({ amount: 75000, rateSource: "session_override", note: "Agreed cover" });
  });

  it("holds a student no-show out of pay until it is ruled on", () => {
    const events = build({
      classrooms: [classroom({ generatedSessions: [session({ status: "student_no_show" })] })],
    });
    expect(events[0]).toMatchObject({ status: "pending_review", amount: 0, exposure: 30000 });
  });

  it("pays a no-show once an admin rules that it should be paid", () => {
    const events = build({
      classrooms: [classroom({ generatedSessions: [session({ status: "student_no_show" })] })],
      rulings: [{ classroom: CLASSROOM, sessionId: "session-1", payCoach: true, deductStudentCredit: false, note: "Coach waited" }],
    });
    expect(events[0]).toMatchObject({ status: "payable", amount: 30000, note: "Coach waited" });
  });

  it("withholds pay when an admin rules against it", () => {
    const events = build({
      classrooms: [classroom({ generatedSessions: [session({ status: "student_no_show" })] })],
      rulings: [{ classroom: CLASSROOM, sessionId: "session-1", payCoach: false, deductStudentCredit: true }],
    });
    expect(events[0]).toMatchObject({ status: "declined", amount: 0 });
  });

  it("never bills a demo the student skipped", () => {
    const events = build({
      classrooms: [
        classroom({
          classroomType: "demo",
          demoBooking: "booking-1",
          generatedSessions: [session({ status: "student_no_show" })],
        }),
      ],
      rates: [card({ scope: "academy", demo: money(25000) })],
    });
    expect(events).toHaveLength(0);
  });

  it("flags a class no rate card covers instead of guessing at zero", () => {
    const events = build({ rates: [] });
    expect(events[0]).toMatchObject({ status: "unpriced", amount: 0, rateSource: "none" });
  });

  it("skips classes that were cancelled or rescheduled", () => {
    const events = build({
      classrooms: [
        classroom({
          generatedSessions: [session({ status: "cancelled" }), session({ _id: "session-2", status: "rescheduled" })],
        }),
      ],
    });
    expect(events).toHaveLength(0);
  });

  it("bills a mirrored session-instance classroom to nobody", () => {
    // Session instances duplicate their parent's sessions; counting them would
    // pay every class twice.
    const events = build({ classrooms: [classroom({ isSessionInstance: true })] });
    expect(events).toHaveLength(0);
  });

  it("dates a conversion bonus at the conversion, not at the demo", () => {
    const demo = classroom({
      classroomType: "demo",
      demoBooking: "booking-1",
      title: "Demo - Meera",
      generatedSessions: [session({ scheduledFor: new Date("2026-03-04T00:00:00") })],
    });
    const rates = [card({ scope: "academy", demo: money(25000), demoConversionBonus: money(100000) })];
    const conversions = new Map([["booking-1", { convertedAt: new Date("2026-05-20T10:00:00"), studentName: "Meera" }]]);

    const may = buildPayEvents({
      classrooms: [demo],
      rates,
      overrides: [],
      rulings: [],
      conversions,
      range: { from: new Date("2026-05-01"), to: new Date("2026-05-31T23:59:59.999") },
    });
    // The demo itself was taught in March, so May shows only the bonus.
    expect(may).toHaveLength(1);
    expect(may[0]).toMatchObject({ kind: "demoConversionBonus", amount: 100000, status: "payable" });

    const march = buildPayEvents({
      classrooms: [demo],
      rates,
      overrides: [],
      rulings: [],
      conversions,
      range: { from: new Date("2026-03-01"), to: new Date("2026-03-31T23:59:59.999") },
    });
    // ...and March keeps the value it was closed at, bonus or no bonus later.
    expect(march).toHaveLength(1);
    expect(march[0]).toMatchObject({ kind: "demo", amount: 25000 });
  });

  it("pays no conversion bonus for a demo that was never taught", () => {
    const events = build({
      classrooms: [
        classroom({
          classroomType: "demo",
          demoBooking: "booking-1",
          generatedSessions: [session({ status: "cancelled" })],
        }),
      ],
      rates: [card({ scope: "academy", demo: money(25000), demoConversionBonus: money(100000) })],
      conversions: new Map([["booking-1", { convertedAt: new Date("2026-05-20"), studentName: "Meera" }]]),
    });
    expect(events).toHaveLength(0);
  });

  it("shows a coach only their own lines", () => {
    const events = build({
      classrooms: [
        classroom(),
        classroom({ _id: "bbbbbbbbbbbbbbbbbbbbbbb2", coach: { _id: OTHER_COACH, name: "Ravi" } }),
      ],
      coachId: OTHER_COACH,
    });
    expect(events).toHaveLength(1);
    expect(events[0].coachId).toBe(OTHER_COACH);
  });
});

describe("summarizePayEvents", () => {
  it("keeps unruled classes out of the total while still reporting their value", () => {
    const events = build({
      classrooms: [
        classroom({
          generatedSessions: [session(), session({ _id: "session-2", status: "student_no_show" })],
        }),
      ],
    });
    const summary = summarizePayEvents(events);
    expect(summary.totalAmount).toBe(30000);
    expect(summary.pendingAmount).toBe(30000);
    expect(summary.pendingReview).toBe(1);
    expect(summary.payableClasses).toBe(1);
  });

  it("splits a coach's total across the kinds of work", () => {
    const events = build({
      classrooms: [
        classroom({ generatedSessions: [session()] }),
        classroom({
          _id: "bbbbbbbbbbbbbbbbbbbbbbb3",
          classroomType: "demo",
          coach: { _id: COACH, name: "Asha" },
          generatedSessions: [session({ _id: "session-9" })],
        }),
      ],
      rates: [card({ scope: "academy", regular: money(30000), demo: money(25000) })],
    });
    const summary = summarizePayEvents(events);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({ regularAmount: 30000, demoAmount: 25000, totalAmount: 55000 });
  });
});

describe("resolvePayPeriod", () => {
  const now = new Date(2026, 4, 15); // 15 May 2026

  it("defaults to the current month", () => {
    const period = resolvePayPeriod({}, now);
    expect(period.preset).toBe("this_month");
    expect(period.from.getMonth()).toBe(4);
    expect(period.to.getDate()).toBe(31);
  });

  it("walks back a month, across a year boundary", () => {
    const period = resolvePayPeriod({ period: "last_month" }, new Date(2026, 0, 9));
    expect(period.from.getFullYear()).toBe(2025);
    expect(period.from.getMonth()).toBe(11);
    expect(period.to.getDate()).toBe(31);
  });

  it("runs a financial year from April to March", () => {
    const period = resolvePayPeriod({ period: "fy", fy: "2025" }, now);
    expect([period.from.getFullYear(), period.from.getMonth(), period.from.getDate()]).toEqual([2025, 3, 1]);
    expect([period.to.getMonth(), period.to.getDate()]).toEqual([2, 31]);
    expect(period.to.getFullYear()).toBe(2026);
    expect(period.label).toBe("FY 2025-26");
  });

  it("reads a backwards custom range as the range the user meant", () => {
    const period = resolvePayPeriod({ period: "range", from: "2026-05-20", to: "2026-05-01" }, now);
    expect(period.from.getTime()).toBeLessThan(period.to.getTime());
  });

  it("puts January in the financial year that opened the previous April", () => {
    expect(financialYearOf(new Date(2026, 0, 15))).toBe(2025);
    expect(financialYearOf(new Date(2026, 4, 15))).toBe(2026);
  });
});
