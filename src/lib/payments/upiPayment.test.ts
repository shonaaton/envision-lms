import { afterEach, describe, expect, it } from "vitest";
import { collectsThroughRazorpay } from "./gstAccount";
import { upiPaySignature, upiPaymentUri, verifyUpiPaySignature } from "./upiPayment";

describe("UPI pay page", () => {
  const saved = process.env.AUTH_SECRET;
  afterEach(() => {
    process.env.AUTH_SECRET = saved;
  });

  it("signs a stable link per invoice and rejects another invoice's signature", () => {
    process.env.AUTH_SECRET = "test-secret";
    const signature = upiPaySignature("aaaaaaaaaaaaaaaaaaaaaaa1");
    expect(signature).toHaveLength(32);
    expect(upiPaySignature("aaaaaaaaaaaaaaaaaaaaaaa1")).toBe(signature);
    expect(verifyUpiPaySignature("aaaaaaaaaaaaaaaaaaaaaaa1", signature)).toBe(true);
    expect(verifyUpiPaySignature("aaaaaaaaaaaaaaaaaaaaaaa2", signature)).toBe(false);
    expect(verifyUpiPaySignature("aaaaaaaaaaaaaaaaaaaaaaa1", "x")).toBe(false);
  });

  it("builds a UPI intent for the exact amount to the foundation's account", () => {
    const uri = upiPaymentUri({ amount: 250050, note: "ENV/26-27/010 Aarav Sharma" });
    const params = new URLSearchParams(uri.replace("upi://pay?", ""));
    expect(uri.startsWith("upi://pay?")).toBe(true);
    expect(params.get("pa")).toBe("6290349998@okbizaxis");
    expect(params.get("pn")).toBe("Shatranjana Chess Foundation");
    expect(params.get("am")).toBe("2500.50");
    expect(params.get("cu")).toBe("INR");
    expect(params.get("tn")).toBe("ENV/26-27/010 Aarav Sharma");
    expect(uri).not.toContain("+");
  });
});

describe("collectsThroughRazorpay", () => {
  it("is true only for GST invoices and plans", () => {
    expect(collectsThroughRazorpay({ invoiceMode: "included", gstPercentage: 18 })).toBe(true);
    expect(collectsThroughRazorpay({ gstMode: "excluded", gstPercentage: 18 })).toBe(true);
    expect(collectsThroughRazorpay({ invoiceMode: "non_gst", gstPercentage: 18 })).toBe(false);
    expect(collectsThroughRazorpay({ invoiceMode: "included", gstPercentage: 0 })).toBe(false);
    expect(collectsThroughRazorpay({})).toBe(false);
  });
});
