import { createNextMonthlyInvoiceAfterPayment } from "@/lib/fees";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { resolveAudienceEmails } from "@/lib/studentContact";
import { formatINR } from "@/lib/utils";
import { Invoice, Notification } from "@/models/Fee";

type RecordedTransaction = { mode: string; amount: number; referenceNumber?: string };

/**
 * What follows an admin recording a payment by hand, from the invoice list or
 * straight from the create page: the next monthly invoice, and (unless the
 * admin opts out) the in-app notice plus the student and parent emails.
 * markInvoicePaid itself records the payment, credits and WhatsApp receipt.
 */
export async function afterManualInvoicePayment(invoiceId: string, transactions: RecordedTransaction[], options: { notify?: boolean } = {}) {
  const paidInvoice: any = await Invoice.findById(invoiceId).populate("student").lean();
  if (!paidInvoice) return;
  try {
    if (paidInvoice.type === "monthly") await createNextMonthlyInvoiceAfterPayment(invoiceId);
  } catch (error) {
    console.error("Could not generate next monthly invoice after payment", error);
  }
  if (options.notify === false || !paidInvoice.student?._id) return;
  try {
    const transactionSummary = transactions
      .map((transaction) => `${formatINR(transaction.amount)} by ${transaction.mode === "bank_transfer" ? "Bank Transfer" : transaction.mode.toUpperCase()}${transaction.referenceNumber ? `, ref ${transaction.referenceNumber}` : ""}`)
      .join("\n");
    const message = [
      `Hello ${paidInvoice.student.name},`,
      `Payment has been recorded for invoice ${paidInvoice.invoiceNumber}.`,
      `Amount: ${formatINR(paidInvoice.totalAmount)}.`,
      paidInvoice.lateFeeWaivedAmount ? `Late fee waived: ${formatINR(paidInvoice.lateFeeWaivedAmount)}.` : "",
      paidInvoice.discountAmount ? `Discount applied: ${formatINR(paidInvoice.discountAmount)}.` : "",
      transactionSummary ? `Transactions:\n${transactionSummary}` : "",
    ].filter(Boolean).join("\n\n");
    await Notification.create({
      user: paidInvoice.student._id,
      type: "invoice.paid",
      title: "Invoice marked paid",
      message: `${paidInvoice.invoiceNumber} has been marked as paid.`,
      metadata: { invoice: paidInvoice._id.toString(), transactionCount: transactions.length },
    });
    const paidEmails = resolveAudienceEmails(
      paidInvoice.student.email
        ? {
            to: paidInvoice.student.email,
            subject: `Payment received for ${paidInvoice.invoiceNumber}`,
            message,
            metadata: { kind: "invoice_paid", invoiceId, invoiceNumber: paidInvoice.invoiceNumber },
          }
        : null,
      paidInvoice.student.parentEmail
        ? {
            to: paidInvoice.student.parentEmail,
            subject: `Payment recorded for ${paidInvoice.student.name}`,
            message: message.replace(`Hello ${paidInvoice.student.name},`, `Hello ${paidInvoice.student.parentName || "Parent"},`),
            metadata: { kind: "invoice_paid_parent", invoiceId, invoiceNumber: paidInvoice.invoiceNumber },
          }
        : null,
    );
    for (const paidEmail of paidEmails) {
      await sendAutomationEmail(paidEmail);
    }
  } catch (error) {
    console.error("Post-payment notifications failed", error);
  }
}
