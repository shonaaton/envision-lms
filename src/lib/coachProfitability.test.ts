import { describe, expect, it, vi } from "vitest";
import { resolvePayPeriod } from "@/lib/payPeriods";
import { buildPayEvents } from "@/lib/coachPay";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/coachPayData", () => ({ loadCoachPay: vi.fn() }));
vi.mock("@/models/Fee", () => ({ Invoice: {} }));
vi.mock("@/models/User", () => ({ User: {} }));
vi.mock("@/models/Classroom", () => ({ Classroom: {} }));

import { buildCoachProfitability } from "@/lib/coachProfitability";

const period = resolvePayPeriod({ period: "month", month: "2026-10" });
const coach = { _id: "coach", name: "Regular", role: "instructor" };
const substitute = { _id: "cover", name: "Vaibhav", role: "instructor" };
const admin = { _id: "admin", name: "Admin", role: "admin" };
const people = [coach, substitute, admin, { _id: "s1", name: "Student 1" }, { _id: "s2", name: "Student 2" }];

function fixture() {
  const classrooms = [{
    _id: "room", title: "Group", coach, students: ["s1", "s2"], classroomType: "series",
    generatedSessions: [
      { _id: "one", scheduledFor: new Date("2026-10-05T10:00:00Z"), status: "completed", durationMinutes: 60 },
      { _id: "two", scheduledFor: new Date("2026-10-12T10:00:00Z"), status: "completed", durationMinutes: 60, substituteCoach: substitute, conductedBy: admin },
    ],
  }];
  const events = buildPayEvents({
    classrooms,
    range: period,
    plans: [
      { coach: substitute, type: "monthly", monthlyAmount: 100000, effectiveFrom: new Date("2026-01-01") },
      { coach: admin, type: "monthly", monthlyAmount: 900000, effectiveFrom: new Date("2026-01-01") },
    ],
    rates: [{ _id: "rate", scope: "academy", effectiveFrom: new Date("2026-01-01"), regular: { amount: 30000, unit: "per_class" }, substitute: { amount: 50000, unit: "per_class" } }],
    overrides: [], rulings: [], conversions: new Map(),
  });
  return { classrooms, events };
}

