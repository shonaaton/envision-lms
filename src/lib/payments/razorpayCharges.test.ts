import { describe, expect, it, vi } from "vitest";

vi.mock("@/models/Payment", () => ({ Payment: {} }));
vi.mock("@/models/SalesPaymentLink", () => ({ SalesPaymentLink: {} }));
vi.mock("@/models/User", () => ({ User: {} }));

import { razorpayChargeSummary, type RazorpayChargeRow } from "./razorpayCharges";

const row = (amount: number, fee?: number, tax?: number): RazorpayChargeRow => ({
  paidAt: new Date("2026-11-01T10:00:00Z"),
  payer: "Parent",
  reference: "ENV/26-27/001",
  method: "upi",
  razorpayPaymentId: `pay_${amount}_${fee}`,
  amount,
  fee,
  tax,
});

describe("razorpayChargeSummary", () => {
  it("totals the commission, the GST on it and what was settled", () => {
    const { kpis, table } = razorpayChargeSummary([row(250000, 5900, 900), row(100000, 2360, 360)], "Nov 2026");
    expect(kpis).toMatchObject({
      razorpayGross: 350000,
      razorpayPayments: 2,
      razorpayFee: 8260,
      razorpayFeeTax: 1260,
      razorpayFeeExTax: 7000,
      razorpaySettled: 341740,
      razorpayFeeRate: 2.36,
      razorpayFeeMissing: 0,
    });
    expect(table.rows[0]).toMatchObject({ feeExTax: 5000, tax: 900, fee: 5900, settled: 244100, rate: 2.36 });
  });

  it("leaves a payment with no known fee out of the commission instead of counting it as free", () => {
    const { kpis, table } = razorpayChargeSummary([row(250000, 5900, 900), row(100000)], "Nov 2026");
    expect(kpis).toMatchObject({ razorpayGross: 350000, razorpayFee: 5900, razorpaySettled: 244100, razorpayFeeRate: 2.36, razorpayFeeMissing: 1 });
    expect(table.rows[1]).toMatchObject({ fee: null, settled: null, rate: null });
  });
});
