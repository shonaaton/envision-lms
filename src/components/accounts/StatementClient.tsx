"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, CheckCheck, RotateCcw, Trash2, Upload } from "lucide-react";

import { acceptAllAction, classifyAction, deleteRuleAction, deleteStatementAction } from "@/app/(dashboard)/admin/accounts/actions";
import { rupees } from "@/components/accounts/format";
import { PAYROLL_CATEGORIES, type AccountCategory } from "@/lib/accounts/categories";
import type { BankRow } from "@/lib/accounts/statementData";

function previousMonthOf(month: string) {
  const [year, m] = month.split("-").map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

function istDay(iso: string) {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function StatementUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("action", "statement");
      body.set("accountLabel", accountLabel);
      const response = await fetch("/api/admin/accounts/upload", { method: "POST", body });
      const result = await response.json().catch(() => ({ ok: false, error: "Upload failed." }));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.newRows} new rows${result.duplicateRows ? `, ${result.duplicateRows} already uploaded before` : ""}`);
      router.push(`/admin/accounts/statements/${result.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs font-semibold text-slate-700">
        Statement file (.xlsx, .csv, or the bank&apos;s .xls)
        <input type="file" accept=".csv,.xlsx,.xls,.txt" className="input h-9 w-80 py-1" onChange={(event) => setFile(event.target.files?.[0] || null)} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-700">
        Account
        <input className="input h-9 w-48" value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} placeholder="e.g. HDFC current" />
      </label>
      <button type="button" className="btn-primary h-9 px-4 text-xs" disabled={!file || busy} onClick={upload}>
        <Upload size={14} /> {busy ? "Reading..." : "Upload"}
      </button>
    </div>
  );
}

export function DeleteStatementButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost h-8 px-2 text-rose-700"
      disabled={pending}
      aria-label="Remove upload"
      onClick={() => {
        if (!window.confirm(`Remove ${label} and everything booked from its rows?`)) return;
        startTransition(async () => {
          const result = await deleteStatementAction(id);
          if (!result.ok) toast.error(result.error);
          else {
            toast.success("Statement removed");
            router.refresh();
          }
        });
      }}
    >
      <Trash2 size={13} />
    </button>
  );
}

export function DeleteRuleButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost h-7 px-2 text-rose-700"
      disabled={pending}
      aria-label="Delete rule"
      onClick={() =>
        startTransition(async () => {
          const result = await deleteRuleAction(id);
          if (!result.ok) toast.error(result.error);
          else router.refresh();
        })
      }
    >
      <Trash2 size={12} />
    </button>
  );
}

