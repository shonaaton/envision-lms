import { describe, expect, it } from "vitest";

import { buildCashBook } from "@/lib/accounts/cashbook";
import { defaultFlow, resolveCategory } from "@/lib/accounts/categories";
import { computeAccounts, emptyMonthInputs } from "@/lib/accounts/metrics";
import { bucketFor, classifyStudent, summarizeReceivables, type ReceivableStudent } from "@/lib/accounts/receivables";

describe("buildCashBook", () => {
  it("runs a balance from the opening cash and goes negative when the holder pays from his own pocket", () => {
    const { rows, closing } = buildCashBook(
      0,
      [
        { month: "2026-04", flow: "in", amount: 26_000_00, group: "fees" },
        { month: "2026-04", flow: "out", amount: 16_749_00, group: "teacher_pay" },
        { month: "2026-04", flow: "out", amount: 5_535_00, group: "software" },
        { month: "2026-05", flow: "out", amount: 10_000_00, group: "staff_salaries" },
        // A refund booked negative still moves the way its flow says.
        { month: "2026-05", flow: "in", amount: -500_00, group: "other_in" },
      ],
      ["2026-04", "2026-05"]
    );
    expect(rows[0]).toMatchObject({ opening: 0, feesIn: 26_000_00, out: 22_284_00, closing: 3_716_00 });
    expect(rows[0].outByGroup.teacher_pay).toBe(16_749_00);
    expect(rows[1]).toMatchObject({ opening: 3_716_00, otherIn: 500_00, out: 10_000_00, closing: -5_784_00 });
    expect(closing).toBe(-5_784_00);
  });

  it("rolls earlier months into the first month's opening balance", () => {
    const { rows } = buildCashBook(1_000_00, [{ month: "2026-04", flow: "in", amount: 2_000_00, group: "fees" }], ["2026-05"]);
    expect(rows[0].opening).toBe(3_000_00);
  });
});

describe("defaultFlow", () => {
  it("brings income in and sends costs out, refunds the other way", () => {
    expect(defaultFlow("offline_fees")).toBe("in");
    expect(defaultFlow("rent")).toBe("out");
    expect(defaultFlow("software", true)).toBe("in");
    expect(defaultFlow("student_refunds", true)).toBe("out");
    expect(defaultFlow("loan")).toBe("in");
    expect(defaultFlow("gst_paid")).toBe("out");
  });

  it("pays a staff invoice out of cash without being a second cost", () => {
    expect(resolveCategory("Staff invoice paid")).toMatchObject({ key: "staff_invoice_paid", kind: "non_pl" });
    expect(defaultFlow("staff_invoice_paid")).toBe("out");
    const [september] = computeAccounts([{ ...emptyMonthInputs("2026-09"), portalTeacherInvoiced: 20_000_00, ledgerNonPl: { staff_invoice_paid: 12_400_00 } }]).months;
    expect(september.cost.teacher).toBe(20_000_00);
    expect(september.cost.total).toBe(20_000_00);
  });
});

describe("receivables", () => {
  const now = new Date("2026-10-07T12:00:00+05:30");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("ages bills from their due date", () => {
    expect(bucketFor(null, now)).toBe("notDue");
    expect(bucketFor(new Date(now.getTime() + 86_400_000), now)).toBe("notDue");
    expect(bucketFor(daysAgo(10), now)).toBe("upTo30");
    expect(bucketFor(daysAgo(45), now)).toBe("upTo60");
    expect(bucketFor(daysAgo(90), now)).toBe("over60");
  });

  it("separates students who left, including those never deactivated", () => {
    expect(classifyStudent({ isActive: false }, daysAgo(5), daysAgo(5), now)).toBe("left");
    expect(classifyStudent({ isPaused: true }, daysAgo(90), null, now)).toBe("paused");
    expect(classifyStudent({}, daysAgo(45), daysAgo(80), now)).toBe("probably_left");
    expect(classifyStudent({}, daysAgo(45), daysAgo(20), now)).toBe("active");
    expect(classifyStudent({}, daysAgo(10), null, now)).toBe("active");
  });

  it("keeps left students out of the collectable total", () => {
    const row = (group: ReceivableStudent["group"], total: number) => ({ group, total }) as ReceivableStudent;
    expect(summarizeReceivables([row("active", 300), row("paused", 100), row("probably_left", 50), row("left", 20)])).toEqual({
      collectable: 400,
      doubtful: 50,
      left: 20,
      total: 470,
    });
  });
});
