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
