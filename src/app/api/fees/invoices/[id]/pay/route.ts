import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { isFeesManager } from "@/lib/feesAccess";
import { isExportInvoice } from "@/lib/exportInvoice";
import { invoicePaymentLink } from "@/lib/payments/invoicePaymentLink";
import { Invoice } from "@/models/Fee";

export const dynamic = "force-dynamic";

/**
 * "Pay" for an export (LUT) invoice in the portal: sends the client to the
 * invoice's Razorpay link, which collects in their own currency. Portal
 * checkout only takes rupees, so it is not used for these invoices.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.redirect(new URL("/login", req.url));
  if (!Types.ObjectId.isValid(params.id)) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  await dbConnect();
  const invoice: any = await Invoice.findById(params.id).select("student exportSupply").lean();
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (String(invoice.student) !== String(userId) && !isFeesManager((session!.user as any).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isExportInvoice(invoice)) return NextResponse.json({ error: "Pay this invoice from the invoice list." }, { status: 400 });
  const result = await invoicePaymentLink(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.redirect(result.url);
}
