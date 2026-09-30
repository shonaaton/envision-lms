"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Copy, Download, FileText, Mail, Plus, Trash2, X } from "lucide-react";

import { generateInvoice } from "@/app/(dashboard)/staff-invoices/actions";
import {
  STAFF_INVOICE_EMAIL,
  amountInWordsINR,
  buildInvoiceLines,
  hoursLabel,
  invoiceDateLabel,
  invoiceEmailSubject,
  invoiceFileName,
  KIND_LABELS,
  type DraftGroup,
} from "@/lib/staffInvoice";
import { formatINR } from "@/lib/utils";

type ManualRow = { id: number; description: string; quantity: string; rate: string };

export type InvoiceBuilderProps = {
  month: string;
  monthLabel: string;
  months: Array<{ month: string; label: string }>;
  fullName: string;
  groups: DraftGroup[];
  pending: { count: number; amount: number };
  suggestedRates: Record<string, number>;
  manual: Array<{ description: string; quantity: number; rate: number }>;
  invoiceNumber: string;
  existing: { id: string; status: string; invoiceNumber: string; generatedAt: string } | null;
};

function rupees(paise: number) {
  const value = paise / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function toPaise(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function download(id: string, fileName: string) {
  const link = document.createElement("a");
  link.href = `/api/staff-invoices/${id}/pdf`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950">{value}</div>
        <button
          type="button"
          className="btn-outline h-9 shrink-0 px-3 text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success(`${label} copied`);
            } catch {
              toast.error("Copy failed - select the text instead.");
            }
          }}
        >
          <Copy size={13} /> Copy
        </button>
      </div>
    </div>
  );
}

