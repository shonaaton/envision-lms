import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isValidObjectId } from "mongoose";
import QRCode from "qrcode";
import { CheckCircle2, MessageCircle, Smartphone } from "lucide-react";
import { CopyText } from "@/components/fees/CopyText";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL, ACADEMY_PHONE_DISPLAY } from "@/lib/branding";
import { dbConnect } from "@/lib/db";
import { collectsThroughRazorpay } from "@/lib/payments/gstAccount";
import { ensureInvoicePaymentLink } from "@/lib/payments/invoicePaymentLink";
import { nonGstUpiAccount, upiPaymentUri, verifyUpiPaySignature } from "@/lib/payments/upiPayment";
import { formatINR } from "@/lib/utils";
import { Invoice } from "@/models/Fee";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay your invoice | Envision Chess Academy", robots: { index: false, follow: false } };

/**
 * The page a non-GST invoice reminder links to (lib/payments/upiPayment.ts):
 * a UPI QR for the exact amount due, read live so a late fee or waiver shows
 * at once. UPI payments are not reported back, so the family is asked to send
 * the reference and the fees team marks the invoice paid.
 */
export default async function UpiPayPage({ params }: { params: { id: string; sig: string } }) {
  if (!isValidObjectId(params.id) || !verifyUpiPaySignature(params.id, params.sig)) notFound();
  await dbConnect();
  const invoice: any = await Invoice.findById(params.id).populate("student", "name").lean();
  if (!invoice) notFound();

  const payable = invoice.status === "unpaid" || invoice.status === "overdue";
  // Switched to GST since the reminder went out: that money goes through Razorpay.
  if (payable && collectsThroughRazorpay(invoice)) {
    const razorpayUrl = await ensureInvoicePaymentLink(String(invoice._id));
    if (razorpayUrl) redirect(razorpayUrl);
  }

  const { upiId, payeeName } = nonGstUpiAccount();
  const studentName = invoice.student?.name || "";
  const note = `${invoice.invoiceNumber || "Invoice"}${studentName ? ` ${studentName}` : ""}`;
  const upiUri = upiPaymentUri({ amount: invoice.totalAmount, note });
  const qrSvg = payable ? await QRCode.toString(upiUri, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : "";
  const academyWhatsApp = `https://wa.me/${ACADEMY_DEFAULTS.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Payment done for invoice ${invoice.invoiceNumber || ""}${studentName ? ` (${studentName})` : ""}. UPI reference: `)}`;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-brand px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" className="h-8 w-auto" />
        </div>
        <div className="space-y-5 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Invoice {invoice.invoiceNumber}</p>
            {studentName && <p className="mt-1 text-sm text-slate-600">For {studentName}</p>}
            <p className="mt-2 text-4xl font-black">{formatINR(invoice.totalAmount)}</p>
            {invoice.title && <p className="mt-1 text-sm text-slate-600">{invoice.title}</p>}
          </div>

          {!payable ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              {invoice.status === "paid" ? "This invoice is paid. Thank you!" : "This invoice is no longer due. Nothing to pay here."}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-sm font-bold">Scan with any UPI app</p>
                <p className="text-xs text-slate-500">Google Pay, PhonePe, Paytm, BHIM. The amount is filled in.</p>
                <div className="mx-auto mt-3 w-56" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <p className="mt-2 text-sm font-bold">{payeeName}</p>
              </div>

              <a href={upiUri} className="btn-primary flex h-12 w-full items-center justify-center gap-2 text-base">
                <Smartphone size={18} /> Pay {formatINR(invoice.totalAmount)} with a UPI app
              </a>
              <p className="-mt-3 text-center text-xs text-slate-500">On a phone, this opens your UPI app with the amount filled in.</p>

              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Or pay to this UPI ID</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="break-all font-bold">{upiId}</span>
                  <CopyText value={upiId} label="Copy" />
                </div>
                <p className="mt-1 text-xs text-slate-500">Amount: {formatINR(invoice.totalAmount)} · Note: {note}</p>
              </div>

              <a href={academyWhatsApp} target="_blank" rel="noreferrer" className="btn-outline flex h-11 w-full items-center justify-center gap-2">
                <MessageCircle size={16} /> After paying, send us the UPI reference
              </a>
              <p className="-mt-3 text-center text-xs text-slate-500">WhatsApp {ACADEMY_PHONE_DISPLAY}. We mark the invoice paid once it arrives.</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
