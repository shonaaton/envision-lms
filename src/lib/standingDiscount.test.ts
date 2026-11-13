import { describe, expect, it } from "vitest";
import { adjustedInvoicePayment, planPriceForAssignment } from "@/lib/fees";

// A discount given once must reach every later invoice (monthly and credit
// recharge), or the family is billed the full plan price the next time.
describe("standing discount", () => {
  it("takes the assignment's discount off the plan price", () => {
    expect(planPriceForAssignment({ amount: 300000 }, { discountAmount: 50000 })).toEqual({ amount: 250000, discountAmount: 50000 });
  });

  it("charges the full price when there is no discount", () => {
    expect(planPriceForAssignment({ amount: 300000 }, {})).toEqual({ amount: 300000, discountAmount: 0 });
    expect(planPriceForAssignment({ amount: 300000 }, null)).toEqual({ amount: 300000, discountAmount: 0 });
  });

  it("never discounts below zero", () => {
    expect(planPriceForAssignment({ amount: 100000 }, { discountAmount: 150000 })).toEqual({ amount: 0, discountAmount: 100000 });
  });

  it("keeps a standing discount in the paid record and adds a new one on top", () => {
    const paid = adjustedInvoicePayment(
      { amount: 250000, totalAmount: 250000, invoiceMode: "non_gst", discountAmount: 50000 },
      { discountAmount: 20000 },
    );
    expect(paid.amount).toBe(230000);
    expect(paid.totalAmount).toBe(230000);
    expect(paid.discountAmount).toBe(70000);
  });

  it("does not wipe a standing discount when paid with no new adjustment", () => {
    const paid = adjustedInvoicePayment({ amount: 250000, totalAmount: 250000, invoiceMode: "non_gst", discountAmount: 50000 });
    expect(paid.amount).toBe(250000);
    expect(paid.discountAmount).toBe(50000);
  });
});
