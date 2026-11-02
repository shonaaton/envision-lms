"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Empty, Stat, monthLabel, type Queue } from "@/components/admin/retention/shared";

type Stats = {
  monthKey: string;
  callers: Array<{
    callerId: string;
    name: string;
    attempts: number;
    connected: number;
    missed: number;
    callbacks: number;
    connectRate: number;
    families: number;
    averageSatisfaction: number | null;
    followUps: number;
    saves: number;
    leftAfterCall: number;
  }>;
  totals: { attempts: number; connected: number; families: number; averageSatisfaction: number | null };
  satisfactionTrend: Array<{ monthKey: string; average: number | null; calls: number }>;
};

type Breakdown = { key: string; label: string; count: number };

/** How the calling is going: per caller for a month, coverage, satisfaction over time, and why families leave. */
export default function CallerStats({ queue }: { queue: Queue | null }) {
  const [month, setMonth] = useState(queue?.monthKey || "");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reasons, setReasons] = useState<{ exitReasons: Breakdown[]; pauseReasons: Breakdown[] }>({ exitReasons: [], pauseReasons: [] });

  useEffect(() => {
    fetch("/api/admin/retention", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => body && setReasons({ exitReasons: body.exitReasons || [], pauseReasons: body.pauseReasons || [] }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!month && queue?.monthKey) setMonth(queue.monthKey);
  }, [month, queue]);

  useEffect(() => {
    setStats(null);
    fetch(`/api/admin/retention/stats?month=${month}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load the stats.");
        setStats(body);
      })
      .catch((error) => toast.error(error.message));
  }, [month]);

  const isCurrent = queue && stats?.monthKey === queue.monthKey;
  const coverage = isCurrent && queue.summary.families ? Math.round((queue.summary.done / queue.summary.families) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" className="input w-auto" value={month} onChange={(event) => setMonth(event.target.value)} />
        {stats && <span className="text-sm font-bold text-slate-700">{monthLabel(stats.monthKey)}</span>}
      </div>

      {!stats && <Empty title="Loading…" />}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Calls made" value={stats.totals.attempts} />
            <Stat label="Connected" value={stats.totals.connected} hint={stats.totals.attempts ? `${Math.round((stats.totals.connected / stats.totals.attempts) * 100)}% connect rate` : undefined} />
            <Stat label="Families reached" value={stats.totals.families} hint={coverage !== null ? `${coverage}% of ${queue!.summary.families} this month` : undefined} />
            <Stat label="Avg satisfaction" value={stats.totals.averageSatisfaction ? `${stats.totals.averageSatisfaction}/5` : "-"} />
          </div>

          {isCurrent && (
            <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-black text-slate-950">Monthly coverage</span>
                <span className="font-bold tabular-nums text-brand">{queue.summary.done} / {queue.summary.families}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand" style={{ width: `${coverage || 0}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">About {queue.summary.dailyTarget} connected call{queue.summary.dailyTarget === 1 ? "" : "s"} a day finishes the month. {queue.summary.unreachable} {queue.summary.unreachable === 1 ? "family has" : "families have"} missed three calls.</p>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-brand/10 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Caller</th>
                  <th className="px-3 py-2 text-right">Calls</th>
                  <th className="px-3 py-2 text-right">Connected</th>
                  <th className="px-3 py-2 text-right">Missed</th>
                  <th className="px-3 py-2 text-right">Families</th>
                  <th className="px-3 py-2 text-right">Avg score</th>
                  <th className="px-3 py-2 text-right">Follow-ups</th>
                  <th className="px-3 py-2 text-right" title="Risk flags this caller settled as 'staying'">Saves</th>
                  <th className="px-3 py-2 text-right" title="Families who left within 30 days of a call">Left after call</th>
                </tr>
              </thead>
              <tbody>
                {!stats.callers.length && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No calls logged in this month.</td></tr>
                )}
                {stats.callers.map((row) => (
                  <tr key={row.callerId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-bold text-slate-900">{row.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.attempts}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.connected} <span className="text-xs text-slate-500">({row.connectRate}%)</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.missed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.families}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.averageSatisfaction ?? "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.followUps}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.saves}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.leftAfterCall}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-950">Parent satisfaction (6 months)</h2>
              <ul className="mt-3 space-y-2.5">
                {stats.satisfactionTrend.map((row) => (
                  <li key={row.monthKey}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-slate-700">{monthLabel(row.monthKey)}</span>
                      <span className="font-bold tabular-nums text-slate-950">{row.average ? `${row.average}/5` : "-"} <span className="text-xs font-normal text-slate-500">{row.calls ? `${row.calls} calls` : ""}</span></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${((row.average || 0) / 5) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <BreakdownCard title="Why families left (6 months)" rows={reasons.exitReasons} empty="No leavers with a reason yet. A reason is asked whenever a student is deactivated." />
            <BreakdownCard title="Why families paused (6 months)" rows={reasons.pauseReasons} empty="No pauses with a reason yet." />
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownCard({ title, rows, empty }: { title: string; rows: Breakdown[]; empty: string }) {
  const peak = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-black text-slate-950">{title}</h2>
      {rows.length ? (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`truncate ${row.key === "not_recorded" ? "italic text-slate-500" : "text-slate-700"}`}>{row.label}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-950">{row.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${row.key === "not_recorded" ? "bg-slate-300" : "bg-brand"}`} style={{ width: `${(row.count / peak) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">{empty}</p>
      )}
    </div>
  );
}
