import { Invoice } from "@/models/Fee";
import { dbConnect } from "@/lib/db";
import { cancelPaymentLink, createPaymentLink, razorpayConfigured } from "@/lib/payments/razorpay";
import { canonicalPhoneNumber } from "@/lib/phoneCountryCodes";
import { collectsThroughRazorpay } from "@/lib/payments/gstAccount";
import { upiPayPageUrl } from "@/lib/payments/upiPayment";

type StoredLink = { id?: string; shortUrl?: string; amount?: number; status?: string } | null | undefined;

export type InvoiceLinkAction = "none" | "reuse" | "create" | "replace";

/**
 * What a reminder should do about an invoice's payment link. A link is for one
 * exact amount, so once a late fee (or a waiver) changes the total, the old link
 * would collect the wrong figure: it is cancelled and a new one made. A non-GST
 * invoice never gets one: Razorpay pays into the GST account.
 */
export function decideInvoiceLinkAction(invoice: { status?: string; totalAmount?: number; invoiceMode?: string; gstPercentage?: number; razorpayLink?: StoredLink }): InvoiceLinkAction {
  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "draft") return "none";
  if (!collectsThroughRazorpay(invoice)) return "none";
  if (!(Number(invoice.totalAmount) > 0)) return "none";
  const link = invoice.razorpayLink;
  if (!link?.id || link.status !== "active") return "create";
  return Number(link.amount) === Number(invoice.totalAmount) ? "reuse" : "replace";
}

/**
 * Where the family pays this invoice: the Razorpay link for a GST invoice's
 * current total (made or replaced as needed), or the UPI pay page for a non-GST
 * one. Returns "" when there is nothing to pay or it cannot be made, so the
 * caller falls back to the invoice URL and a reminder is never lost over it.
 */
export async function ensureInvoicePaymentLink(invoiceId: string): Promise<string> {
  const result = await invoicePaymentLink(invoiceId);
  return result.ok ? result.url : "";
}

const PAYABLE_STATUSES = new Set(["unpaid", "overdue"]);

export type InvoicePayLink = { ok: true; url: string; kind: "razorpay" | "upi" } | { ok: false; error: string };

// Razorpay rejects the whole link over a malformed prefill, and legacy accounts
// hold a few, so anything doubtful is left for the parent to type on the page.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function prefillEmail(...candidates: unknown[]) {
  return candidates.map((value) => String(value || "").trim()).find((value) => EMAIL.test(value));
}

/** As ensureInvoicePaymentLink, but says why there is no link (for the Fees > Invoices button). */
export async function invoicePaymentLink(invoiceId: string): Promise<InvoicePayLink> {
  await dbConnect();
  const invoice: any = await Invoice.findById(invoiceId).populate("student", "name parentName email parentEmail phone countryCode").lean();
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (!PAYABLE_STATUSES.has(invoice.status) || !(Number(invoice.totalAmount) > 0)) {
    return { ok: false, error: `This invoice is ${invoice.status === "paid" || invoice.status === "cancelled" ? invoice.status : "not payable"}, so it has no pay link.` };
  }
  if (!collectsThroughRazorpay(invoice)) {
    // Non-GST money goes to the foundation's UPI account. An invoice switched to
    // non-GST after a reminder went out also loses its Razorpay link.
    await retireInvoicePaymentLink(invoice);
    const url = upiPayPageUrl(String(invoice._id));
    return url ? { ok: true, url, kind: "upi" } : { ok: false, error: "The UPI pay page needs the app URL and AUTH_SECRET set on the server." };
  }
  if (!razorpayConfigured()) return { ok: false, error: "Razorpay is not configured on the server." };
  const action = decideInvoiceLinkAction(invoice);
  if (action === "none") return { ok: false, error: "This invoice has no pay link." };
  if (action === "reuse") return { ok: true, url: invoice.razorpayLink.shortUrl, kind: "razorpay" };
  try {
    if (action === "replace") {
      // The old link is for the old total. Unless Razorpay confirms it is
      // closed, a new one would leave two payable links for one bill.
      const closed = await cancelPaymentLink(invoice.razorpayLink?.id);
      if (closed === "paid") return { ok: false, error: "The earlier pay link for this invoice was just paid. The payment is being recorded." };
      if (closed === "failed") return { ok: false, error: "Razorpay did not cancel the earlier pay link, so a new one was not made. Try again in a minute." };
      await Invoice.updateOne({ _id: invoice._id, "razorpayLink.id": invoice.razorpayLink.id }, { $set: { "razorpayLink.status": "cancelled" } });
    }
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
        email: prefillEmail(student.parentEmail, student.email),
        contact: phone.length >= 10 && phone.length <= 15 ? `+${phone}` : undefined,
      },
      notes: { kind: "invoice", invoiceId: String(invoice._id) },
    });
    await Invoice.findByIdAndUpdate(invoiceId, {
      razorpayLink: { id: link.id, shortUrl: link.shortUrl, amount: invoice.totalAmount, referenceId, status: "active", createdAt: new Date() },
    });
    return { ok: true, url: link.shortUrl, kind: "razorpay" };
  } catch (error: any) {
    console.error("Invoice payment link failed", { invoiceId, error: error?.error || error });
    return { ok: false, error: error?.error?.description || "Razorpay did not create the link. Try again in a minute." };
  }
}

/**
 * Called when an invoice is settled some other way or voided, so the parent
 * cannot pay a second time through a link from an earlier reminder.
 */
export async function retireInvoicePaymentLink(invoice: { _id?: unknown; razorpayLink?: StoredLink } | null | undefined) {
  const link = invoice?.razorpayLink;
  if (!invoice?._id || !link?.id || link.status !== "active") return;
  // Left "active" when the cancel fails, so the next settle or void tries again.
  if ((await cancelPaymentLink(link.id)) !== "closed") return;
  await Invoice.updateOne({ _id: invoice._id, "razorpayLink.id": link.id }, { $set: { "razorpayLink.status": "cancelled" } });
}
