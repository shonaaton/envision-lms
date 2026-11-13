import { describe, expect, it, vi } from "vitest";

import { resolvePayPeriod } from "@/lib/payPeriods";

const mocks = vi.hoisted(() => ({
  loadCoachPay: vi.fn(),
  invoices: vi.fn(),
  payments: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/coachPayData", () => ({ loadCoachPay: mocks.loadCoachPay }));
vi.mock("@/models/Fee", () => ({
  Invoice: { find: () => ({ select: () => ({ lean: mocks.invoices }) }) },
}));
vi.mock("@/models/Payment", () => ({
  Payment: { find: () => ({ select: () => ({ lean: mocks.payments }) }) },
}));

import { loadCoachProfitability } from "@/lib/coachProfitability";

describe("coach profitability", () => {
  it("splits net collections once, preserves payroll costs and reports unmatched fees", async () => {
    const period = resolvePayPeriod({ period: "month", month: "2026-11" });
    const event = (sessionId: string, coachId: string, isDemoClass = false) => ({
      sessionId, coachId, classroomId: "room", sessionStatus: "completed", kind: "regular", isDemoClass,
    });
    const coach = (coachId: string, totalAmount: number) => ({
      coachId, coachName: coachId, totalAmount, unpriced: 0, pendingReview: 0,
    });
    mocks.loadCoachPay.mockResolvedValue({
      events: [event("1", "a"), event("2", "a"), event("3", "b"), event("4", "c", true)],
      classrooms: [{
        _id: "room",
        students: ["student", "former"],
        studentExits: [{ student: "former", exitedAt: new Date("2026-10-31T00:00:00Z") }],
        generatedSessions: ["1", "2", "3", "4"].map((_id) => ({ _id, scheduledFor: period.from })),
      }],
      summary: {
        rows: [coach("a", 100), coach("b", 400), coach("c", 150)],
        totalAmount: 650, unpriced: 0, pendingReview: 0,
      },
    });
    mocks.invoices.mockResolvedValue([
      {
        student: "student", totalAmount: 1180, gstAmount: 180, paidAt: period.to,
        paymentTransactions: [
          { amount: 590, paidAt: new Date(period.from.getTime() - 1) },
          { amount: 590, paidAt: period.to },
        ],
      },
      { student: "former", totalAmount: 250, paidAt: period.from },
    ]);
    mocks.payments.mockResolvedValue([]);

    const report = await loadCoachProfitability(period);
    expect(report.revenue).toBe(500);
    expect(report.cost).toBe(650);
    expect(report.unallocatedRevenue).toBe(250);
    expect(report.rows.map(({ coachId, revenue, cost }) => ({ coachId, revenue, cost }))).toEqual([
      { coachId: "a", revenue: 333, cost: 100 },
      { coachId: "b", revenue: 167, cost: 400 },
      { coachId: "c", revenue: 0, cost: 150 },
    ]);
  });
});
