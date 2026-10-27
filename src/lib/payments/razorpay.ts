import Razorpay from "razorpay";
import crypto from "crypto";

export function rzp() {
  const key_id = process.env.RAZORPAY_KEY_ID!;
  const key_secret = process.env.RAZORPAY_KEY_SECRET!;
  if (!key_id || !key_secret) throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

/** Whether payment links can be created. Reminders fall back to the invoice URL when not. */
export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function hmacMatches(secret: string | undefined, body: string, signature: string) {
  // An unset secret used to throw inside createHmac and answer Razorpay with a 500.
  if (!secret || !signature) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(body).digest("hex"));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  return hmacMatches(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`, signature);
}

export function verifyWebhookSignature(body: string, signature: string) {
  return hmacMatches(process.env.RAZORPAY_WEBHOOK_SECRET, body, signature);
}

/** Razorpay's method name, as the Payment model's method enum knows it. */
export function paymentMethodFromRazorpay(method: unknown) {
  const value = String(method || "");
  return value === "upi" || value === "card" ? value : "other";
}

export type PaymentLinkNotes = { kind: "invoice"; invoiceId: string } | { kind: "sales_link"; salesLinkId: string };

/**
 * A Razorpay payment link for a fixed INR amount (paise). Razorpay's own SMS and
 * email are off: the academy sends the link on WhatsApp and email itself, so the
 * parent does not get the same request three times.
 */
export async function createPaymentLink(input: {
  amount: number;
  description: string;
  referenceId: string;
  customer?: { name?: string; email?: string; contact?: string };
  notes: PaymentLinkNotes;
}) {
  const customer = Object.fromEntries(Object.entries(input.customer || {}).filter(([, value]) => Boolean(value)));
  const link: any = await rzp().paymentLink.create({
    amount: Math.round(input.amount),
    currency: "INR",
    accept_partial: false,
    reference_id: input.referenceId.slice(0, 40),
    description: input.description.slice(0, 2048),
    customer,
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: input.notes as Record<string, string>,
  });
  return { id: String(link.id), shortUrl: String(link.short_url) };
}

/** Best effort: a link that is already paid, expired or cancelled cannot be cancelled again. */
export async function cancelPaymentLink(id: string | undefined | null) {
  if (!id || !razorpayConfigured()) return false;
  try {
    await rzp().paymentLink.cancel(id);
    return true;
  } catch (error) {
    console.error("Razorpay payment link cancel failed", { id, error: (error as any)?.error || error });
    return false;
  }
}