describe("coach profitability", () => {
  it("recognises annual and quarterly packages after GST per completed session", () => {
    const { classrooms, events } = fixture();
    const report = buildCoachProfitability(period, events, classrooms, [
      { student: "s1", type: "manual", totalAmount: 2500000, gstAmount: 381356, coverageSessions: 96, issueDate: new Date("2026-09-01"), dueDate: new Date("2026-09-01") },
      { student: "s2", type: "monthly", totalAmount: 800000, gstAmount: 122034, coverageSessions: 24, issueDate: new Date("2026-09-01"), dueDate: new Date("2026-09-01") },
    ], people);
    expect(report.revenue).toBe(Math.round(2118644 * 2 / 96) + Math.round(677966 * 2 / 24));
    expect(report.missingFees).toBe(0);
  });

  it("limits the final eight-session invoice across months and classroom transfers", () => {
    const { classrooms, events } = fixture();
    const previousRoom = {
      _id: "old-room", students: ["s1"], classroomType: "series",
      generatedSessions: Array.from({ length: 7 }, (_, i) => ({
        _id: `old-${i}`, scheduledFor: new Date(`2026-09-${10 + i}T10:00:00Z`), status: "completed",
      })),
    };
    const report = buildCoachProfitability(period, events, classrooms, [{
      student: "s1", type: "monthly", totalAmount: 236000, gstAmount: 36000, coverageSessions: 8,
      issueDate: new Date("2026-09-01"), dueDate: new Date("2026-09-01"),
    }], people, [...classrooms, previousRoom]);
    expect(report.revenue).toBe(25000);
    expect(report.rows.flatMap((row) => row.classes).flatMap((item) => item.students)
      .filter((student) => student.id === "s1" && student.missingFee)).toHaveLength(1);
  });

  it("uses remaining purchased credits before a later bulk recharge", () => {
    const { classrooms, events } = fixture();
    const report = buildCoachProfitability(period, events, classrooms, [
      { student: "s1", type: "credits", totalAmount: 100001, credits: 1, dueDate: new Date("2026-09-01") },
      { student: "s1", type: "credits", totalAmount: 400000, credits: 8, dueDate: period.from },
    ], people);
    expect(report.revenue).toBe(150001);
  });

  it.each([
    { type: "manual", coverageSessions: 32 },
    { type: "manual", credits: 32 },
    { type: "credits", credits: 32 },
  ])("recognises only held sessions of a 32-session package: %j", (packageFields) => {
    const { classrooms } = fixture();
    classrooms[0].generatedSessions[1].status = "scheduled";
    const events = buildPayEvents({
      classrooms, range: period, plans: [], rates: [],
      overrides: [], rulings: [], conversions: new Map(),
    });
    const report = buildCoachProfitability(period, events, classrooms, [{
      student: "s1", totalAmount: 3434243, coverageMonths: 1,
      issueDate: period.from, dueDate: period.from, ...packageFields,
    }], people);
    expect(report.revenue).toBe(107320);
    expect(report.unallocatedRevenue).toBe(0);
    expect(report.rows.flatMap((row) => row.classes)).toHaveLength(1);
  });

  it("keeps custom session packages available in later months without recognising unused sessions", () => {
    const { classrooms, events } = fixture();
    const report = buildCoachProfitability(period, events, classrooms, [{
      student: "s1", type: "manual", totalAmount: 3200000, coverageSessions: 32,
      issueDate: new Date("2026-08-01"), dueDate: new Date("2026-08-01"),
    }, {
      student: "unmatched", type: "manual", totalAmount: 3200000, coverageSessions: 32,
      issueDate: period.from, dueDate: period.from,
    }], people);
    expect(report.revenue).toBe(200000);
    expect(report.unallocatedRevenue).toBe(0);
  });

  it("adds each student's monthly class share and assigns substitutions to the fixed-salary coach", () => {
    const { classrooms, events } = fixture();
    const bills = [
      { student: "s1", type: "monthly", totalAmount: 236000, gstAmount: 36000, dueDate: period.from },
      { student: "s2", type: "monthly", totalAmount: 300000, dueDate: period.from },
      { student: "unmatched", type: "monthly", totalAmount: 70000, dueDate: period.from },
    ];
    const report = buildCoachProfitability(period, events, classrooms, bills, people);
    expect(report.rows.map((row) => row.coachId).sort()).toEqual(["coach", "cover"]);
    expect(report.revenue).toBe(500000);
    expect(report.cost).toBe(130000);
    expect(report.unallocatedRevenue).toBe(70000);
    const cover = report.rows.find((row) => row.coachId === "cover")!;
    expect(cover.substitutions).toBe(1);
    expect(cover.monthlyCost).toBe(100000);
    expect(cover.classes[0].cost).toBe(0);
    expect(cover.classes[0].students.map((student) => student.revenue)).toEqual([100000, 150000]);
    expect(cover.revenue).toBe(250000);
  });

  it("charges a per-class substitute and uses package unit price across months", () => {
    const { classrooms } = fixture();
    const events = buildPayEvents({
      classrooms, range: period, plans: [],
      rates: [{ _id: "rate", scope: "academy", effectiveFrom: new Date("2026-01-01"), regular: { amount: 30000, unit: "per_class" }, substitute: { amount: 50000, unit: "per_class" } }],
      overrides: [], rulings: [], conversions: new Map(),
    });
    const report = buildCoachProfitability(period, events, classrooms, [
      { student: "s1", type: "credits", totalAmount: 400000, credits: 8, dueDate: new Date("2026-09-01") },
    ], people);
    expect(report.rows.find((row) => row.coachId === "cover")?.cost).toBe(50000);
    expect(report.revenue).toBe(100000);
    expect(report.missingFees).toBe(1);
  });

  it("spreads a multi-month custom invoice evenly over the months it covers", () => {
    const { classrooms, events } = fixture();
    const report = buildCoachProfitability(period, events, classrooms, [
      // A 12-month package raised in May: October is its sixth month.
      { student: "s1", type: "manual", totalAmount: 1200000, coverageMonths: 12, issueDate: new Date("2026-05-14T06:00:00Z"), dueDate: new Date("2026-05-21T06:00:00Z") },
      // One month by default, so a September custom invoice does not reach October.
      { student: "s2", type: "manual", totalAmount: 300000, issueDate: new Date("2026-09-20T06:00:00Z"), dueDate: new Date("2026-10-20T06:00:00Z") },
    ], people);
    expect(report.revenue).toBe(100000);
    expect(report.missingFees).toBe(1);
    expect(report.rows.flatMap((row) => row.classes).flatMap((item) => item.students)
      .filter((student) => student.id === "s1").map((student) => student.revenue)).toEqual([50000, 50000]);
  });

  it("counts a one-month custom invoice in its invoice month", () => {
    const { classrooms, events } = fixture();
    const report = buildCoachProfitability(period, events, classrooms, [
      { student: "s1", type: "manual", totalAmount: 285000, issueDate: new Date("2026-10-07T06:00:00Z"), dueDate: new Date("2026-10-07T06:00:00Z") },
      { student: "s2", type: "manual", totalAmount: 285000, issueDate: new Date("2026-11-07T06:00:00Z"), dueDate: new Date("2026-11-07T06:00:00Z") },
    ], people);
    expect(report.revenue).toBe(285000);
    expect(report.missingFees).toBe(1);
  });

  it("uses a credit recharge raised later on the same day as the class", () => {
    const { classrooms, events } = fixture();
    const report = buildCoachProfitability(period, events, classrooms, [
      // The class is at 15:30 IST on 5 Oct; the recharge was raised at 17:30 and falls due the next day.
      { student: "s1", type: "credits", totalAmount: 400000, credits: 8, issueDate: new Date("2026-10-05T12:00:00Z"), dueDate: new Date("2026-10-06T12:00:00Z") },
      { student: "s2", type: "monthly", totalAmount: 300000, dueDate: period.from },
    ], people);
    expect(report.missingFees).toBe(0);
    expect(report.revenue).toBe(400000);
  });
});
