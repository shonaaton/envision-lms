"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { formatINR } from "@/lib/utils";

type ServerAction = (formData: FormData) => Promise<void>;

export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
  studentFilter,
  totalAmount,
  credits,
  invoiceType,
  action,
}: {
  invoiceId: string;
  invoiceNumber: string;
  studentFilter: string;
  totalAmount: number;
  credits: number;
  invoiceType: string;
  action: ServerAction;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700">
        <Trash2 size={14} /> Delete
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <form action={action} className="w-full max-w-lg rounded-lg bg-white p-4 shadow-2xl">
            <input type="hidden" name="invoice" value={invoiceId} />
            <input type="hidden" name="studentFilter" value={studentFilter} />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Delete Invoice</h3>
                <p className="mt-1 text-sm text-slate-500">A reason is required and will be visible in deleted invoices.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-bold text-slate-950">{invoiceNumber || "Invoice"}</div>
              <div className="mt-1 text-slate-600">{formatINR(totalAmount)} · {invoiceType === "credits" ? `${credits || 0} credits` : invoiceType}</div>
              {invoiceType === "credits" && credits > 0 && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  If this paid credit invoice added credits, those credits will be reversed.
                </div>
              )}
            </div>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Reason</span>
              <textarea
                name="deleteReason"
                required
                minLength={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-[110px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                placeholder="Example: Duplicate invoice created for the same credit pack"
              />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-700">
                Cancel
              </button>
              <button disabled={reason.trim().length < 3} className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                <Trash2 size={15} /> Delete Invoice
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
