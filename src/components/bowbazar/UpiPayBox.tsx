import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { CopyText } from "@/components/fees/CopyText";
import { nonGstUpiAccount, upiPaymentUri } from "@/lib/payments/upiPayment";
import { formatINR } from "@/lib/utils";

/**
 * A UPI QR for a Bowbazar family's whole balance, into the foundation's
 * account (the same one the online non-GST QR uses; user, 2026-11-24).
 * UPI doesn't tell us about the payment, so the centre still marks it paid.
 * Server component: it renders the QR as inline SVG.
 */
export async function UpiPayBox({ amount, note, compact = false }: { amount: number; note: string; compact?: boolean }) {
  const { upiId, payeeName } = nonGstUpiAccount();
  const upiUri = upiPaymentUri({ amount, note });
  const qrSvg = await QRCode.toString(upiUri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <div className={compact ? "grid items-center gap-4 sm:grid-cols-[11rem_1fr]" : "space-y-4"}>
      <div className="rounded-xl border border-slate-200 p-3 text-center">
        <div className={compact ? "mx-auto w-40" : "mx-auto w-56"} dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="mt-1 text-xs font-bold text-slate-700">{payeeName}</p>
      </div>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Scan with any UPI app (Google Pay, PhonePe, Paytm, BHIM). <span className="font-bold text-slate-900">{formatINR(amount)}</span> is filled in.
        </p>
        <a href={upiUri} className="btn-primary flex h-11 w-full items-center justify-center gap-2 sm:w-auto sm:px-5">
          <Smartphone size={17} /> Pay {formatINR(amount)} with a UPI app
        </a>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Or pay to this UPI ID</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="break-all font-bold">{upiId}</span>
            <CopyText value={upiId} label="Copy" />
          </div>
          <p className="mt-1 text-xs text-slate-500">Note: {note}</p>
        </div>
      </div>
    </div>
  );
}

/** What the UPI note says, so the centre can match the payment to the student. */
export function branchUpiNote(studentName: string, regNo?: string) {
  return ["Bowbazar", regNo, studentName].filter(Boolean).join(" ");
}
