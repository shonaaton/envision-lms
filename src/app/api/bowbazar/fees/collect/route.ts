import { NextResponse } from "next/server";
import { whatsAppChatLink } from "@/lib/branch/admissionRules";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { emailReceipt, receiptFor, receiptMessage, studentReceiptLink } from "@/lib/branch/receipts";
import { recordGroupPayment } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

/** Pays several of a family's months at once on one receipt: `{ studentId, billIds, mode, paidAt, reference, note }`. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const result = await recordGroupPayment(access.branch, String(body?.studentId || ""), body, { id: access.actorId, name: access.user.name });
    void emailReceipt(access.branch, result.receipt.paymentId, req);
    const receipt = await receiptFor(access.branch, result.receipt.paymentId);
    const message = receiptMessage(receipt, studentReceiptLink(receipt.paymentId, req));
    return NextResponse.json({ ...result, receipt: { ...result.receipt, whatsappLink: whatsAppChatLink(receipt.phone, message), message, hasEmail: Boolean(receipt.email) } });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
