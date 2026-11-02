"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, HeartHandshake, PhoneCall, RefreshCw, Target } from "lucide-react";
import { toast } from "sonner";
import RetentionClient from "@/components/admin/RetentionClient";
import CallerStats from "@/components/admin/retention/CallerStats";
import CallHistory from "@/components/admin/retention/CallHistory";
import FamilyQueue from "@/components/admin/retention/FamilyQueue";
import QuestionsManager from "@/components/admin/retention/QuestionsManager";
import { Stat, monthLabel, type Queue } from "@/components/admin/retention/shared";
import WinBackList from "@/components/admin/retention/WinBackList";

const TABS = [
  { key: "today", label: "Today" },
  { key: "monthly", label: "Monthly calls" },
  { key: "flags", label: "Risk flags" },
  { key: "renewals", label: "Renewals" },
  { key: "winback", label: "Win-back" },
  { key: "history", label: "Call history" },
  { key: "stats", label: "Stats" },
  { key: "questions", label: "Questions" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function RetentionCenterClient({ canManage, initialTab, initialFlagId, initialStudentId }: { canManage: boolean; initialTab: string; initialFlagId: string; initialStudentId: string }) {
  const [tab, setTab] = useState<Tab>(
    initialFlagId ? "flags" : initialStudentId ? "history" : TABS.some((item) => item.key === initialTab) ? (initialTab as Tab) : "today"
  );
  const [studentId, setStudentId] = useState(initialStudentId);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/retention/queue", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return toast.error(body.error || "Could not load this month's calls.");
    setQueue(body);
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  function choose(next: Tab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      url.searchParams.delete("flag");
      if (next !== "history") url.searchParams.delete("student");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // The tab still switches; only the shareable URL is skipped.
    }
  }

  const summary = queue?.summary;

  return (
    <div className="min-h-screen min-w-0 text-slate-950">
      <div className="mb-5 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <HeartHandshake size={14} />
            User Management
          </div>
          <h1 className="mt-3 text-3xl font-black text-brand">Retention Center</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Every family gets a call once a month: tell them what their child is and is not doing, ask the set questions, and log what they said
            so the whole team can see it. Families flagged at risk, renewals and callbacks come first.
            {queue ? ` ${monthLabel(queue.monthKey)}.` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Due today" value={summary?.dueToday ?? "-"} icon={<PhoneCall size={15} />} />
          <Stat label="Called this month" value={summary ? `${summary.done}/${summary.families}` : "-"} icon={<CalendarCheck size={15} />} />
          <Stat label="Daily target" value={summary?.dailyTarget ?? "-"} icon={<Target size={15} />} hint="connected calls" />
          <Stat label="Callbacks due" value={summary?.callbacksDue ?? "-"} icon={<CalendarClock size={15} />} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-full flex-wrap rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => choose(item.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${tab === item.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
              {item.key === "renewals" && summary ? ` (${summary.renewals})` : ""}
            </button>
          ))}
        </div>
        {(tab === "today" || tab === "monthly" || tab === "renewals") && (
          <button type="button" className="btn btn-outline ml-auto" onClick={loadQueue} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        )}
      </div>

      {(tab === "today" || tab === "monthly" || tab === "renewals") && <FamilyQueue queue={queue} mode={tab} canManage={canManage} />}
      {tab === "flags" && <RetentionClient canManage={canManage} initialFlagId={initialFlagId} />}
      {tab === "winback" && <WinBackList canManage={canManage} />}
      {tab === "history" && <CallHistory studentId={studentId || undefined} onClearStudent={() => setStudentId("")} />}
      {tab === "stats" && <CallerStats queue={queue} />}
      {tab === "questions" && <QuestionsManager canManage={canManage} />}
    </div>
  );
}
