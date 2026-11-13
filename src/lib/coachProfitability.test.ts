import { describe, expect, it, vi } from "vitest";
import { resolvePayPeriod } from "@/lib/payPeriods";
import { buildPayEvents } from "@/lib/coachPay";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/coachPayData", () => ({ loadCoachPay: vi.fn() }));
vi.mock("@/models/Fee", () => ({ Invoice: {} }));
vi.mock("@/models/User", () => ({ User: {} }));

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
});
