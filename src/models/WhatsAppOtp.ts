import { Schema, model, models } from "mongoose";

/**
 * One live WhatsApp verification code.
 *
 * `reference` is the record being verified, and it holds at most one code: a
 * resend replaces the old one. Only a keyed hash is stored, and the TTL index
 * removes the row once the code has expired.
 */
const WhatsAppOtpSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    recipient: { type: String, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
);

export const WhatsAppOtp = models.WhatsAppOtp || model("WhatsAppOtp", WhatsAppOtpSchema);
