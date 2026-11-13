import { Types } from "mongoose";
import { recordActivity } from "@/lib/activity";
import { invoiceStaffRecipients } from "@/lib/demoNotificationRecipients";
import { markInvoicePaid } from "@/lib/fees";
import { paymentMethodFromRazorpay, razorpayChargeFields } from "@/lib/payments/razorpay";
import { recordPaidLinkOnAccount } from "@/lib/payments/salesPaymentLinks";
import { Invoice, Notification } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { SalesPaymentLink } from "@/models/SalesPaymentLink";
import { moneyIn, razorpayInrAmount } from "@/lib/exportInvoice";

type LinkEntity = { id?: string; notes?: Record<string, string>; amount_paid?: number; currency?: string; status?: string };
type PaymentEntity = { id?: string; order_id?: string; method?: string; amount?: number; currency?: string; base_amount?: number; base_currency?: string; fee?: number; tax?: number };

/**
 * A link paid in a foreign currency (an export invoice's link): what was paid
 * in that currency, and the rupees it became. Razorpay reports the rupees as
 * the payment's base_amount; without it, `fallbackRate` (the invoice's own
 * rate) converts.
 */
function linkPaymentAmounts(link: LinkEntity, payment: PaymentEntity, fallbackRate = 0) {
  const currency = String(payment.currency || link.currency || "INR").toUpperCase();
  const paid = Number(link.amount_paid || payment.amount || 0);
  if (currency === "INR") return { currency, paid, inr: paid };
  const inr = razorpayInrAmount(payment) ?? (fallbackRate > 0 ? Math.round(paid * fallbackRate) : 0);
  return { currency, paid, inr };
}

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
    const paid = linkPaymentAmounts(link, payment, Number(invoice.exportSupply?.exchangeRate || 0));
    // Payment.amount is always rupees: for a foreign payment, the INR it settled as.
    const amount = paid.currency === "INR" ? Number(paid.paid || invoice.totalAmount) : paid.inr || Number(invoice.totalAmount);
    const record: any = await Payment.create({
      user: invoice.student,
      purpose: "invoice",
      refId: invoice._id,
      amount,
      ...(paid.currency !== "INR" ? { foreignCurrency: paid.currency, foreignAmount: paid.paid } : {}),
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: paymentId,
      status: "paid",
      method: paymentMethodFromRazorpay(payment.method),
      referenceNumber: paymentId,
      invoiceNumber: invoice.invoiceNumber,
      paidAt: new Date(),
      ...razorpayChargeFields(payment),
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
          amountPaid: linkPaymentAmounts(link, payment).paid,
          amountPaidInr: linkPaymentAmounts(link, payment).inr || undefined,
          razorpayPaymentId: paymentId,
          method: String(payment.method || ""),
          ...razorpayChargeFields(payment),
        },
      },
      { new: true }
    ).lean();
    if (!updated) return { handled: true, duplicate: true };
    const amountText = moneyIn(updated.amountPaid || updated.amount, updated.currency);
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
