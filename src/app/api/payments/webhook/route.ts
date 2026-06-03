import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";

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
    await Payment.findOneAndUpdate(
      { razorpayOrderId: payment.order_id },
      { razorpayPaymentId: payment.id, status: "paid", paidAt: new Date() }
    );
  } else if (event.event === "payment.failed") {
    const payment = event.payload.payment.entity;
    await Payment.findOneAndUpdate({ razorpayOrderId: payment.order_id }, { status: "failed" });
  }
  return NextResponse.json({ received: true });
}
