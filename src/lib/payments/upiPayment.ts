import { createHmac, timingSafeEqual } from "crypto";
import { resolvePublicAppUrl } from "@/lib/appUrl";

/**
 * Non-GST fees are paid by UPI into the foundation's account, not through
 * Razorpay (user, 2026-10-27). The defaults are the account on the QR the user
 * shared; the env vars let it change without a code edit.
 */
export function nonGstUpiAccount() {
  return {
    upiId: String(process.env.NON_GST_UPI_ID || "6290349998@okbizaxis").trim(),
    payeeName: String(process.env.NON_GST_UPI_NAME || "Shatranjana Chess Foundation").trim(),
  };
}

function signingSecret() {
  const secret = String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? "" : "development-upi-pay-secret";
}

/**
 * The pay page link carries a signature instead of a stored token, so every
 * reminder for the same invoice sends the same working link and nothing expires
 * or is overwritten. The page shows only the invoice number, student's name and
 * amount due.
 */
export function upiPaySignature(invoiceId: string) {
  const secret = signingSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(`upi-pay:${invoiceId}`).digest("base64url").slice(0, 32);
}

export function verifyUpiPaySignature(invoiceId: string, signature: string) {
  const expected = upiPaySignature(invoiceId);
  if (!expected || !signature) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function upiPayPageUrl(invoiceId: string) {
  const baseUrl = resolvePublicAppUrl(undefined, { allowRequestHeaders: false });
  const signature = upiPaySignature(invoiceId);
  return baseUrl && signature ? `${baseUrl}/pay/upi/${invoiceId}/${signature}` : "";
}

/** A upi://pay intent for an exact amount (paise), which UPI apps open prefilled. */
export function upiPaymentUri(input: { amount: number; note: string }) {
  const { upiId, payeeName } = nonGstUpiAccount();
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: (Math.round(input.amount) / 100).toFixed(2),
    cu: "INR",
    tn: input.note.replace(/[^\w\s/-]/g, " ").trim().slice(0, 50),
  });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
