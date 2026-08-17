"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { formatINR } from "@/lib/utils";

type ServerAction = (formData: FormData) => Promise<void>;
type TransactionDraft = {
  id: string;
  mode: "upi" | "bank_transfer" | "other";
  amount: string;
  paidAt: string;
  referenceNumber: string;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function newTransaction(amount = ""): TransactionDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode: "upi",
    amount,
    paidAt: todayKey(),
    referenceNumber: "",
  };
}

export function InvoicePaymentModal({
  invoiceId,
  amount,
  lateFee,
  totalAmount,
  invoiceMode,
  gstPercentage,
  action,
}: {
  invoiceId: string;
  amount: number;
  lateFee: number;
  totalAmount: number;
  invoiceMode: "included" | "excluded" | "non_gst";
  gstPercentage: number;
  action: ServerAction;
}) {
  const [open, setOpen] = useState(false);
  const [waiveLateFee, setWaiveLateFee] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [transactions, setTransactions] = useState<TransactionDraft[]>(() => [newTransaction(String((totalAmount || 0) / 100))]);
  const discountPaise = Math.max(0, Math.round(Number(discountAmount || 0) * 100));
  const adjustedTotal = useMemo(() => {
    const adjustedBase = Math.max(0, Number(amount || 0) - discountPaise);
    const adjustedLateFee = waiveLateFee ? 0 : Math.max(0, Number(lateFee || 0));
    const gross = adjustedBase + adjustedLateFee;
    const gst = invoiceMode === "non_gst" || !gstPercentage
      ? 0
      : invoiceMode === "included"
        ? gross - Math.round((gross * 100) / (100 + gstPercentage))
        : Math.round((gross * gstPercentage) / 100);
    return invoiceMode === "excluded" ? gross + gst : gross;
  }, [amount, discountPaise, gstPercentage, invoiceMode, lateFee, waiveLateFee]);
  const enteredPaise = useMemo(
    () => transactions.reduce((sum, transaction) => sum + Math.round(Number(transaction.amount || 0) * 100), 0),
    [transactions]
  );
  const remaining = adjustedTotal - enteredPaise;
  const matches = remaining === 0;

  const update = (id: string, patch: Partial<TransactionDraft>) => {
    setTransactions((current) => current.map((transaction) => transaction.id === id ? { ...transaction, ...patch } : transaction));
  };

  const remove = (id: string) => {
    setTransactions((current) => current.length <= 1 ? current : current.filter((transaction) => transaction.id !== id));
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-700">
        <CheckCircle2 size={14} /> Mark Paid
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <form action={action} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-2xl">
            <input type="hidden" name="invoice" value={invoiceId} />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Record Payment</h3>
                <p className="mt-1 text-sm text-slate-500">Enter one or more transactions until the invoice total is matched.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 grid gap-2 sm:grid-cols-4">
              <Summary label="Invoice Total" value={formatINR(totalAmount)} />
              <Summary label="Payable" value={formatINR(adjustedTotal)} tone={adjustedTotal < totalAmount ? "good" : "neutral"} />
              <Summary label="Entered" value={formatINR(enteredPaise)} />
              <Summary label={remaining >= 0 ? "Remaining" : "Extra"} value={formatINR(Math.abs(remaining))} tone={matches ? "good" : "warn"} />
            </div>

            <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[0.75fr_1fr_1fr]">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input name="waiveLateFee" type="checkbox" checked={waiveLateFee} onChange={(event) => setWaiveLateFee(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Remove late fees
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-500">Discount Amount</span>
                <input name="discountAmount" type="number" min="0" step="0.01" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-500">Adjustment Note</span>
                <input name="paymentAdjustmentNote" placeholder="Optional" className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" />
              </label>
              {lateFee > 0 && <div className="md:col-span-3 text-xs font-semibold text-slate-500">Current late fee: {formatINR(lateFee)}</div>}
            </div>

            <div className="space-y-3">
              {transactions.map((transaction, index) => (
                <div key={transaction.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Transaction {index + 1}</span>
                    <button type="button" onClick={() => remove(transaction.id)} disabled={transactions.length <= 1} className="grid h-8 w-8 place-items-center rounded-md border border-rose-200 text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="space-y-1">
                      <span className="text-xs font-bold text-slate-500">Mode</span>
                      <select name="paymentMode" value={transaction.mode} onChange={(event) => update(transaction.id, { mode: event.target.value as TransactionDraft["mode"] })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                        <option value="upi">UPI</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="other">Others</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-bold text-slate-500">Amount</span>
                      <input name="paymentAmount" type="number" min="0" step="0.01" required value={transaction.amount} onChange={(event) => update(transaction.id, { amount: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-bold text-slate-500">Date</span>
                      <input name="paymentDate" type="date" required value={transaction.paidAt} onChange={(event) => update(transaction.id, { paidAt: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-bold text-slate-500">Reference ID</span>
                      <input name="paymentReference" value={transaction.referenceNumber} onChange={(event) => update(transaction.id, { referenceNumber: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setTransactions((current) => [...current, newTransaction(remaining > 0 ? String(remaining / 100) : "")])} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700">
                <Plus size={15} /> Add Transaction
              </button>
              <button disabled={!matches} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                <CheckCircle2 size={15} /> Mark as Paid
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Summary({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === "good" ? "border-emerald-200 bg-emerald-50" : tone === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-950">{value}</div>
    </div>
  );
}
