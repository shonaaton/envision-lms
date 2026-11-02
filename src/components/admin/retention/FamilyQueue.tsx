"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Phone, Search } from "lucide-react";
import { Empty, LevelBadge, StateBadge, Stars, daysAgo, formatDate, formatDateTime, type Queue, type QueueRow } from "@/components/admin/retention/shared";

type Mode = "today" | "monthly" | "renewals";

/** The kind of call a row asks for, so the call screen opens with it chosen. */
function callKind(row: QueueRow) {
  if (row.why.includes("Callback due")) return "callback";
  if (row.why.includes("High risk") || row.why.includes("At risk")) return "risk";
  if (row.why.includes("Renewal soon")) return "renewal";
  return "monthly";
}

const STATE_FILTERS = [
  { key: "", label: "All" },
  { key: "not_called", label: "Not called" },
  { key: "missed", label: "Missed" },
  { key: "callback", label: "Callback" },
  { key: "unreachable", label: "Unreachable" },
  { key: "done", label: "Called" },
];

export default function FamilyQueue({ queue, mode, canManage }: { queue: Queue | null; mode: Mode; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [coach, setCoach] = useState("");

  const coaches = useMemo(() => Array.from(new Set((queue?.rows || []).flatMap((row) => row.coaches))).sort(), [queue]);

  const rows = useMemo(() => {
    if (!queue) return [];
    let list = queue.rows;
    if (mode === "today") list = list.filter((row) => row.dueToday);
    if (mode === "renewals") list = list.filter((row) => row.renewal).sort((a, b) => (a.renewal?.sortKey ?? 0) - (b.renewal?.sortKey ?? 0));
    if (state) list = list.filter((row) => row.state === state);
    if (coach) list = list.filter((row) => row.coaches.includes(coach));
    const term = search.trim().toLowerCase();
    if (term) list = list.filter((row) => [row.parentName, row.phone, ...row.students.map((student) => student.name)].join(" ").toLowerCase().includes(term));
    return list;
  }, [queue, mode, state, coach, search]);

  if (!queue) return <Empty title="Loading…" />;

  return (
    <div className="space-y-3">
      {mode === "today" && (
        <div className="rounded-2xl border border-brand/10 bg-brand/5 p-4 text-sm leading-6 text-slate-700">
          <span className="font-bold text-brand">{queue.summary.dueToday} {queue.summary.dueToday === 1 ? "family" : "families"} to call today.</span>{" "}
          To finish this month you need about <span className="font-bold">{queue.summary.dailyTarget}</span> connected call{queue.summary.dailyTarget === 1 ? "" : "s"} a day ({queue.summary.remaining} of {queue.summary.families} families left).
          Callbacks come first, then families at risk that nobody has spoken to in 15 days, then fee renewals, then whoever has waited longest.
          A family that did not pick up comes back tomorrow.
        </div>
      )}
      {mode === "renewals" && (
        <div className="rounded-2xl border border-brand/10 bg-brand/5 p-4 text-sm leading-6 text-slate-700">
          Families with credits nearly used up or a fee due in the next 14 days. A call before the bill keeps more families than a reminder after it.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, parent or phone" />
        </label>
        {mode === "monthly" && (
          <select className="input w-auto" value={state} onChange={(event) => setState(event.target.value)}>
            {STATE_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        )}
        <select className="input w-auto" value={coach} onChange={(event) => setCoach(event.target.value)}>
          <option value="">All coaches</option>
          {coaches.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {!rows.length && (
        <Empty
          title={mode === "today" ? "Nobody left to call today" : mode === "renewals" ? "No renewals in the next two weeks" : "No families match"}
          hint={mode === "today" ? "Missed families come back tomorrow. Check the Monthly calls tab for the rest of the month." : undefined}
        />
      )}

      {rows.map((row) => (
        <div key={row.familyKey} className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black text-slate-950">{row.students.map((student) => student.name).join(", ")}</span>
            <StateBadge row={row} />
            <LevelBadge level={row.flagLevel} />
            {row.students.some((student) => student.paused) && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">Paused</span>}
            <Stars value={row.lastSatisfaction} />
            <span className="ml-auto flex items-center gap-2">
              {row.phone && <span className="text-xs text-slate-500">{row.phone}</span>}
              {canManage && (
                <Link href={`/admin/retention/call/${row.primaryStudentId}?kind=${callKind(row)}`} className="btn btn-primary !px-3 !py-1.5 text-xs">
                  <Phone size={14} /> Call
                </Link>
              )}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.why.map((reason) => (
              <span key={reason} className={`rounded-lg px-2 py-1 text-xs font-semibold ${reason === "High risk" ? "bg-rose-50 text-rose-800" : reason === "Callback due" ? "bg-brand/10 text-brand" : "bg-slate-50 text-slate-700"}`}>{reason}</span>
            ))}
            {row.renewal && <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${row.renewal.within7 ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700"}`}>{row.renewal.label}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {row.parentName && <span>Parent: {row.parentName}</span>}
            {row.coaches.length > 0 && <span>Coach: {row.coaches.join(", ")}</span>}
            <span>{row.lastConnectedAt ? `Last spoke ${formatDate(row.lastConnectedAt)} (${daysAgo(row.lastConnectedAt)}d ago)` : "Never spoken to"}</span>
            {row.lastAttemptAt && row.state !== "done" && <span>Last tried {formatDateTime(row.lastAttemptAt)}</span>}
            {row.pendingCallbackAt && (
              <span className="inline-flex items-center gap-1 font-semibold text-brand"><CalendarClock size={12} /> Call back {formatDateTime(row.pendingCallbackAt)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
