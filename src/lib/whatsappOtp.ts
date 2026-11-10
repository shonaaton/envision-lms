import crypto from "crypto";
import { consumeRateLimit } from "@/lib/requestSecurity";
import { canonicalPhoneNumber } from "@/lib/phoneCountryCodes";
import { sendGraphMessage } from "@/lib/whatsappMeta";
import { WHATSAPP_OTP_TEMPLATE_NAME, WHATSAPP_OTP_VALIDITY_MINUTES } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppOtp } from "@/models/WhatsAppOtp";

/**
 * WhatsApp number verification.
 *
 * This sends straight to Meta rather than through `sendWhatsAppTemplateMessage`
 * on purpose. That helper relays through n8n and records every parameter in the
 * WhatsApp inbox, and a verification code must not sit in either place.
 */

export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
const OTP_SENDS_PER_NUMBER_PER_HOUR = 5;

export function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtpCode(reference: string, code: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "envision-whatsapp-otp";
  return crypto.createHmac("sha256", secret).update(`${reference}:${code}`).digest("hex");
}

/**
 * Meta's shape for a copy-code authentication template: the code goes in the
 * body and again in the button, which is what the button copies.
 */
export function otpTemplateMessage(recipient: string, code: string) {
  return {
    to: recipient,
    type: "template",
    template: {
      name: WHATSAPP_OTP_TEMPLATE_NAME,
      language: { code: "en" },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
}

export type OtpIssueResult =
  | { status: "sent" | "cooldown"; recipient: string; resendInSeconds: number }
  | { status: "throttled"; retryInMinutes: number }
  | { status: "failed"; reason: string };

export async function issueWhatsAppOtp(input: { reference: string; phone: string; countryCode: string }): Promise<OtpIssueResult> {
  const { reference } = input;
  const recipient = canonicalPhoneNumber(input.phone, input.countryCode);
  if (!recipient) return { status: "failed", reason: "No number to send to." };

  const existing: any = await WhatsAppOtp.findOne({ reference }).lean();
  // A resubmit of the same number lands here too, so the wait holds across both.
  if (existing?.recipient === recipient) {
    const waited = (Date.now() - new Date(existing.lastSentAt).getTime()) / 1000;
    if (waited < OTP_RESEND_SECONDS) return { status: "cooldown", recipient, resendInSeconds: Math.ceil(OTP_RESEND_SECONDS - waited) };
  }

  // Per number, however many requests or addresses ask, so this cannot be used
  // to flood somebody else's WhatsApp.
  const limit = consumeRateLimit(`whatsapp-otp:number:${recipient}`, OTP_SENDS_PER_NUMBER_PER_HOUR, 60 * 60 * 1000);
  if (!limit.allowed) return { status: "throttled", retryInMinutes: Math.max(1, Math.ceil(limit.retryAfterMs / 60000)) };

  const code = generateOtpCode();
  const now = new Date();
  await WhatsAppOtp.findOneAndUpdate(
    { reference },
    {
      $set: {
        recipient,
        codeHash: hashOtpCode(reference, code),
        attempts: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + WHATSAPP_OTP_VALIDITY_MINUTES * 60 * 1000),
      },
    },
    { upsert: true },
  );

  try {
    await sendGraphMessage(otpTemplateMessage(recipient, code));
    return { status: "sent", recipient, resendInSeconds: OTP_RESEND_SECONDS };
  } catch (error) {
    await WhatsAppOtp.deleteOne({ reference }).catch(() => undefined);
    return { status: "failed", reason: error instanceof Error ? error.message : "WhatsApp send failed." };
  }
}

export type OtpCheckResult = { status: "verified" } | { status: "wrong"; attemptsLeft: number } | { status: "expired" };

export async function verifyWhatsAppOtp(input: { reference: string; code: string }): Promise<OtpCheckResult> {
  const { reference } = input;
  const code = String(input.code || "").replace(/\D/g, "");

  // The attempt is counted before the comparison, so parallel guesses share one allowance.
  const record: any = await WhatsAppOtp.findOneAndUpdate(
    { reference, attempts: { $lt: OTP_MAX_ATTEMPTS }, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } },
    { new: true },
  ).lean();
  if (!record) return { status: "expired" };

  const expected = Buffer.from(String(record.codeHash), "hex");
  const supplied = Buffer.from(hashOtpCode(reference, code), "hex");
  if (expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)) {
    await WhatsAppOtp.deleteOne({ reference });
    return { status: "verified" };
  }
  const attemptsLeft = OTP_MAX_ATTEMPTS - Number(record.attempts || 0);
  return attemptsLeft > 0 ? { status: "wrong", attemptsLeft } : { status: "expired" };
}

/** "919831248613" -> "+91 ••••••8613", for showing where a code went. */
export function maskRecipient(recipient: string, countryCode: string) {
  const code = String(countryCode || "").replace(/\D/g, "");
  const national = recipient.startsWith(code) ? recipient.slice(code.length) : recipient;
  return `+${code} ${"•".repeat(Math.max(0, national.length - 4))}${national.slice(-4)}`;
}
