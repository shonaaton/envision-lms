import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { markInvoicePaid } from "@/lib/fees";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature") || "";
  if (!verifyWebhookSignature(body, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(body);
  await dbConnect();

  if (event.event === "payment.captured") {
    const payment = event.payload.payment.entity;
    const pay = await Payment.findOneAndUpdate(
      { razorpayOrderId: payment.order_id },
      { razorpayPaymentId: payment.id, status: "paid", paidAt: new Date() },
      { new: true }
    );
    if (pay?.purpose === "invoice" && pay.refId) await markInvoicePaid(pay.refId.toString(), pay._id.toString(), { source: "razorpay_webhook" });
    if (pay) {
      await recordActivity({
        targetUser: pay.user?.toString?.() || String(pay.user || ""),
        type: "payment.webhook_captured",
        label: `Razorpay webhook captured payment for ${pay.purpose}`,
        entityType: "Payment",
        entityId: pay._id.toString(),
        metadata: {
          purpose: pay.purpose,
          refId: pay.refId?.toString?.() || "",
          amount: pay.amount,
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
          source: "razorpay_webhook",
        },
      });
    }
  } else if (event.event === "payment.failed") {
    const payment = event.payload.payment.entity;
    const pay = await Payment.findOneAndUpdate({ razorpayOrderId: payment.order_id }, { status: "failed" }, { new: true });
    if (pay) {
      await recordActivity({
        targetUser: pay.user?.toString?.() || String(pay.user || ""),
        type: "payment.webhook_failed",
        label: `Razorpay webhook marked payment failed for ${pay.purpose}`,
        entityType: "Payment",
        entityId: pay._id.toString(),
        metadata: { purpose: pay.purpose, refId: pay.refId?.toString?.() || "", amount: pay.amount, razorpayOrderId: payment.order_id, source: "razorpay_webhook" },
      });
    }
  }
  return NextResponse.json({ received: true });
}
