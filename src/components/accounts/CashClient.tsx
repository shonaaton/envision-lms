"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, ChevronDown, ChevronUp } from "lucide-react";

import { cancelInvoicesAction, saveCashSettingsAction } from "@/app/(dashboard)/admin/accounts/actions";
import { rupees } from "@/components/accounts/format";

export function CashSettingsForm({ openingCash, cashHolder }: { openingCash: number; cashHolder: string }) {
  const router = useRouter();
  const [opening, setOpening] = useState(String(openingCash / 100));
  const [holder, setHolder] = useState(cashHolder);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveCashSettingsAction({ openingCash: opening, cashHolder: holder });
          if (!result.ok) toast.error(result.error);
          else {
            toast.success("Saved");
            router.refresh();
          }
        });
      }}
    >
      <label className="grid gap-1 text-xs font-semibold text-slate-700">
        Cash held on 1 April 2026 (₹)
        <input className="input h-9 w-40" inputMode="decimal" value={opening} onChange={(event) => setOpening(event.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">
        Held by
        <input className="input h-9 w-40" value={holder} onChange={(event) => setHolder(event.target.value)} />
      </label>
      <button type="submit" className="btn-outline h-9 px-4 text-xs" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </button>
      <span className="pb-2 text-xs text-slate-500">Negative if the holder was owed money on that day.</span>
    </form>
  );
}

type Invoice = { id: string; invoiceNumber: string; title: string; dueDate: string; total: number; status: string };

export function ReceivableRow({
  name,
  username,
  groupLabel,
  total,
  buckets,
  lastPaidAt,
  invoices,
  canCancel,
}: {
  name: string;
  username: string;
  groupLabel: string;
  total: number;
  buckets: { notDue: number; upTo30: number; upTo60: number; over60: number };
  lastPaidAt: string;
  invoices: Invoice[];
  canCancel?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-");

  function cancel(ids: string[]) {
    if (!reason.trim()) {
      toast.error('Write why first, e.g. "left in July".');
      return;
    }
    if (!window.confirm(`Cancel ${ids.length} bill${ids.length === 1 ? "" : "s"} for ${name}? This is the same as Cancel on the Fees page.`)) return;
    startTransition(async () => {
      const result = await cancelInvoicesAction(ids, reason);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`Cancelled ${result.cancelled} bill${result.cancelled === 1 ? "" : "s"}`);
        router.refresh();
      }
    });
  }

  return (
    <>
      <tr className="border-b border-slate-100 align-top">
        <td className="px-3 py-2">
          <button type="button" className="flex items-center gap-1 text-left font-semibold text-slate-950 hover:text-brand" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {name}
          </button>
          <div className="pl-5 text-xs text-slate-500">
            {username} - {groupLabel}
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{invoices.length}</td>
        <td className="px-3 py-2 text-right tabular-nums">{buckets.notDue ? rupees(buckets.notDue) : "-"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{buckets.upTo30 ? rupees(buckets.upTo30) : "-"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{buckets.upTo60 ? rupees(buckets.upTo60) : "-"}</td>
        <td className="px-3 py-2 text-right tabular-nums text-rose-700">{buckets.over60 ? rupees(buckets.over60) : "-"}</td>
        <td className="px-3 py-2 text-right font-bold tabular-nums">{rupees(total)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{day(lastPaidAt)}</td>
      </tr>
      {open && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={8} className="px-3 py-2">
            <ul className="space-y-1 text-sm">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{invoice.invoiceNumber}</b> {invoice.title} - due {day(invoice.dueDate)} - {invoice.status}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{rupees(invoice.total)}</span>
                    {canCancel && (
                      <button type="button" className="btn-ghost h-7 px-2 text-xs text-rose-700" disabled={pending} onClick={() => cancel([invoice.id])}>
                        <Ban size={12} /> Cancel
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {canCancel && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input h-8 w-64 text-xs" value={reason} onChange={(event) => setReason(event.target.value)} placeholder='Why, e.g. "left in July"' />
                <button type="button" className="btn-outline h-8 px-3 text-xs text-rose-700" disabled={pending} onClick={() => cancel(invoices.map((invoice) => invoice.id))}>
                  <Ban size={12} /> Cancel all {invoices.length} bills
                </button>
                <span className="text-xs text-slate-500">Also deactivate the student in Users if they have left.</span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
