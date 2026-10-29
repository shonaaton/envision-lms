import type { ReceiptView } from "@/lib/branch/receipts";
import PrintButton from "./PrintButton";

const rupees = (paise: number) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dateText = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-slate-200 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value || "-"}</span>
    </div>
  );
}

/** A fee receipt as printed: only this sheet shows on paper, not the portal around it. */
export default function ReceiptSheet({ receipt }: { receipt: ReceiptView }) {
  return (
    <div className="space-y-3">
      <style>{`@media print { body * { visibility: hidden !important; } #branch-receipt, #branch-receipt * { visibility: visible !important; } #branch-receipt { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: 0; } }`}</style>
      <div className="flex justify-end">
        <PrintButton />
      </div>
      <article id="branch-receipt" className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="text-lg font-black text-brand">Envision Chess Academy</div>
            <div className="text-sm text-slate-600">{receipt.branchLabel} centre</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Fee receipt</div>
            <div className="font-mono text-sm font-bold text-slate-900">{receipt.receiptNo}</div>
            <div className="text-xs text-slate-500">{dateText(receipt.paidAt)}</div>
          </div>
        </header>
        <div className="py-4">
          <Line label="Received from" value={[receipt.parentName, receipt.parentName ? `for ${receipt.studentName}` : receipt.studentName].filter(Boolean).join(" ")} />
          {receipt.regNo && <Line label="Registration no." value={receipt.regNo} />}
          <Line label="Towards" value={receipt.towards} />
          <Line label="Paid by" value={[receipt.mode, receipt.reference].filter(Boolean).join(" · ")} />
          {receipt.collectedByName && <Line label="Received by" value={receipt.collectedByName} />}
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-slate-600">Amount received</span>
            <span className="text-2xl font-black text-slate-950">{rupees(receipt.amount)}</span>
          </div>
          <div className="mt-1 text-sm italic text-slate-600">{receipt.amountInWords}</div>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          {receipt.monthLabel}: due {rupees(receipt.billDue)}, paid {rupees(receipt.paidOnBill)}
          {receipt.balance > 0 ? `, balance ${rupees(receipt.balance)}` : ", fully paid"}.
        </div>
        <footer className="mt-6 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
          This is a computer-generated receipt and needs no signature. Fees are not subject to GST.
        </footer>
      </article>
    </div>
  );
}
