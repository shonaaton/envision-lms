import { NextResponse } from "next/server";
import { attachSalesPaymentLink, cancelSalesPaymentLink, resendSalesPaymentLink } from "@/lib/payments/salesPaymentLinks";
import { errorResponse, forbidden, paymentLinkViewer } from "../http";

export const dynamic = "force-dynamic";

/** One action on one link: `resend`, `cancel`, or `attach` with a studentId. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await paymentLinkViewer();
  if (!access) return forbidden();
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const { permissions } = access.viewer;
  try {
    if (action === "resend" && permissions.create) return NextResponse.json({ link: await resendSalesPaymentLink(access.actor, params.id) });
    if (action === "cancel" && permissions.cancel) return NextResponse.json({ link: await cancelSalesPaymentLink(access.actor, params.id) });
    if (action === "attach" && permissions.attach) {
      return NextResponse.json({ link: await attachSalesPaymentLink(access.actor, params.id, String(body?.studentId || "")) });
    }
    return forbidden();
  } catch (error) {
    return errorResponse(error);
  }
}
