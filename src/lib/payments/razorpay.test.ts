import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { paymentMethodFromRazorpay, verifyCheckoutSignature, verifyWebhookSignature } from "./razorpay";

const sign = (secret: string, body: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

describe("Razorpay signatures", () => {
  const saved = { webhook: process.env.RAZORPAY_WEBHOOK_SECRET, key: process.env.RAZORPAY_KEY_SECRET };
  afterEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = saved.webhook;
    process.env.RAZORPAY_KEY_SECRET = saved.key;
  });

  it("accepts a webhook body signed with the webhook secret", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
    const body = JSON.stringify({ event: "payment_link.paid" });
    expect(verifyWebhookSignature(body, sign("whsec", body))).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and a short signature", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
    const body = JSON.stringify({ event: "payment_link.paid" });
    expect(verifyWebhookSignature(`${body} `, sign("whsec", body))).toBe(false);
    expect(verifyWebhookSignature(body, sign("other", body))).toBe(false);
    expect(verifyWebhookSignature(body, "abc")).toBe(false);
  });

  it("rejects instead of throwing when the secret is not set", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(verifyWebhookSignature("{}", sign("whsec", "{}"))).toBe(false);
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(verifyCheckoutSignature("order_1", "pay_1", "x")).toBe(false);
  });

  it("checks the checkout signature over order|payment", () => {
    process.env.RAZORPAY_KEY_SECRET = "keysecret";
    expect(verifyCheckoutSignature("order_1", "pay_1", sign("keysecret", "order_1|pay_1"))).toBe(true);
  });

  it("maps Razorpay methods onto the Payment enum", () => {
    expect(paymentMethodFromRazorpay("upi")).toBe("upi");
    expect(paymentMethodFromRazorpay("card")).toBe("card");
    expect(paymentMethodFromRazorpay("netbanking")).toBe("other");
  });
});
