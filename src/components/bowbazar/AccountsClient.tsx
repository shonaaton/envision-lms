"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { monthLabel, todayKey } from "@/lib/branch/rules";
import { CASH_CATEGORIES } from "@/lib/branch/statementParse";
import { cn } from "@/lib/utils";
import { BranchHeader, Drawer, Field, Stat, api, rupees } from "./shared";

type Line = {
  id: string;
  date: string;
  kind: "income" | "expense";
  amount: number;
  description: string;
  category: string;
  regNo: string;
  month: string;
  note: string;
  source: "import" | "manual" | "portal";
  receiptNo: string;
  byName: string;
};
type Book = { lines: Line[]; names: Record<string, string>; importedRows: number };

const categoryLabel = (key: string) => CASH_CATEGORIES.find((entry) => entry.key === key)?.label || key;
const dayText = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const SOURCE: Record<Line["source"], { label: string; style: string }> = {
  import: { label: "Statement", style: "bg-slate-100 text-slate-600" },
  manual: { label: "Added", style: "bg-sky-100 text-sky-800" },
  portal: { label: "Portal fee", style: "bg-emerald-100 text-emerald-800" },
};
const PAGE = 200;

export default function AccountsClient({ can }: { can: string[] }) {
  const [book, setBook] = useState<Book | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<"" | "income" | "expense">("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [view, setView] = useState<"lines" | "months">("lines");
  const [editing, setEditing] = useState<Partial<Line> | null>(null);

  const load = useCallback(() => {
    api<Book>("/api/bowbazar/accounts").then(setBook).catch((error) => toast.error(error.message));
  }, []);
  useEffect(load, [load]);

  const months = useMemo(() => [...new Set((book?.lines || []).map((line) => line.date.slice(0, 7)))].sort().reverse(), [book]);
  const who = useCallback((line: Line) => (line.regNo && book?.names[line.regNo]) || "", [book]);

  // Period and search first; the kind and category pickers then narrow the list.
  const inPeriod = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (book?.lines || []).filter((line) => {
      const month = line.date.slice(0, 7);
      if (from && month < from) return false;
      if (to && month > to) return false;
      if (text && !`${line.description} ${line.regNo} ${who(line)} ${line.note} ${line.receiptNo}`.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [book, from, to, query, who]);
  const visible = useMemo(() => inPeriod.filter((line) => (!kind || line.kind === kind) && (!category || line.category === category)), [inPeriod, kind, category]);
  useEffect(() => setShown(PAGE), [from, to, kind, category, query]);

  const sum = (lines: Line[], side: Line["kind"]) => lines.filter((line) => line.kind === side).reduce((total, line) => total + line.amount, 0);
  const income = sum(visible, "income");
  const expense = sum(visible, "expense");
  const balance = book ? sum(book.lines, "income") - sum(book.lines, "expense") : 0;

  const byMonth = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const line of visible) {
      const month = line.date.slice(0, 7);
      const entry = map.get(month) || { income: 0, expense: 0 };
      entry[line.kind] += line.amount;
      map.set(month, entry);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of inPeriod.filter((line) => line.kind === "expense")) map.set(line.category, (map.get(line.category) || 0) + line.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [inPeriod]);

  function downloadCsv() {
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const header = ["Date", "Description", "Student", "Reg #", "Fee month", "Category", "Income", "Expense", "Note", "Receipt", "Source", "By"];
    const rows = [...visible].reverse().map((line) => [
      line.date,
      line.description,
      who(line),
      line.regNo,
      line.month,
      categoryLabel(line.category),
      line.kind === "income" ? line.amount / 100 : "",
      line.kind === "expense" ? line.amount / 100 : "",
      line.note,
      line.receiptNo,
      SOURCE[line.source].label,
      line.byName,
    ]);
    const blob = new Blob(["﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bowbazar-accounts${from || to ? `-${from || "start"}-to-${to || "now"}` : ""}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function remove(line: Line) {
    if (!window.confirm(`Delete "${line.description}" (${rupees(line.amount)}) from ${dayText(line.date)}?`)) return;
    try {
      await api(`/api/bowbazar/accounts/${line.id}`, { method: "DELETE" });
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Accounts"
        subtitle="Every rupee in and out of the centre: the old account statement, expenses you add, and fees collected in the portal."
        can={can}
        actions={
          <>
            <button type="button" className="btn-outline h-10" onClick={downloadCsv} disabled={!visible.length}>
              <Download size={16} /> Download
            </button>
            <button type="button" className="btn-primary h-10" onClick={() => setEditing({ kind: "expense", category: "other", date: todayKey() })}>
              <Plus size={16} /> Add expense or income
            </button>
          </>
        }
      />

      {!book ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Income" value={rupees(income)} tone="good" hint={`${visible.filter((line) => line.kind === "income").length} lines in this view`} />
            <Stat label="Expenses" value={rupees(expense)} tone="bad" hint={`${visible.filter((line) => line.kind === "expense").length} lines in this view`} />
            <Stat label="Net" value={`${income - expense < 0 ? "−" : ""}${rupees(Math.abs(income - expense))}`} tone={income - expense < 0 ? "bad" : "default"} hint="Income less expenses, this view" />
            <Stat label="Balance, all time" value={`${balance < 0 ? "−" : ""}${rupees(Math.abs(balance))}`} hint={book.importedRows ? `${book.importedRows} statement rows included` : "No statement imported yet"} />
          </div>

          <section className="grid gap-2 rounded-lg border border-brand/10 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_2fr]">
            <Field label="From">
              <select className="input h-9 text-sm" value={from} onChange={(event) => setFrom(event.target.value)}>
                <option value="">The start</option>
                {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
            </Field>
            <Field label="To">
              <select className="input h-9 text-sm" value={to} onChange={(event) => setTo(event.target.value)}>
                <option value="">Now</option>
                {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select className="input h-9 text-sm" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="">Income and expenses</option>
                <option value="income">Income only</option>
                <option value="expense">Expenses only</option>
              </select>
            </Field>
            <Field label="Category">
              <select className="input h-9 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {CASH_CATEGORIES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
              </select>
            </Field>
            <Field label="Search">
              <input className="input h-9 text-sm" placeholder="Student, reg #, description, note" value={query} onChange={(event) => setQuery(event.target.value)} />
            </Field>
          </section>

          {byCategory.length > 0 && !kind && !category && (
            <section className="rounded-lg border border-brand/10 bg-white p-3 shadow-sm">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Where the money went</div>
              <div className="flex flex-wrap gap-2">
                {byCategory.map(([key, amount]) => (
                  <button key={key} type="button" onClick={() => { setKind("expense"); setCategory(key); }} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:border-brand/40">
                    {categoryLabel(key)} <span className="text-red-700">{rupees(amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="flex gap-1 rounded-lg border border-brand/10 bg-white p-1 text-sm font-bold sm:w-fit">
            {(["lines", "months"] as const).map((key) => (
              <button key={key} type="button" onClick={() => setView(key)} className={cn("rounded-md px-3 py-1.5", view === key ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-50")}>
                {key === "lines" ? "Every line" : "By month"}
              </button>
            ))}
          </div>

          {view === "months" ? (
            <section className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2">Month</th><th className="px-4 py-2 text-right">Income</th><th className="px-4 py-2 text-right">Expenses</th><th className="px-4 py-2 text-right">Net</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byMonth.map(([month, entry]) => (
                    <tr key={month}>
                      <td className="px-4 py-2 font-bold text-slate-900">{monthLabel(month)}</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{rupees(entry.income)}</td>
                      <td className="px-4 py-2 text-right text-red-700">{rupees(entry.expense)}</td>
                      <td className={cn("px-4 py-2 text-right font-bold", entry.income - entry.expense < 0 ? "text-red-700" : "text-slate-900")}>
                        {entry.income - entry.expense < 0 ? "−" : ""}{rupees(Math.abs(entry.income - entry.expense))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : !visible.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              {book.lines.length ? "Nothing matches these filters." : "No lines yet. Import the account statement from Import from Excel, or add an expense."}
            </div>
          ) : (
            <section className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2 text-right">Income</th>
                    <th className="px-4 py-2 text-right">Expense</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.slice(0, shown).map((line) => (
                    <tr key={line.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">{dayText(line.date)}</td>
                      <td className="px-4 py-2">
                        <div className="text-slate-900">{line.description}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className={cn("rounded-full px-2 py-0.5 font-bold", SOURCE[line.source].style)}>{SOURCE[line.source].label}</span>
                          {who(line) && <span className="font-bold text-slate-700">{who(line)}</span>}
                          {line.receiptNo && <span>{line.receiptNo}</span>}
                          {line.source !== "import" && line.byName && <span>by {line.byName}</span>}
                          {line.note && <span className="italic">{line.note}</span>}
                          {!line.amount && <span className="font-bold text-amber-700">No amount in the statement</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">{categoryLabel(line.category)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-emerald-700">{line.kind === "income" ? rupees(line.amount) : ""}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-red-700">{line.kind === "expense" ? rupees(line.amount) : ""}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {line.source !== "portal" && (
                          <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setEditing(line)} aria-label="Edit"><Pencil size={14} /></button>
                        )}
                        {line.source === "manual" && (
                          <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={() => void remove(line)} aria-label="Delete"><Trash2 size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length > shown && (
                <div className="border-t border-slate-100 p-3 text-center">
                  <button type="button" className="btn-outline h-9" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown}</button>
                </div>
              )}
            </section>
          )}
          <p className="text-xs text-slate-500">
            Fees collected on the Fees page show here by themselves as &quot;Portal fee&quot;. Lines from the account statement keep their original wording and amount; you can change their category or add a note.
          </p>
        </>
      )}

      {editing && <LineDrawer line={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function LineDrawer({ line, onClose, onSaved }: { line: Partial<Line>; onClose: () => void; onSaved: () => void }) {
  const locked = line.source === "import";
  const [form, setForm] = useState({
    date: line.date || "",
    kind: line.kind || "expense",
    amount: line.amount ? String(line.amount / 100) : "",
    category: line.category || "other",
    description: line.description || "",
    note: line.note || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    setSaving(true);
    try {
      const body = locked ? { category: form.category, note: form.note } : form;
      if (line.id) await api(`/api/bowbazar/accounts/${line.id}`, { method: "PATCH", json: body });
      else await api("/api/bowbazar/accounts", { method: "POST", json: body });
      toast.success("Saved.");
      onSaved();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={line.id ? (locked ? "Statement line" : "Edit line") : "Add expense or income"}
      onClose={onClose}
      footer={
        <button type="button" className="btn-primary h-10 w-full" disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 size={16} className="animate-spin" />} Save
        </button>
      }
    >
      <div className="space-y-3">
        {locked && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            This line came from the account statement ({rupees(line.amount || 0)} {line.kind} on {line.date ? dayText(line.date) : ""}). Its date, amount and wording stay as they were.
          </p>
        )}
        {!locked && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((key) => (
                <button key={key} type="button" onClick={() => set({ kind: key, category: key === "income" && form.category === "other" ? "other_income" : form.category })} className={cn("rounded-lg border px-3 py-2 text-sm font-bold", form.kind === key ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600")}>
                  {key === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className="input" value={form.date} max={todayKey()} onChange={(event) => set({ date: event.target.value })} /></Field>
              <Field label="Amount (₹)"><input className="input" inputMode="decimal" value={form.amount} onChange={(event) => set({ amount: event.target.value })} /></Field>
            </div>
            <Field label="What it was for"><input className="input" value={form.description} placeholder="Teacher cost Sayan Bose, chess sets, rent" onChange={(event) => set({ description: event.target.value })} /></Field>
          </>
        )}
        <Field label="Category">
          <select className="input" value={form.category} onChange={(event) => set({ category: event.target.value })}>
            {CASH_CATEGORIES.filter((entry) => entry.key !== "fee" || form.category === "fee").map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)"><textarea className="input min-h-20" value={form.note} onChange={(event) => set({ note: event.target.value })} /></Field>
      </div>
    </Drawer>
  );
}
