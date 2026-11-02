"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { CallCard, Empty, type CallRow } from "@/components/admin/retention/shared";

const OUTCOMES = [
  { key: "", label: "Every outcome" },
  { key: "connected", label: "Spoke to the family" },
  { key: "missed", label: "Missed" },
  { key: "callback_requested", label: "Callback asked" },
  { key: "wrong_number", label: "Wrong number" },
];

/** Every call, searchable: what each family said, readable by the whole team. */
export default function CallHistory({ studentId, onClearStudent }: { studentId?: string; onClearStudent?: () => void }) {
  const [rows, setRows] = useState<CallRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [outcome, setOutcome] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (studentId) params.set("student", studentId);
    if (search) params.set("q", search);
    if (month) params.set("month", month);
    if (outcome) params.set("outcome", outcome);
    const response = await fetch(`/api/admin/retention/calls?${params}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(body.error || "Could not load the calls.");
    setRows(body.rows);
    setTotal(body.total);
  }, [page, studentId, search, month, outcome]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        {studentId ? (
          <button type="button" onClick={onClearStudent} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand">
            One family only <X size={13} />
          </button>
        ) : (
          <label className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-9" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search student, parent or phone, then press Enter" />
          </label>
        )}
        <input type="month" className="input w-auto" value={month} onChange={(event) => { setPage(1); setMonth(event.target.value); }} />
        <select className="input w-auto" value={outcome} onChange={(event) => { setPage(1); setOutcome(event.target.value); }}>
          {OUTCOMES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </form>

      {!rows && <Empty title="Loading…" />}
      {rows && !rows.length && <Empty title="No calls found" hint="Calls appear here as soon as they are logged on a family's call screen." />}
      {rows?.map((call) => <CallCard key={call._id} call={call} showFamily />)}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button type="button" className="btn btn-outline !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-slate-600">Page {page} of {pages} · {total} calls</span>
          <button type="button" className="btn btn-outline !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
