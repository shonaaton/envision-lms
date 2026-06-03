import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { orderSchema } from "@/lib/validation";
import { rzp } from "@/lib/payments/razorpay";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = orderSchema.parse(await req.json());
    const order = await rzp().orders.create({
      amount: body.amount,
      currency: "INR",
      receipt: `eca_${Date.now()}`,
      notes: { userId: (session.user as any).id, purpose: body.purpose, refId: body.refId || "" },
    });
    await dbConnect();
    await Payment.create({
      user: (session.user as any).id,
      purpose: body.purpose,
      refId: body.refId,
      amount: body.amount,
      razorpayOrderId: order.id,
      status: "created",
    });
    return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
