import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { orderSchema } from "@/lib/validation";
import { rzp } from "@/lib/payments/razorpay";
import { Invoice } from "@/models/Fee";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = orderSchema.parse(await req.json());
    await dbConnect();
    let amount = body.amount;
    let invoiceNumber: string | undefined;
    if (body.purpose === "invoice") {
      if (!body.refId) return NextResponse.json({ error: "Invoice required" }, { status: 400 });
      const invoice: any = await Invoice.findById(body.refId).lean();
      if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      if (invoice.student?.toString() !== (session.user as any).id && (session.user as any).role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (invoice.status === "paid") return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });
      amount = invoice.totalAmount;
      invoiceNumber = invoice.invoiceNumber;
    }
    const order = await rzp().orders.create({
      amount,
      currency: "INR",
      receipt: `eca_${Date.now()}`,
      notes: { userId: (session.user as any).id, purpose: body.purpose, refId: body.refId || "" },
    });
    const payment = await Payment.create({
      user: (session.user as any).id,
      purpose: body.purpose,
      refId: body.refId,
      amount,
      razorpayOrderId: order.id,
      status: "created",
      invoiceNumber,
    });
    await recordActivity({
      actor: (session.user as any).id,
      targetUser: (session.user as any).id,
      type: "payment.order.created",
      label: body.purpose === "invoice" && invoiceNumber ? `Created Razorpay order for invoice ${invoiceNumber}` : `Created Razorpay order for ${body.purpose}`,
      entityType: "Payment",
      entityId: payment._id.toString(),
      metadata: {
        purpose: body.purpose,
        refId: body.refId || "",
        amount,
        razorpayOrderId: order.id,
        invoiceNumber: invoiceNumber || "",
        source: "razorpay_checkout",
      },
    });
    return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
