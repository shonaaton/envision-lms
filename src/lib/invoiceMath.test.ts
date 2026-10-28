import { describe, expect, it } from "vitest";
import { invoiceBreakup, overdueInvoiceUpdate } from "./invoiceMath";

describe("overdueInvoiceUpdate", () => {
  const now = new Date("2026-10-28T06:00:00Z");
  const longAgo = new Date("2026-10-01T00:00:00Z");

  it("keeps a back-dated GST-included custom invoice at the amount it was raised for", () => {
    const update = overdueInvoiceUpdate({ type: "manual", amount: 1000000, dueDate: longAgo, invoiceMode: "included", gstPercentage: 18 }, null, now);
    expect(update).toEqual({ status: "overdue" });
  });

  it("leaves invoices inside the grace period alone", () => {
    const update = overdueInvoiceUpdate({ type: "monthly", amount: 300000, dueDate: new Date("2026-10-25T00:00:00Z"), invoiceMode: "included", gstPercentage: 18 }, { lateFeeAmount: 50000 }, now);
    expect(update).toBeNull();
  });

  it("adds a plan late fee inside the invoice's own GST-included total, even if the plan now says excluded", () => {
    const update: any = overdueInvoiceUpdate(
      { type: "monthly", amount: 300000, dueDate: longAgo, invoiceMode: "included", gstPercentage: 18 },
      { lateFeeAmount: 50000, gstMode: "excluded", gstPercentage: 18 },
      now,
    );
    expect(update.invoiceMode).toBe("included");
    expect(update.totalAmount).toBe(350000);
    expect(update.taxableAmount + update.gstAmount).toBe(350000);
  });
});

describe("invoiceBreakup", () => {
  it("never adds GST on top when the amount already includes it", () => {
    const breakup = invoiceBreakup(500000, 0, {}, { gstMode: "included", gstPercentage: 18 });
    expect(breakup.totalAmount).toBe(500000);
    expect(breakup.taxableAmount + breakup.gstAmount).toBe(500000);
    expect(breakup.taxableAmount).toBe(423729);
    expect(breakup.cgstAmount + breakup.sgstAmount).toBe(breakup.gstAmount);
  });

  it("adds GST on top when the amount excludes it", () => {
    const breakup = invoiceBreakup(500000, 0, {}, { gstMode: "excluded", gstPercentage: 18 });
    expect(breakup.taxableAmount).toBe(500000);
    expect(breakup.gstAmount).toBe(90000);
    expect(breakup.totalAmount).toBe(590000);
  });

  it("has no tax lines on a non-GST invoice even if a rate is passed", () => {
    const breakup = invoiceBreakup(500000, 0, {}, { gstMode: "non_gst", gstPercentage: 18 });
    expect(breakup.gstPercentage).toBe(0);
    expect(breakup.gstAmount).toBe(0);
    expect(breakup.totalAmount).toBe(500000);
  });
});
