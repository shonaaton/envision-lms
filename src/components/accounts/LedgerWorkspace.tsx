"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

import { saveEntryAction, voidEntryAction } from "@/app/(dashboard)/admin/accounts/actions";
import { rupees } from "@/components/accounts/format";
import { MONEY_ACCOUNTS, PAYROLL_CATEGORIES, defaultFlow, moneyAccountLabel, type AccountCategory } from "@/lib/accounts/categories";
import type { LedgerRow } from "@/lib/accounts/ledger";
import type { PreviewRow } from "@/lib/accounts/ledgerImport";

type Props = {
  rows: LedgerRow[];
  categories: AccountCategory[];
  today: string;
};

type FormState = {
  id?: string;
  category: string;
  date: string;
  amount: string;
  amountBasis: "gross" | "net_paid";
  tdsDeducted: boolean;
  gst: string;
  description: string;
  counterparty: string;
  paymentMode: string;
  student: string;
  month: string;
  account: "bank" | "cash";
  flow: "in" | "out";
};

const KIND_LABEL: Record<string, string> = { income: "Income", expense: "Cost", non_pl: "Not profit / loss" };

function istDay(iso: string) {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function blank(today: string): FormState {
  return { category: "", date: today, amount: "", amountBasis: "gross", tdsDeducted: true, gst: "", description: "", counterparty: "", paymentMode: "", student: "", month: "", account: "bank", flow: "out" };
}

export function LedgerWorkspace({ rows, categories, today }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  const byKey = new Map(categories.map((category) => [category.key, category]));
  const selected = form ? byKey.get(form.category) : undefined;

  function edit(row: LedgerRow) {
    setForm({
      id: row.id,
      category: row.category,
      date: istDay(row.date),
      amount: String(row.amount / 100),
      amountBasis: "gross",
      tdsDeducted: PAYROLL_CATEGORIES.includes(row.category) ? row.tdsAmount > 0 : true,
      gst: row.gstAmount ? String(row.gstAmount / 100) : "",
      description: row.description,
      counterparty: row.counterparty,
      paymentMode: row.paymentMode,
      student: row.studentName,
      month: row.month !== istDay(row.date).slice(0, 7) ? row.month : "",
      account: row.account === "cash" ? "cash" : "bank",
      flow: row.flow === "in" ? "in" : "out",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    startTransition(async () => {
      const result = await saveEntryAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? "Entry updated" : "Entry added");
      setForm(null);
      router.refresh();
    });
  }

  function remove(row: LedgerRow) {
    if (!window.confirm(`Remove ${rupees(row.amount)} ${byKey.get(row.category)?.label || row.category} on ${istDay(row.date)}?`)) return;
    startTransition(async () => {
      const result = await voidEntryAction(row.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Entry removed");
        router.refresh();
      }
    });
  }

  const set = (patch: Partial<FormState>) => setForm((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary h-9 px-4 text-xs" onClick={() => setForm(blank(today))}>
          <Plus size={14} /> Add cost or income
        </button>
      </div>

      {form && (
        <form onSubmit={submit} className="rounded-lg border border-brand/20 bg-white p-4 shadow-sm shadow-brand/10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-950">{form.id ? "Edit entry" : "New entry"}</h2>
            <button type="button" className="btn-ghost h-8 px-2" onClick={() => setForm(null)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              Category
              <select className="input h-9" value={form.category} onChange={(event) => set({ category: event.target.value, flow: defaultFlow(event.target.value) })} required>
                <option value="">Pick one</option>
                {(["expense", "income", "non_pl"] as const).map((kind) => (
                  <optgroup key={kind} label={KIND_LABEL[kind]}>
                    {categories
                      .filter((category) => category.kind === kind)
                      .map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              Date
              <input type="date" className="input h-9" value={form.date} onChange={(event) => set({ date: event.target.value })} required />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              Amount (₹)
              <input inputMode="decimal" className="input h-9" value={form.amount} onChange={(event) => set({ amount: event.target.value })} placeholder="12,500" required />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              {selected?.kind === "income" ? "Received into" : "Paid from"}
              <select className="input h-9" value={form.account} onChange={(event) => set({ account: event.target.value as FormState["account"] })}>
                {MONEY_ACCOUNTS.map((account) => (
                  <option key={account.key} value={account.key}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>
            {selected?.kind === "non_pl" && (
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Money
                <select className="input h-9" value={form.flow} onChange={(event) => set({ flow: event.target.value as FormState["flow"] })}>
                  <option value="in">Came in</option>
                  <option value="out">Went out</option>
                </select>
              </label>
            )}
            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              {selected?.kind === "income" ? "Received from" : "Paid to"}
              <input className="input h-9" value={form.counterparty} onChange={(event) => set({ counterparty: event.target.value })} placeholder="Optional" />
            </label>

            {PAYROLL_CATEGORIES.includes(form.category) && (
              <>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  This amount is
                  <select className="input h-9" value={form.amountBasis} onChange={(event) => set({ amountBasis: event.target.value as FormState["amountBasis"] })}>
                    <option value="gross">The invoice (before TDS)</option>
                    <option value="net_paid">What they received (after TDS)</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={form.tdsDeducted} onChange={(event) => set({ tdsDeducted: event.target.checked })} />
                  10% TDS was deducted
                </label>
              </>
            )}

            {selected?.kind === "income" && (
              <>
                {form.category === "offline_fees" && (
                  <label className="grid gap-1 text-xs font-semibold text-slate-700">
                    Student
                    <input className="input h-9" value={form.student} onChange={(event) => set({ student: event.target.value })} placeholder="Username, phone or full name" />
                  </label>
                )}
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  GST inside the amount (₹)
                  <input inputMode="decimal" className="input h-9" value={form.gst} onChange={(event) => set({ gst: event.target.value })} placeholder="Blank if non-GST" />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Mode
                  <input className="input h-9" value={form.paymentMode} onChange={(event) => set({ paymentMode: event.target.value })} placeholder="cash / UPI / bank" />
                </label>
              </>
            )}

            <label className="grid gap-1 text-xs font-semibold text-slate-700">
              Counts in month
              <input type="month" className="input h-9" value={form.month} onChange={(event) => set({ month: event.target.value })} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">
              Description
              <input className="input h-9" value={form.description} onChange={(event) => set({ description: event.target.value })} placeholder="What it was for" />
            </label>
          </div>
          {selected && (
            <p className="mt-2 text-xs text-slate-500">
              {selected.kind === "non_pl"
                ? "Recorded for the bank cross-check and the GST / TDS balance, but not counted as a cost or as income."
                : PAYROLL_CATEGORIES.includes(form.category)
                  ? "Pay is booked at the full amount before TDS; the 10% TDS is shown as owed to the government until a TDS deposit is entered. Leave the month blank to count it in the month of the date."
                  : selected.kind === "income"
                    ? "Counted as revenue net of any GST you enter."
                    : "Counted as a cost in the month of the date."}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary h-9 px-4 text-xs">
              {pending ? "Saving..." : form.id ? "Save changes" : "Add entry"}
            </button>
            <button type="button" className="btn-ghost h-9 px-4 text-xs" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm shadow-brand/5">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No entries for this filter yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Date</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Category</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Details</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Amount</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Account</th>
                <th className="border-b border-slate-200 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const category = byKey.get(row.category);
                return (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {istDay(row.date)}
                      {row.month !== istDay(row.date).slice(0, 7) && <div className="text-xs text-slate-500">for {row.month}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-950">{category?.label || row.category}</div>
                      <div className="text-xs text-slate-500">{KIND_LABEL[category?.kind || row.kind]}</div>
                    </td>
                    <td className="max-w-md px-3 py-2 text-slate-700">
                      <div className="truncate">{row.description || "-"}</div>
                      <div className="text-xs text-slate-500">
                        {[row.counterparty, row.studentName && `Student: ${row.studentName}${row.studentId ? "" : " (not matched)"}`, row.paymentMode]
                          .filter(Boolean)
                          .join(" - ")}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      <div className="font-bold text-slate-950">{rupees(row.amount)}</div>
                      {row.tdsAmount > 0 && <div className="text-xs text-slate-500">incl. TDS {rupees(row.tdsAmount)}</div>}
                      {row.gstAmount > 0 && <div className="text-xs text-slate-500">incl. GST {rupees(row.gstAmount)}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      <div className="font-semibold text-slate-700">{moneyAccountLabel(row.account)}</div>
                      {row.source === "bank_statement" ? "Bank statement" : row.source === "csv_import" ? "Sheet import" : "Typed"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {row.source !== "bank_statement" && (
                        <button type="button" className="btn-ghost h-8 px-2" onClick={() => edit(row)} aria-label="Edit">
                          <Pencil size={13} />
                        </button>
                      )}
                      <button type="button" className="btn-ghost h-8 px-2 text-rose-700" onClick={() => remove(row)} disabled={pending} aria-label="Remove">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Upload a costs or offline income sheet: preview first, then import. */
export function LedgerImport() {
  const router = useRouter();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(action: "preview" | "commit") {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("kind", kind);
      body.set("action", action);
      const response = await fetch("/api/admin/accounts/upload", { method: "POST", body });
      const result = await response.json().catch(() => ({ ok: false, error: "Upload failed." }));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (action === "preview") setPreview(result.rows);
      else {
        toast.success(
          `Imported ${result.imported} entries${result.settled ? `, marked ${result.settled} portal bills paid` : ""}${result.skipped ? `, skipped ${result.skipped}` : ""}`
        );
        setPreview(null);
        setFile(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const ok = preview?.filter((row) => row.status === "ok" || row.status === "settle" || row.status === "in_portal").length || 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-brand/5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-700">
          <FileSpreadsheet size={15} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Import from a sheet</h2>
          <p className="text-xs text-slate-500">Costs since April 2026, or offline (non-GST) fees. Excel or CSV. You see every row before anything is saved.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          What is in the file
          <select
            className="input h-9 w-56"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as "expense" | "income");
              setPreview(null);
            }}
          >
            <option value="expense">Costs</option>
            <option value="income">Offline fee income</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          File
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="input h-9 w-72 py-1"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <button type="button" className="btn-outline h-9 px-4 text-xs" disabled={!file || busy} onClick={() => send("preview")}>
          <Upload size={14} /> {busy && !preview ? "Reading..." : "Preview"}
        </button>
        <a className="btn-ghost h-9 px-3 text-xs" href={`/api/admin/accounts/export?template=${kind}`}>
          Download template
        </a>
      </div>

      {preview && (
        <div className="mt-3">
          <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 uppercase tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">Line</th>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5">{kind === "income" ? "Student" : "Details"}</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5">Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.line} className={row.status === "error" ? "bg-rose-50" : row.status === "duplicate" ? "bg-amber-50" : row.status === "settle" || row.status === "in_portal" ? "bg-sky-50" : ""}>
                    <td className="px-2 py-1 tabular-nums">{row.line}</td>
                    <td className="px-2 py-1 tabular-nums">{row.date ? (row.date.includes("T") ? istDay(row.date) : row.date) : "-"}</td>
                    <td className="px-2 py-1">{row.category}</td>
                    <td className="px-2 py-1">{kind === "income" ? row.studentMatched || row.student || "-" : row.description || row.counterparty || "-"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {rupees(row.amount)}
                      {row.tdsAmount ? <span className="text-slate-500"> (TDS {rupees(row.tdsAmount)})</span> : null}
                    </td>
                    <td className="px-2 py-1">
                      {row.status === "ok" ? row.message || "Ready" : row.message}
                      <span className="ml-1 text-slate-500">({row.account === "cash" ? "cash" : "bank"})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className="btn-primary h-9 px-4 text-xs" disabled={!ok || busy} onClick={() => send("commit")}>
              Import {ok} rows
            </button>
            <span className="text-xs text-slate-500">
              Blue rows are already billed in the portal: an open bill is marked paid, a paid one only adds the cash to the cash book. Red rows have an error and amber rows are already entered; both are skipped.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
