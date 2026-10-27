import { Invoice } from "@/models/Fee";
import { dbConnect } from "@/lib/db";
import { cancelPaymentLink, createPaymentLink, razorpayConfigured } from "@/lib/payments/razorpay";
import { canonicalPhoneNumber } from "@/lib/phoneCountryCodes";

type StoredLink = { id?: string; shortUrl?: string; amount?: number; status?: string } | null | undefined;

export type InvoiceLinkAction = "none" | "reuse" | "create" | "replace";

/**
 * What a reminder should do about an invoice's payment link. A link is for one
 * exact amount, so once a late fee (or a waiver) changes the total, the old link
 * would collect the wrong figure: it is cancelled and a new one made.
 */
export function decideInvoiceLinkAction(invoice: { status?: string; totalAmount?: number; razorpayLink?: StoredLink }): InvoiceLinkAction {
  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "draft") return "none";
  if (!(Number(invoice.totalAmount) > 0)) return "none";
  const link = invoice.razorpayLink;
  if (!link?.id || link.status !== "active") return "create";
  return Number(link.amount) === Number(invoice.totalAmount) ? "reuse" : "replace";
}

/**
 * The Razorpay link for this invoice's current total, made or replaced as needed.
 * Returns "" when there is nothing to pay or Razorpay is not configured, so the
 * caller falls back to the invoice URL and a reminder is never lost over it.
 */
export async function ensureInvoicePaymentLink(invoiceId: string): Promise<string> {
  if (!razorpayConfigured()) return "";
  await dbConnect();
  const invoice: any = await Invoice.findById(invoiceId).populate("student", "name parentName email parentEmail phone countryCode").lean();
  if (!invoice) return "";
  const action = decideInvoiceLinkAction(invoice);
  if (action === "none") return "";
  if (action === "reuse") return invoice.razorpayLink.shortUrl || "";
  try {
    if (action === "replace") await cancelPaymentLink(invoice.razorpayLink?.id);
    const counter: any = await Invoice.findByIdAndUpdate(invoiceId, { $inc: { razorpayLinkSeq: 1 } }, { new: true }).select("razorpayLinkSeq").lean();
    const referenceId = `${invoice.invoiceNumber || invoice._id}-L${counter?.razorpayLinkSeq || 1}`;
    const student = invoice.student || {};
    const phone = canonicalPhoneNumber(student.phone, student.countryCode);
    const link = await createPaymentLink({
      amount: invoice.totalAmount,
      description: `Envision Chess Academy - ${invoice.invoiceNumber || "Invoice"}${student.name ? ` for ${student.name}` : ""}`,
      referenceId,
      customer: {
        name: student.parentName || student.name,
        email: student.parentEmail || student.email,
        contact: phone ? `+${phone}` : undefined,
      },
      notes: { kind: "invoice", invoiceId: String(invoice._id) },
    });
    await Invoice.findByIdAndUpdate(invoiceId, {
      razorpayLink: { id: link.id, shortUrl: link.shortUrl, amount: invoice.totalAmount, referenceId, status: "active", createdAt: new Date() },
    });
    return link.shortUrl;
  } catch (error) {
    console.error("Invoice payment link failed", { invoiceId, error: (error as any)?.error || error });
    return "";
  }
}

/**
 * Called when an invoice is settled some other way or voided, so the parent
 * cannot pay a second time through a link from an earlier reminder.
 */
export async function retireInvoicePaymentLink(invoice: { _id?: unknown; razorpayLink?: StoredLink } | null | undefined) {
  const link = invoice?.razorpayLink;
  if (!invoice?._id || !link?.id || link.status !== "active") return;
  await cancelPaymentLink(link.id);
  await Invoice.updateOne({ _id: invoice._id, "razorpayLink.id": link.id }, { $set: { "razorpayLink.status": "cancelled" } });
}
