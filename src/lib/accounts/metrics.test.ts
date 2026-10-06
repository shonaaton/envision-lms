import { describe, expect, it } from "vitest";

import { isAccountsAdmin } from "@/lib/accounts/accessRule";
import { resolveCategory } from "@/lib/accounts/categories";
import {
  computeAccounts,
  emptyMonthInputs,
  grossFromNetPayout,
  growthOf,
  monthsBetween,
  runningSurplus,
  tdsOn,
  type MonthInputs,
} from "@/lib/accounts/metrics";

function month(key: string, patch: Partial<MonthInputs> = {}): MonthInputs {
  return { ...emptyMonthInputs(key), ...patch };
}

describe("computeAccounts", () => {
  it("counts revenue net of GST and keeps GST collected beside it", () => {
    const { months } = computeAccounts([
      month("2026-05", {
        portalGstGross: 118_000_00,
        portalGstTax: 18_000_00,
        portalNonGst: 20_000_00,
        ledgerIncome: { offline_fees: 15_000_00, other_income: 1_000_00 },
      }),
    ]);
    const [may] = months;
    expect(may.revenue.gstPortalNet).toBe(100_000_00);
    expect(may.revenue.offline).toBe(15_000_00);
    expect(may.revenue.otherIncome).toBe(1_000_00);
    expect(may.revenue.total).toBe(136_000_00);
    expect(may.gstCollected).toBe(18_000_00);
    expect(may.liabilities.gstCollected).toBe(18_000_00);
  });

  it("adds non-invoice Razorpay payments and subtracts refunds", () => {
    const [m] = computeAccounts([month("2026-05", { portalNonGst: 10_000_00, portalOtherPayments: 2_000_00, refunds: 500_00 })]).months;
    expect(m.revenue.total).toBe(11_500_00);
  });

  it("ignores portal staff invoices before September 2026 and uses them after", () => {
    const { months } = computeAccounts([
      month("2026-08", { portalTeacherInvoiced: 9_999_00, ledgerExpense: { teacher_pay: 40_000_00 }, ledgerTds: 4_000_00 }),
      month("2026-09", { portalTeacherInvoiced: 50_000_00, portalTeacherNotInvoiced: 5_000_00 }),
    ]);
    const [aug, sep] = months;
    expect(aug.usesPortalTeacherCost).toBe(false);
    expect(aug.cost.teacher).toBe(40_000_00);
    expect(aug.liabilities.tdsWithheld).toBe(4_000_00);
    expect(sep.usesPortalTeacherCost).toBe(true);
    expect(sep.cost.teacher).toBe(55_000_00);
    expect(sep.cost.teacherPortal).toBe(55_000_00);
    // 10% of the gross portal invoices is TDS owed to the government.
    expect(sep.liabilities.tdsWithheld).toBe(5_500_00);
  });

  it("works out gross and net profit, margins and per-student figures both ways", () => {
    const [m] = computeAccounts([
      month("2026-06", {
        portalNonGst: 200_000_00,
        ledgerExpense: { teacher_pay: 80_000_00, rent: 20_000_00, marketing: 30_000_00 },
        payingStudents: 40,
        activeStudents: 50,
        newStudents: 6,
      }),
    ]).months;
    expect(m.cost.total).toBe(130_000_00);
    expect(m.grossProfit).toBe(120_000_00);
    expect(m.grossMargin).toBe(60);
    expect(m.netProfit).toBe(70_000_00);
    expect(m.netMargin).toBe(35);
    expect(m.perPaying).toEqual({ revenue: 5_000_00, cost: 3_250_00, teacherCost: 2_000_00, profit: 1_750_00 });
    expect(m.perActive.revenue).toBe(4_000_00);
    expect(m.perActive.profit).toBe(1_400_00);
    expect(m.cac).toBe(5_000_00);
    // Fixed = rent 20k. Contribution per paying student = (200k - 110k variable) / 40 = 2,250.
    expect(m.cost.fixed).toBe(20_000_00);
    expect(m.breakEvenStudents).toBe(9);
  });

  it("reports a loss per student and leaves per-student blank with no students", () => {
    const [m] = computeAccounts([month("2026-04", { ledgerExpense: { rent: 10_000_00 } })]).months;
    expect(m.netProfit).toBe(-10_000_00);
    expect(m.netMargin).toBeNull();
    expect(m.perPaying.profit).toBeNull();
    expect(m.perActive.cost).toBeNull();
    expect(m.cac).toBeNull();
    expect(m.breakEvenStudents).toBeNull();
  });

  it("keeps GST paid, TDS deposited and owner money out of costs", () => {
    const [m] = computeAccounts([
      month("2026-07", { ledgerNonPl: { gst_paid: 9_000_00, tds_paid: 2_000_00, owner: 50_000_00 }, ledgerExpense: { electricity: 3_000_00 } }),
    ]).months;
    expect(m.cost.total).toBe(3_000_00);
    expect(m.liabilities.gstPaid).toBe(9_000_00);
    expect(m.liabilities.tdsDeposited).toBe(2_000_00);
  });

  it("computes month-on-month growth against the previous month", () => {
    const { months } = computeAccounts([
      month("2026-04", { portalNonGst: 100_000_00, activeStudents: 20 }),
      month("2026-05", { portalNonGst: 125_000_00, activeStudents: 25 }),
    ]);
    expect(months[0].growth.revenue).toBeNull();
    expect(months[1].growth.revenue).toBe(25);
    expect(months[1].growth.activeStudents).toBe(25);
  });

  it("totals money but averages student counts across the period", () => {
    const { total } = computeAccounts([
      month("2026-04", { portalNonGst: 100_000_00, payingStudents: 20, activeStudents: 30, newStudents: 2 }),
      month("2026-05", { portalNonGst: 140_000_00, payingStudents: 30, activeStudents: 40, newStudents: 3 }),
    ]);
    expect(total.revenue.total).toBe(240_000_00);
    expect(total.students.paying).toBe(25);
    expect(total.students.active).toBe(35);
    expect(total.students.new).toBe(5);
    // Per student per month: 240k over 50 paying student-months.
    expect(total.perPaying.revenue).toBe(4_800_00);
  });
});

