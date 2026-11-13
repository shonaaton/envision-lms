import { describe, expect, it } from "vitest";
import { formatForeign, inrPaiseFor, isExportInvoice, lutCovers, lutValidUntil } from "./exportInvoice";
import { overdueInvoiceUpdate } from "./invoiceMath";

describe("export invoices", () => {
  it("converts a foreign amount to INR paise at the entered rate", () => {
    // USD 225.00 at ₹84.50 = ₹19,012.50
    expect(inrPaiseFor(22500, 84.5)).toBe(1901250);
    expect(inrPaiseFor(10001, 88.1234)).toBe(Math.round(10001 * 88.1234));
    expect(inrPaiseFor(0, 84)).toBe(0);
    expect(inrPaiseFor(100, 0)).toBe(0);
  });

  it("prints the currency code, not a symbol", () => {
    expect(formatForeign(22500, "USD")).toBe("USD 225.00");
    expect(formatForeign(123456789, "GBP")).toBe("GBP 1,234,567.89");
  });

  it("ends the LUT's cover on 31 March of the financial year it was filed in", () => {
    expect(lutValidUntil("2026-11-10")).toBe("2027-03-31");
    expect(lutValidUntil("2027-02-01")).toBe("2027-03-31");
    expect(lutValidUntil("2027-04-01")).toBe("2028-03-31");
    expect(lutValidUntil("")).toBeNull();
  });

  it("covers invoices from the filing date to the year end", () => {
    expect(lutCovers("2026-11-14", "2026-11-10")).toBe(true);
    expect(lutCovers("2026-11-09", "2026-11-10")).toBe(false);
    expect(lutCovers("2027-03-31", "2026-11-10")).toBe(true);
    expect(lutCovers("2027-04-01", "2026-11-10")).toBe(false);
  });

  it("is recognised by its currency", () => {
    expect(isExportInvoice({ exportSupply: { currency: "USD" } })).toBe(true);
    expect(isExportInvoice({ invoiceMode: "non_gst" })).toBe(false);
  });

  it("never gets an INR late fee from the overdue sweep, even on a plan", () => {
    const update = overdueInvoiceUpdate(
      { type: "monthly", amount: 1901250, dueDate: new Date("2026-01-01"), invoiceMode: "non_gst", gstPercentage: 0, exportSupply: { currency: "USD" } },
      { lateFeeAfterDays: 7, lateFeeAmount: 50000, gstMode: "included", gstPercentage: 18 },
      new Date("2026-11-14"),
    );
    expect(update).toEqual({ status: "overdue" });
  });
});

describe("foreign-currency plans and payment links", () => {
  it("formats rupees and foreign currencies", async () => {
    const { moneyIn } = await import("./exportInvoice");
    expect(moneyIn(22500, "USD")).toBe("USD 225.00");
    expect(moneyIn(22500, "INR")).toMatch(/225\.00/);
  });

  it("names the client's country without guessing a shared dial code", async () => {
    const { exportCountryFor } = await import("./exportInvoice");
    expect(exportCountryFor({ country: "Germany" })).toBe("Germany");
    expect(exportCountryFor({ country: "India" }, "United Kingdom")).toBe("United Kingdom");
    expect(exportCountryFor({}, "United States / Canada")).toBe("Outside India");
  });

  it("raises an export invoice from a foreign plan at the plan's rate", async () => {
    const { exportSupplyFromPlan } = await import("./exportInvoice");
    const plan = { amount: 1901250, exportPricing: { currency: "USD", foreignAmount: 22500, exchangeRate: 84.5 } };
    expect(exportSupplyFromPlan(plan, 1901250, "United States", { lutArn: "AD1", lutFiledOn: "2026-11-10" })).toEqual({
      currency: "USD", foreignAmount: 22500, exchangeRate: 84.5, country: "United States", lutArn: "AD1", lutFiledOn: "2026-11-10",
    });
    expect(exportSupplyFromPlan(plan, 845000, "United States", { lutArn: "AD1" })?.foreignAmount).toBe(10000);
    expect(exportSupplyFromPlan({ amount: 100 }, 100, "X", { lutArn: "AD1" })).toBeUndefined();
  });

  it("asks Razorpay links for the foreign total of an export invoice", async () => {
    const { invoiceLinkAmount } = await import("./exportInvoice");
    expect(invoiceLinkAmount({ totalAmount: 1901250, amount: 1901250, exportSupply: { currency: "USD", foreignAmount: 22500, exchangeRate: 84.5 } })).toEqual({ amount: 22500, currency: "USD" });
    expect(invoiceLinkAmount({ totalAmount: 500000 })).toEqual({ amount: 500000, currency: "INR" });
  });

  it("reads the rupees Razorpay converted a foreign payment into", async () => {
    const { razorpayInrAmount, impliedRate } = await import("./exportInvoice");
    expect(razorpayInrAmount({ amount: 22500, currency: "USD", base_amount: 1893000, base_currency: "INR" })).toBe(1893000);
    expect(razorpayInrAmount({ amount: 22500, currency: "USD" })).toBeNull();
    expect(razorpayInrAmount({ amount: 500000, currency: "INR" })).toBe(500000);
    expect(impliedRate(22500, 1893000)).toBe(84.1333);
  });
});
