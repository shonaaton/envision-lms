import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { adjustBill, recordPayment, removeCharge, removePayment } from "@/lib/branch/service";
import { emailReceipt, receiptFor, receiptMessage, studentReceiptLink } from "@/lib/branch/receipts";
import { whatsAppChatLink } from "@/lib/branch/admissionRules";

export const dynamic = "force-dynamic";

/** `action`: "pay", "removePayment" (with `paymentId`), "removeCharge" (with `chargeId`) or "adjust". */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    if (body?.action === "pay") {
      const bill = await recordPayment(access.branch, params.id, body, { id: access.actorId, name: access.user.name });
      // The family gets the receipt by email straight away; WhatsApp is one tap for staff.
      void emailReceipt(access.branch, bill.receipt.paymentId, req);
      const receipt = await receiptFor(access.branch, bill.receipt.paymentId);
      const message = receiptMessage(receipt, studentReceiptLink(receipt.paymentId, req));
      return NextResponse.json({ ...bill, receipt: { ...bill.receipt, whatsappLink: whatsAppChatLink(receipt.phone, message), message, hasEmail: Boolean(receipt.email) } });
    }
    if (body?.action === "removePayment") return NextResponse.json(await removePayment(access.branch, params.id, String(body.paymentId || "")));
    if (body?.action === "removeCharge") return NextResponse.json(await removeCharge(access.branch, params.id, String(body.chargeId || "")));
    return NextResponse.json(await adjustBill(access.branch, params.id, body));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
