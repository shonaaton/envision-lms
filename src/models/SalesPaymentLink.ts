import { Schema, model, models, type InferSchemaType } from "mongoose";

export const SALES_PAYMENT_LINK_STATUSES = ["created", "paid", "cancelled", "expired"] as const;

/**
 * A Razorpay payment link the sales team sent to a family that may not have an
 * account yet, from /sales/payment-links. It is not an invoice: once paid, an
 * admin attaches it to the student, which raises the paid invoice
 * (lib/payments/salesPaymentLinks.ts). The customer fields are what sales typed,
 * kept as sent so the record still reads right after the lead is converted.
 */
const SalesPaymentLinkSchema = new Schema(
  {
    customerName: { type: String, required: true, trim: true },
    studentName: { type: String, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    countryCode: { type: String, trim: true, default: "+91" },
    email: { type: String, trim: true, lowercase: true },
    feePlan: { type: Schema.Types.ObjectId, ref: "FeePlan" },
    feePlanName: { type: String, trim: true },
    /** Paise; the total the family pays, GST included. */
    amount: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    /**
     * The demo account sales picked when sending the link. A payment is then
     * recorded on it by the webhook (invoice + payment), with no attach step.
     */
    account: { type: Schema.Types.ObjectId, ref: "User", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdByName: { type: String, trim: true },
    razorpayLinkId: { type: String, index: true },
    shortUrl: String,
    referenceId: String,
    status: { type: String, enum: SALES_PAYMENT_LINK_STATUSES, default: "created", index: true },
    paidAt: Date,
    amountPaid: Number,
    razorpayPaymentId: { type: String, index: true },
    method: String,
    whatsappStatus: { type: String, enum: ["sent", "failed", "not_configured"] },
    whatsappSentAt: Date,
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    attachedStudent: { type: Schema.Types.ObjectId, ref: "User" },
    attachedInvoice: { type: Schema.Types.ObjectId, ref: "Invoice" },
    attachedAt: Date,
    attachedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

SalesPaymentLinkSchema.index({ createdBy: 1, createdAt: -1 });

export type SalesPaymentLinkDoc = InferSchemaType<typeof SalesPaymentLinkSchema> & { _id: any };
export const SalesPaymentLink = models.SalesPaymentLink || model("SalesPaymentLink", SalesPaymentLinkSchema);
