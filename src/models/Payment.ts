import { Schema, model, models } from "mongoose";

const PaymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["enrollment", "booking", "tournament", "invoice", "other"], required: true },
    refId: { type: Schema.Types.ObjectId }, // Classroom / Booking / Tournament id
    amount: { type: Number, required: true }, // paise
    currency: { type: String, default: "INR" },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: String,
    razorpaySignature: String,
    status: { type: String, enum: ["created", "paid", "failed", "refunded"], default: "created", index: true },
    invoiceNumber: { type: String, index: true },
    paidAt: Date,
  },
  { timestamps: true }
);

export const Payment = models.Payment || model("Payment", PaymentSchema);
