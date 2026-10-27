import { describe, expect, it } from "vitest";
import { invoiceBreakup } from "./invoiceMath";

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