describe("growthOf", () => {
  it("is null from a zero base and measures a loss by its size", () => {
    expect(growthOf(10, 0)).toBeNull();
    expect(growthOf(10, null)).toBeNull();
    expect(growthOf(-50, -100)).toBe(50);
    expect(growthOf(50, 100)).toBe(-50);
  });
});

describe("TDS", () => {
  it("withholds 10% and grosses a 90% payout back up", () => {
    expect(tdsOn(10_000_00)).toBe(1_000_00);
    expect(grossFromNetPayout(9_000_00)).toBe(10_000_00);
  });
});

describe("monthsBetween", () => {
  it("crosses the year end", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-05", "2026-04")).toEqual([]);
  });
});

describe("resolveCategory", () => {
  it("reads keys, labels and loose spellings", () => {
    expect(resolveCategory("marketing")?.key).toBe("marketing");
    expect(resolveCategory("Marketing / ads")?.key).toBe("marketing");
    expect(resolveCategory("Electricity bill")?.key).toBe("electricity");
    expect(resolveCategory("Coach")?.key).toBe("teacher_pay");
    expect(resolveCategory("GST")?.key).toBe("gst_paid");
    expect(resolveCategory("zz")).toBeNull();
    expect(resolveCategory("")).toBeNull();
  });
});

describe("isAccountsAdmin", () => {
  it("lets only active admins without a named role in", () => {
    expect(isAccountsAdmin({ id: "1", role: "admin" })).toBe(true);
    expect(isAccountsAdmin({ id: "1", role: "admin", isActive: false })).toBe(false);
    expect(isAccountsAdmin({ id: "1", role: "sub-admin" })).toBe(false);
    expect(isAccountsAdmin({ id: "1", role: "admin", accessRoleId: "marketing" })).toBe(false);
    expect(isAccountsAdmin({ id: "1", role: "instructor" })).toBe(false);
    expect(isAccountsAdmin(null)).toBe(false);
  });
});

describe("runningSurplus", () => {
  it("adds bank fees beyond the portal and gives them back when the portal catches up later", () => {
    // The academy's 2026 figures, in thousands.
    const surplus = runningSurplus([
      { month: "2026-04", bank: 123.6, portal: 66.6 },
      { month: "2026-05", bank: 128.0, portal: 75.7 },
      { month: "2026-08", bank: 144.3, portal: 173.2 },
      { month: "2026-09", bank: 75.0, portal: 86.1 },
    ]);
    expect(surplus["2026-04"]).toBeCloseTo(57.0);
    expect(surplus["2026-05"]).toBeCloseTo(52.3);
    expect(surplus["2026-08"]).toBeCloseTo(-28.9);
    expect(surplus["2026-09"]).toBeCloseTo(-11.1);
    const total = Object.values(surplus).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(123.6 + 128.0 + 144.3 + 75.0 - (66.6 + 75.7 + 173.2 + 86.1));
  });

  it("never goes below zero when the portal shows more than the bank from the start", () => {
    const surplus = runningSurplus([
      { month: "2026-04", bank: 10, portal: 30 },
      { month: "2026-05", bank: 40, portal: 10 },
    ]);
    expect(surplus).toEqual({ "2026-04": 0, "2026-05": 10 });
  });
});

describe("GST on fees the portal never billed", () => {
  it("takes the GST paid beyond the portal's GST bills out of the bank fees not in the portal", () => {
    const [april] = computeAccounts([
      {
        ...emptyMonthInputs("2026-04"),
        portalGstGross: 47_200_00,
        portalGstTax: 7_200_00,
        bankFeesNotInPortal: 57_012_00,
        ledgerNonPl: { gst_paid: 14_543_00 },
      },
    ]).months;
    expect(april.revenue.bankNotInPortal).toBe(57_012_00 - 7_343_00);
    expect(april.gstCollected).toBe(14_543_00);
    expect(april.liabilities.gstCollected - april.liabilities.gstPaid).toBe(0);
  });

  it("takes nothing when there are no unbilled fees to hold it", () => {
    const [august] = computeAccounts([
      { ...emptyMonthInputs("2026-08"), portalGstTax: 19_312_00, bankFeesNotInPortal: -15_900_00, ledgerNonPl: { gst_paid: 21_539_00 } },
    ]).months;
    expect(august.revenue.bankNotInPortal).toBe(-15_900_00);
    expect(august.gstCollected).toBe(19_312_00);
  });
});
