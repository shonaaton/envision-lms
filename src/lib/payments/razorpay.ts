import Razorpay from "razorpay";
import crypto from "crypto";

export function rzp() {
  const key_id = process.env.RAZORPAY_KEY_ID!;
  const key_secret = process.env.RAZORPAY_KEY_SECRET!;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(body).digest("hex");
  return expected === signature;
}

export function verifyWebhookSignature(body: string, signature: string) {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest("hex");
  return expected === signature;
}
