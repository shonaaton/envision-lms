import { Types } from "mongoose";
import { recordActivity } from "@/lib/activity";
import { invoiceStaffRecipients } from "@/lib/demoNotificationRecipients";
import { markInvoicePaid } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { paymentMethodFromRazorpay } from "@/lib/payments/razorpay";
import { recordPaidLinkOnAccount } from "@/lib/payments/salesPaymentLinks";
import { Invoice, Notification } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { SalesPaymentLink } from "@/models/SalesPaymentLink";

type LinkEntity = { id?: string; notes?: Record<string, string>; amount_paid?: number; status?: string };
type PaymentEntity = { id?: string; order_id?: string; method?: string; amount?: number };

/**
 * payment_link.paid. Razorpay retries a webhook until it gets a 200 and may
 * deliver it twice, so every branch first checks whether this payment id was
 * already recorded.
 */
export async function handlePaymentLinkPaid(link: LinkEntity, payment: PaymentEntity) {
  const notes = link.notes || {};
  const paymentId = String(payment.id || "");
  if (!link.id || !paymentId) return { handled: false, reason: "missing_ids" };

  if (notes.kind === "invoice") {
    const invoiceId = String(notes.invoiceId || "");
    if (!Types.ObjectId.isValid(invoiceId)) return { handled: false, reason: "bad_invoice_id" };
    if (await Payment.exists({ razorpayPaymentId: paymentId })) return { handled: true, duplicate: true };
    const invoice: any = await Invoice.findById(invoiceId).lean();
    if (!invoice) return { handled: false, reason: "invoice_not_found" };
    const amount = Number(link.amount_paid || payment.amount || invoice.totalAmount);
    const record: any = await Payment.create({
      user: invoice.student,
      purpose: "invoice",
      refId: invoice._id,
      amount,
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: paymentId,
      status: "paid",
      method: paymentMethodFromRazorpay(payment.method),
      referenceNumber: paymentId,
      invoiceNumber: invoice.invoiceNumber,
      paidAt: new Date(),
    });
    await Invoice.updateOne({ _id: invoice._id, "razorpayLink.id": link.id }, { $set: { "razorpayLink.status": "paid" } });
    if (invoice.status === "paid") {
      // Settled some other way before the parent paid this link (the link is
      // cancelled then, so this needs both to happen within moments). The money
      // is recorded against the invoice; the fees team refunds or credits it.
      await recordActivity({
        targetUser: String(invoice.student),
        type: "payment.payment_link_duplicate",
        label: `Payment link paid for invoice ${invoice.invoiceNumber}, which was already paid`,
        entityType: "Payment",
        entityId: String(record._id),
        metadata: { razorpayPaymentId: paymentId, razorpayLinkId: link.id, amount },
      });
      return { handled: true, alreadyPaid: true };
    }
    await markInvoicePaid(invoiceId, String(record._id), { source: "razorpay_payment_link", label: `Paid invoice ${invoice.invoiceNumber} through the Razorpay payment link` });
    return { handled: true };
  }

  if (notes.kind === "sales_link") {
    const salesLinkId = String(notes.salesLinkId || "");
    if (!Types.ObjectId.isValid(salesLinkId)) return { handled: false, reason: "bad_sales_link_id" };
    const updated: any = await SalesPaymentLink.findOneAndUpdate(
      { _id: salesLinkId, razorpayPaymentId: { $exists: false } },
      {
        $set: {
          status: "paid",
          paidAt: new Date(),
          amountPaid: Number(link.amount_paid || payment.amount || 0),
          razorpayPaymentId: paymentId,
          method: String(payment.method || ""),
        },
      },
      { new: true }
    ).lean();
    if (!updated) return { handled: true, duplicate: true };
    const amountText = formatINR(updated.amountPaid || updated.amount);
    // Sent for a demo account: the invoice and payment go straight onto it.
    const recorded = updated.account ? await recordPaidLinkOnAccount(salesLinkId) : null;
    const staff = await invoiceStaffRecipients().catch(() => []);
    const recipients = new Set([String(updated.createdBy), ...staff.map((person: any) => String(person.userId || "")).filter(Boolean)]);
    const where = recorded
      ? ` Recorded on ${recorded.studentName}'s account as ${recorded.invoiceNumber}.`
      : updated.account
        ? " It could not be recorded on the demo account automatically, so attach it by hand."
        : "";
    await Notification.insertMany(
      Array.from(recipients).map((user) => ({
        user,
        type: "sales.payment_link_paid",
        title: "Payment received",
        message: `${updated.customerName} paid ${amountText} for ${updated.description}.${where}`,
        metadata: { salesLinkId, href: "/sales/payment-links" },
      }))
    ).catch((error) => console.error("Payment link notification failed", error));
    await recordActivity({
      targetUser: String(updated.createdBy),
      type: "sales.payment_link.paid",
      label: `${updated.customerName} paid ${amountText} through a sales payment link`,
      entityType: "SalesPaymentLink",
      entityId: salesLinkId,
      metadata: { razorpayPaymentId: paymentId, razorpayLinkId: link.id, method: payment.method || "", recordedAs: recorded?.invoiceNumber || "" },
    });
    return { handled: true, recordedAs: recorded?.invoiceNumber };
  }

  return { handled: false, reason: "unknown_link" };
}

/** payment_link.cancelled / payment_link.expired, including ones done in the Razorpay dashboard. */
export async function handlePaymentLinkClosed(link: LinkEntity, status: "cancelled" | "expired") {
  const notes = link.notes || {};
  if (!link.id) return;
  if (notes.kind === "invoice") {
    await Invoice.updateOne({ "razorpayLink.id": link.id, "razorpayLink.status": "active" }, { $set: { "razorpayLink.status": "cancelled" } });
  } else if (notes.kind === "sales_link") {
    await SalesPaymentLink.updateOne({ razorpayLinkId: link.id, status: "created" }, { $set: { status } });
  }
}
