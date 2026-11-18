import { describe, expect, it } from "vitest";

import { cashReceipts, paidInCash, portalFeeCategoryFor, portalFeeKind } from "@/lib/accounts/portalFees";

const paidAt = new Date("2026-10-10T06:30:00Z");
const nonGst = { invoiceMode: "non_gst", totalAmount: 2_000_00, paidAt };
const gst = { invoiceMode: "included", gstPercentage: 18, gstAmount: 305_08, totalAmount: 2_000_00, paidAt };
const lut = { invoiceMode: "non_gst", exportSupply: { currency: "USD" }, totalAmount: 19_000_00, paidAt };

describe("portal fee rule (non-GST = cash with Sayantan, LUT = bank)", () => {
  it("sorts bills into non-GST, export and GST", () => {
    expect(portalFeeKind(nonGst)).toBe("non_gst");
    expect(portalFeeKind(lut)).toBe("export");
    expect(portalFeeKind(gst)).toBe("gst");
    expect(paidInCash(nonGst)).toBe(true);
    expect(paidInCash(lut)).toBe(false);
    expect(paidInCash(gst)).toBe(false);
  });

  it("leaves non-GST bills before October 2026 to the cash sheet", () => {
    const septemberPaid = new Date("2026-09-20T06:30:00Z");
    const september = { ...nonGst, paidAt: septemberPaid, paymentTransactions: [{ mode: "other", amount: 2_000_00, paidAt: septemberPaid }] };
    expect(paidInCash(september)).toBe(false);
    expect(cashReceipts(september)).toEqual([]);
    expect(portalFeeCategoryFor(september)).toBeNull();
    // Marked paid in cash in the portal: still cash, as before.
    expect(cashReceipts({ ...september, paymentTransactions: [{ mode: "cash", amount: 2_000_00, paidAt: septemberPaid }] }).map((receipt) => receipt.amount)).toEqual([2_000_00]);
    // 1 Oct 2026 IST is still 30 Sept in UTC: the academy month decides.
    expect(paidInCash({ ...nonGst, paidAt: new Date("2026-09-30T19:00:00Z") })).toBe(true);
  });

  it("counts a non-GST bill as cash whatever payment mode was typed", () => {
    const bill = { ...nonGst, paymentTransactions: [{ mode: "upi", amount: 1_000_00, paidAt }, { mode: "other", amount: 1_000_00, paidAt: new Date("2026-10-20T06:30:00Z") }] };
    expect(cashReceipts(bill).map((receipt) => receipt.amount)).toEqual([1_000_00, 1_000_00]);
  });

  it("falls back to the total on the paid date when no payment was recorded", () => {
    expect(cashReceipts(nonGst)).toEqual([{ amount: 2_000_00, paidAt }]);
  });

  it("never puts an export bill in the cash book, even with a cash payment typed", () => {
    expect(cashReceipts({ ...lut, paymentTransactions: [{ mode: "cash", amount: 19_000_00, paidAt }] })).toEqual([]);
  });

  it("keeps only the cash payments on a GST bill", () => {
    const bill = { ...gst, paymentTransactions: [{ mode: "upi", amount: 1_500_00, paidAt }, { mode: "cash", amount: 500_00, paidAt }] };
    expect(cashReceipts(bill).map((receipt) => receipt.amount)).toEqual([500_00]);
  });

  it("lists non-GST bills as cash and LUT bills as bank in Entries, and leaves GST bills out", () => {
    expect(portalFeeCategoryFor(nonGst)?.account).toBe("cash");
    expect(portalFeeCategoryFor(lut)?.account).toBe("bank");
    expect(portalFeeCategoryFor(gst)).toBeNull();
  });
});