export function AcceptAllButton({ importId, count }: { importId: string; count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!count) return null;
  return (
    <button
      type="button"
      className="btn-primary h-9 px-4 text-xs"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await acceptAllAction(importId);
          if (!result.ok) toast.error(result.error);
          else {
            toast.success(`Booked ${result.done} rows`);
            router.refresh();
          }
        })
      }
    >
      <CheckCheck size={14} /> {pending ? "Booking..." : `Accept ${count} suggestions`}
    </button>
  );
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  unclassified: { label: "To do", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  matched_portal: { label: "In portal", tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  classified: { label: "Booked", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  ignored: { label: "Ignored", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

const SURE = new Set(["portal", "razorpay", "fee_receipt", "staff_invoice", "ledger", "category"]);

function RowEditor({ row, categories, onDone }: { row: BankRow; categories: AccountCategory[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isCredit = row.credit > 0;
  // Money in is usually income and money out a cost; the other way round is a refund, listed after.
  const usual = categories.filter((category) => (isCredit ? category.kind !== "expense" : category.kind !== "income"));
  const refunds = categories.filter((category) => (isCredit ? category.kind === "expense" : category.kind === "income"));
  const [category, setCategory] = useState(row.suggestion?.category && categories.some((item) => item.key === row.suggestion?.category) ? row.suggestion.category : "");
  const [previousMonth, setPreviousMonth] = useState(Boolean(row.suggestion?.month && row.suggestion.month !== row.month));
  const isRefund = refunds.some((item) => item.key === category);
  const isPayroll = PAYROLL_CATEGORIES.includes(category) && !isRefund;
  const [student, setStudent] = useState("");
  const [basis, setBasis] = useState<"net_paid" | "gross">("net_paid");
  const [tds, setTds] = useState(true);
  const [rule, setRule] = useState("");

  function run(decision: Parameters<typeof classifyAction>[1]) {
    startTransition(async () => {
      const result = await classifyAction(row.id, decision);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-2 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[11px] font-semibold text-slate-700">
          Book as
          <select className="input h-8 w-56 text-xs" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Pick a category</option>
            <optgroup label={isCredit ? "Money in" : "Money out"}>
              {usual.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={isCredit ? "Refund of a cost" : "Paid back"}>
              {refunds.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label} (refund)
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {(category === "offline_fees" || category === "student_refunds") && (
          <label className="grid gap-1 text-[11px] font-semibold text-slate-700">
            Student (optional)
            <input className="input h-8 w-48 text-xs" value={student} onChange={(event) => setStudent(event.target.value)} placeholder="Username, phone or name" />
          </label>
        )}
        {isPayroll && (
          <>
            <label className="grid gap-1 text-[11px] font-semibold text-slate-700">
              Bank amount is
              <select className="input h-8 w-52 text-xs" value={basis} onChange={(event) => setBasis(event.target.value as "net_paid" | "gross")}>
                <option value="net_paid">After 10% TDS (book gross)</option>
                <option value="gross">The full invoice</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-[11px] font-semibold text-slate-700">
              <input type="checkbox" checked={tds} onChange={(event) => setTds(event.target.checked)} /> TDS deducted
            </label>
          </>
        )}
        <label className="flex items-center gap-1.5 pb-2 text-[11px] font-semibold text-slate-700">
          <input type="checkbox" checked={previousMonth} onChange={(event) => setPreviousMonth(event.target.checked)} /> For the previous month
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-slate-700">
          Remember: narration contains
          <input className="input h-8 w-44 text-xs" value={rule} onChange={(event) => setRule(event.target.value)} placeholder="optional, e.g. cesc" />
        </label>
        <button
          type="button"
          className="btn-primary h-8 px-3 text-xs"
          disabled={!category || pending}
          onClick={() =>
            run({
              kind: "category",
              category,
              student: student || undefined,
              basis,
              tdsDeducted: tds,
              month: previousMonth ? previousMonthOf(row.month) : undefined,
              rulePattern: rule || undefined,
            })
          }
        >
          <Check size={13} /> Book
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {isCredit && (
          <button type="button" className="btn-outline h-8 px-3 text-xs" disabled={pending} onClick={() => run({ kind: "portal" })}>
            Student fee
          </button>
        )}
        <button type="button" className="btn-ghost h-8 px-3 text-xs" disabled={pending} onClick={() => run({ kind: "ignore" })}>
          Ignore (not income or cost)
        </button>
      </div>
    </div>
  );
}

export function StatementRows({ rows, categories, categoryLabels }: { rows: BankRow[]; categories: AccountCategory[]; categoryLabels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function quick(id: string, decision: Parameters<typeof classifyAction>[1]) {
    startTransition(async () => {
      const result = await classifyAction(id, decision);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  if (!rows.length) return <p className="p-6 text-center text-sm text-slate-500">No rows for this filter.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
          <tr>
            <th className="border-b border-slate-200 px-3 py-2 font-bold">Date</th>
            <th className="border-b border-slate-200 px-3 py-2 font-bold">Narration</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Out</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">In</th>
            <th className="border-b border-slate-200 px-3 py-2 font-bold">What it is</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = STATUS_LABEL[row.status] || STATUS_LABEL.unclassified;
            const sure = row.suggestion && SURE.has(row.suggestion.type);
            return (
              <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{istDay(row.date)}</td>
                <td className="max-w-md px-3 py-2">
                  <div className="break-words text-slate-800">{row.narration || "-"}</div>
                  {row.label && <div className="mt-0.5 inline-block rounded bg-accent-100 px-1.5 text-xs font-semibold text-slate-800">{row.label}</div>}
                  {row.reference && <div className="text-xs text-slate-500">Ref {row.reference}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-rose-700">{row.debit ? rupees(row.debit) : ""}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-700">{row.credit ? rupees(row.credit) : ""}</td>
                <td className="min-w-[320px] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${status.tone}`}>{status.label}</span>
                    {row.status === "classified" && row.entry && (
                      <span className="text-xs text-slate-700">
                        {categoryLabels[row.entry.category] || row.entry.category} {rupees(row.entry.amount)}
                        {row.entry.month !== row.month ? ` for ${row.entry.month}` : ""}
                        {row.entry.tdsAmount ? ` (incl. TDS ${rupees(row.entry.tdsAmount)})` : ""}
                        {row.entry.studentName ? ` - ${row.entry.studentName}` : ""}
                      </span>
                    )}
                    {row.status !== "unclassified" && row.suggestion && row.status !== "classified" && <span className="text-xs text-slate-500">{row.suggestion.label}</span>}
                    {row.status === "unclassified" && row.suggestion && (
                      <span className={`text-xs ${sure ? "text-slate-800" : "text-slate-500"}`}>Suggested: {row.suggestion.label}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.status === "unclassified" && sure && (
                      <button type="button" className="btn-primary h-7 px-2 text-xs" disabled={pending} onClick={() => quick(row.id, { kind: "accept" })}>
                        <Check size={12} /> Accept
                      </button>
                    )}
                    {row.status === "unclassified" ? (
                      <button type="button" className="btn-outline h-7 px-2 text-xs" onClick={() => setOpen(open === row.id ? null : row.id)}>
                        {open === row.id ? "Close" : "Choose"}
                      </button>
                    ) : (
                      <button type="button" className="btn-ghost h-7 px-2 text-xs" disabled={pending} onClick={() => quick(row.id, { kind: "reset" })}>
                        <RotateCcw size={12} /> Undo
                      </button>
                    )}
                  </div>
                  {open === row.id && <RowEditor row={row} categories={categories} onDone={() => setOpen(null)} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StatementFilter({ importId, status, counts }: { importId: string; status: string; counts: Record<string, number> }) {
  const tabs = [
    { key: "unclassified", label: "To do" },
    { key: "", label: "All" },
    { key: "classified", label: "Booked" },
    { key: "matched_portal", label: "In portal" },
    { key: "ignored", label: "Ignored" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key || "all"}
          href={`/admin/accounts/statements/${importId}${tab.key ? `?status=${tab.key}` : "?status=all"}`}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${status === tab.key ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-brand"}`}
        >
          {tab.label} {tab.key ? `(${counts[tab.key] || 0})` : `(${Object.values(counts).reduce((sum, value) => sum + value, 0)})`}
        </Link>
      ))}
    </div>
  );
}
