import { NextResponse } from "next/server";
import { razorpayConfigured } from "@/lib/payments/razorpay";
import { createSalesPaymentLink, listSalesPaymentLinks, salesFeePlans } from "@/lib/payments/salesPaymentLinks";
import { errorResponse, forbidden, paymentLinkViewer } from "./http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await paymentLinkViewer();
  if (!access) return forbidden();
  try {
    const [links, plans] = await Promise.all([listSalesPaymentLinks(access.actor), salesFeePlans()]);
    return NextResponse.json({ links, plans, configured: razorpayConfigured(), permissions: access.viewer.permissions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  const access = await paymentLinkViewer();
  if (!access?.viewer.permissions.create) return forbidden();
  try {
    const link = await createSalesPaymentLink(access.actor, await req.json().catch(() => ({})));
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