function EmailDialog({ result, month, onClose }: { result: { id: string; fileName: string; subject: string; total: number }; month: string; onClose: () => void }) {
  const body = `Dear Envision Chess Academy,\n\nPlease find attached my invoice for ${month} for ${formatINR(result.total)}.\n\nRegards`;
  const mailto = `mailto:${STAFF_INVOICE_EMAIL}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(body)}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="invoice-email-title">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="invoice-email-title" className="text-lg font-black text-slate-950">
              Invoice ready - now email it
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Your invoice has downloaded. Send it to the academy by email with the file attached, using this subject line.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost h-8 w-8 p-0" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <CopyRow label="Send to" value={STAFF_INVOICE_EMAIL} />
          <CopyRow label="Subject" value={result.subject} />
          <CopyRow label="Attach this file" value={result.fileName} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={mailto} className="btn-primary h-10 px-4 text-sm">
            <Mail size={15} /> Open my email app
          </a>
          <button type="button" className="btn-outline h-10 px-4 text-sm" onClick={() => download(result.id, result.fileName)}>
            <Download size={15} /> Download again
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Your email app cannot attach the file for you - add the downloaded PDF before sending.</p>
      </div>
    </div>
  );
}

export function InvoiceBuilder(props: InvoiceBuilderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [invoiceNumber, setInvoiceNumber] = useState(props.invoiceNumber);
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.groups.filter((group) => group.needsRate).map((group) => [group.key, props.suggestedRates[group.key] !== undefined ? rupees(props.suggestedRates[group.key]) : ""]))
  );
  const [manual, setManual] = useState<ManualRow[]>(() =>
    props.manual.map((item, index) => ({ id: index + 1, description: item.description, quantity: String(item.quantity), rate: rupees(item.rate) }))
  );
  const [result, setResult] = useState<{ id: string; fileName: string; subject: string; total: number } | null>(null);

  const isPaid = props.existing?.status === "paid";
  const needsRate = props.groups.filter((group) => group.needsRate);

  const preview = useMemo(() => {
    const entered = Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, toPaise(value)]));
    const manualLines = manual
      .filter((row) => row.description.trim() || row.rate.trim())
      .map((row) => ({ description: row.description || "Item", quantity: Number(row.quantity) || 0, rate: toPaise(row.rate) || 0 }));
    return buildInvoiceLines(props.groups, entered, manualLines);
  }, [rates, manual, props.groups]);

  function addManual() {
    setManual((rows) => [...rows, { id: Date.now(), description: "", quantity: "1", rate: "" }]);
  }

  function submit() {
    if (preview.missing.length) {
      toast.error("Enter your rate for every class marked 'Rate needed'.");
      return;
    }
    startTransition(async () => {
      const response = await generateInvoice({
        month: props.month,
        invoiceNumber,
        rates: Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, Number(value)])),
        manual: manual
          .filter((row) => row.description.trim() || row.rate.trim())
          .map((row) => ({ description: row.description, quantity: Number(row.quantity), rate: Number(row.rate) })),
      });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      download(response.id, response.fileName);
      setResult({ id: response.id, fileName: response.fileName, subject: response.subject, total: response.total });
      router.refresh();
    });
  }

  const subject = invoiceEmailSubject({ invoiceNumber: invoiceNumber || "-", fullName: props.fullName, month: props.month });

  return (
    <div className="grid gap-3">
      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Month
          <select
            value={props.month}
            onChange={(event) => router.push(`/staff-invoices?month=${event.target.value}`)}
            className="input h-10"
          >
            {props.months.map((item) => (
              <option key={item.month} value={item.month}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Invoice number
          <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="input h-10" disabled={isPaid} maxLength={40} />
        </label>
        <div className="grid gap-1 text-xs font-semibold text-slate-700">
          Invoice date
          <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
            {invoiceDateLabel(props.month)} <span className="ml-1 text-xs font-normal text-slate-500">(last day of the month)</span>
          </div>
        </div>
      </section>

      {props.existing && (
        <div
          className={`rounded-lg border p-3 text-sm leading-6 ${
            isPaid ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"
          }`}
        >
          {isPaid ? (
            <>
              Invoice <span className="font-bold">{props.existing.invoiceNumber}</span> for {props.monthLabel} has been paid, so it can no longer be changed.
            </>
          ) : (
            <>
              You already generated invoice <span className="font-bold">{props.existing.invoiceNumber}</span> for {props.monthLabel}. Generating again replaces it
              with the classes as they stand now - send the new file.
            </>
          )}
          <button type="button" className="ml-2 font-bold underline" onClick={() => download(props.existing!.id, invoiceFileName(props.fullName, props.month))}>
            Download it
          </button>
        </div>
      )}

      {needsRate.length > 0 && !isPaid && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <AlertTriangle size={16} className="mt-1 shrink-0" />
          <p>
            <span className="font-bold">
              {needsRate.length} {needsRate.length === 1 ? "row has" : "rows have"} no rate from the academy yet.
            </span>{" "}
            Enter what you charge per class. Your rate is used on this invoice and is sent to the academy to approve for payroll.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <FileText size={16} /> Classes you took in {props.monthLabel}
          </h2>
        </div>
        {props.groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No classes are recorded for you this month. Add anything you are billing for below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-2 font-bold">Classroom</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Classes</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Hours</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Rate per class</th>
                  <th className="border-b border-slate-200 px-4 py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {props.groups.map((group) => {
                  const entered = toPaise(rates[group.key] || "");
                  const total = group.needsRate ? (entered === null ? null : entered * group.quantity) : group.amount;
                  return (
                    <tr key={group.key} className={`border-b border-slate-100 last:border-0 ${group.needsRate ? "bg-amber-50/60" : ""}`}>
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-950">{group.title}</div>
                        <div className="text-xs text-slate-500">
                          {group.group === "class"
                            ? [group.batchName, KIND_LABELS[group.kind]].filter(Boolean).join(" - ")
                            : group.group === "demo"
                              ? "Trial classes across all demo classrooms"
                              : "Demo students who enrolled"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{group.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{hoursLabel(group.minutes)}</td>
                      <td className="px-3 py-2 text-right">
                        {group.needsRate ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-500">Rs.</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="decimal"
                                value={rates[group.key] || ""}
                                onChange={(event) => setRates((current) => ({ ...current, [group.key]: event.target.value }))}
                                className="input h-9 w-24 text-right"
                                aria-label={`Your rate per class for ${group.title}`}
                                placeholder="Rate needed"
                                disabled={isPaid}
                              />
                            </div>
                            <span className="text-[11px] text-amber-700">Sent to the academy to approve</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="tabular-nums">{formatINR(group.rate || 0)}</span>
                            {group.inferredSessions.length > 0 && (
                              <span className="max-w-[14rem] text-right text-[11px] leading-4 text-amber-700">
                                {group.inferredSessions.length} {group.inferredSessions.length === 1 ? "class had" : "classes had"} no rate on record -
                                billed at this batch&apos;s rate and sent to the academy to approve
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums">{total === null ? <span className="text-slate-400">-</span> : formatINR(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {props.pending.count > 0 && (
          <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
            {props.pending.count} {props.pending.count === 1 ? "class is" : "classes are"} waiting on an admin&apos;s no-show ruling (worth{" "}
            {formatINR(props.pending.amount)}) and {props.pending.count === 1 ? "is" : "are"} not included. They appear once ruled.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-950">Other items</h2>
          {!isPaid && (
            <button type="button" onClick={addManual} className="btn-outline h-8 px-3 text-xs">
              <Plus size={13} /> Add item
            </button>
          )}
        </div>
        {manual.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">Anything else agreed with the academy - a fixed monthly fee, an incentive, travel. Add it as an item.</p>
        ) : (
          <div className="grid gap-2 p-4">
            {manual.map((row) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_7rem_2.5rem] sm:items-end">
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Description
                  <input
                    value={row.description}
                    onChange={(event) => setManual((rows) => rows.map((item) => (item.id === row.id ? { ...item, description: event.target.value } : item)))}
                    className="input h-9"
                    maxLength={200}
                    placeholder="e.g. Monthly retainer"
                    disabled={isPaid}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Quantity
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity}
                    onChange={(event) => setManual((rows) => rows.map((item) => (item.id === row.id ? { ...item, quantity: event.target.value } : item)))}
                    className="input h-9 text-right"
                    disabled={isPaid}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Rate (Rs.)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.rate}
                    onChange={(event) => setManual((rows) => rows.map((item) => (item.id === row.id ? { ...item, rate: event.target.value } : item)))}
                    className="input h-9 text-right"
                    disabled={isPaid}
                  />
                </label>
                <div className="flex h-9 items-center justify-end text-sm font-bold tabular-nums">
                  {formatINR(Math.round((Number(row.quantity) || 0) * (toPaise(row.rate) || 0)))}
                </div>
                {!isPaid && (
                  <button
                    type="button"
                    className="btn-ghost h-9 w-9 p-0 text-rose-600"
                    aria-label="Remove item"
                    onClick={() => setManual((rows) => rows.filter((item) => item.id !== row.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-2 rounded-xl border border-brand/30 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-slate-700">Invoice total</span>
          <span className="text-2xl font-black tabular-nums text-slate-950">{formatINR(preview.total)}</span>
        </div>
        <p className="text-sm text-slate-600">{amountInWordsINR(preview.total)}</p>
        <p className="text-xs text-slate-500">
          Will download as <span className="font-semibold">{invoiceFileName(props.fullName, props.month)}</span> - email it to {STAFF_INVOICE_EMAIL} with the subject
          &quot;{subject}&quot;.
        </p>
        {!isPaid && (
          <div className="mt-1">
            <button type="button" onClick={submit} disabled={pending} className="btn-primary h-11 px-6 text-sm">
              <Download size={16} /> {pending ? "Generating..." : props.existing ? "Regenerate invoice" : "Generate invoice"}
            </button>
          </div>
        )}
      </section>

      {result && <EmailDialog result={result} month={props.monthLabel} onClose={() => setResult(null)} />}
    </div>
  );
}
