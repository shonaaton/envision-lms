"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { BranchHeader, api } from "./shared";

type Row = { id: string; label: string; type: string; occurredAt: string; actor: string; target: string };

const when = (value: string) =>
  new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function ActivityClient({ can }: { can: string[] }) {
  const [days, setDays] = useState(30);
  const [actor, setActor] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ staff: { id: string; name: string }[]; rows: Row[] } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setData(null);
    api<{ staff: { id: string; name: string }[]; rows: Row[] }>(`/api/bowbazar/activity?days=${days}&actor=${actor}&q=${encodeURIComponent(search)}`)
      .then(setData)
      .catch((error) => toast.error(error.message));
  }, [days, actor, search]);

  return (
    <div className="space-y-4">
      <BranchHeader title="Activity tracker" subtitle="Everything done at the Bowbazar centre and to its accounts: registers, payments, admissions, changes." can={can} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input h-10 !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search what happened" />
        </div>
        <select className="input h-10 w-auto" value={actor} onChange={(event) => setActor(event.target.value)}>
          <option value="">Everyone</option>
          {(data?.staff || []).map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
        <select className="input h-10 w-auto" value={days} onChange={(event) => setDays(Number(event.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>
      <section className="overflow-x-auto rounded-lg border border-brand/10 bg-white shadow-sm">
        {!data ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
        ) : !data.rows.length ? (
          <div className="p-8 text-center text-sm text-slate-500">Nothing in this period.</div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">What happened</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{when(row.occurredAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-semibold text-slate-800">{row.actor}</td>
                  <td className="px-4 py-2 text-slate-700">
                    {row.label}
                    {row.target && !row.label.includes(row.target) && <span className="text-xs text-slate-400"> · {row.target}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
