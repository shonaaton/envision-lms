import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { Classroom } from "@/models/Classroom";
import { Booking } from "@/models/Booking";
import { verifyCheckoutSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
  const ok = verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  await dbConnect();
  const pay = await Payment.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id },
    {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      status: "paid",
      paidAt: new Date(),
      invoiceNumber: `INV-${Date.now()}`,
    },
    { new: true }
  );

  if (pay?.purpose === "enrollment" && pay.refId) {
    await Classroom.findByIdAndUpdate(pay.refId, { $addToSet: { students: pay.user } });
  } else if (pay?.purpose === "booking" && pay.refId) {
    await Booking.findByIdAndUpdate(pay.refId, { status: "confirmed", payment: pay._id });
  }
  return NextResponse.json({ ok: true, invoiceNumber: pay?.invoiceNumber });
}
