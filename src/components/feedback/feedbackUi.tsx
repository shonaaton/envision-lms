"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Mail, PencilLine, RotateCcw, Send, SkipForward, Sparkles, Target } from "lucide-react";

import { monthLabel } from "@/lib/feedback/feedbackCycleDates";
import { EFFORT_SKILL, RATING_SCALE, questionSetFor, ratingLabel } from "@/lib/feedback/feedbackQuestions";
import type { SerializedFeedback } from "@/lib/feedback/feedbackRules";

export type FeedbackItem = SerializedFeedback;
export type CoachProgress = { id: string; name: string; total: number; done: number; waiting: number; overdue: number };
export type FeedbackListResponse = {
  month: string;
  monthLabel: string;
  dueAt: string | null;
  months: string[];
  counts: Record<string, number>;
  items: FeedbackItem[];
  previous: Record<string, Record<string, number>>;
  coaches: CoachProgress[];
};

export function useFeedbackList(params: Record<string, string>) {
  const [data, setData] = useState<FeedbackListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const search = new URLSearchParams(Object.entries(JSON.parse(key)).filter(([, value]) => value) as [string, string][]);
      const response = await fetch(`/api/feedback?${search.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load feedback.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load feedback.");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export async function patchFeedback(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong.");
  return payload.feedback as FeedbackItem;
}

/** ‹ September 2026 › - steps only through months that have reports. */
export function MonthSwitcher({ month, months, onChange }: { month: string; months: string[]; onChange: (month: string) => void }) {
  const sorted = Array.from(new Set(months.concat(month ? [month] : []))).sort();
  const index = sorted.indexOf(month);
  const older = index > 0 ? sorted[index - 1] : "";
  const newer = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : "";
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
      <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-brand-50 disabled:opacity-30" disabled={!older} onClick={() => onChange(older)} aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <label className="relative inline-flex items-center gap-1.5 px-1 text-sm font-black text-slate-900">
        <CalendarDays size={15} className="text-brand" />
        <select className="cursor-pointer appearance-none bg-transparent pr-1 font-black outline-none" value={month} onChange={(event) => onChange(event.target.value)} aria-label="Month">
          {!sorted.length && <option value="">No reports yet</option>}
          {sorted
            .slice()
            .reverse()
            .map((value) => (
              <option key={value} value={value}>
                {monthLabel(value)}
              </option>
            ))}
        </select>
      </label>
      <button type="button" className="rounded-lg p-1.5 text-slate-600 hover:bg-brand-50 disabled:opacity-30" disabled={!newer} onClick={() => onChange(newer)} aria-label="Next month">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  pending: { label: "To do", tone: "bg-amber-50 text-amber-700", icon: Clock3 },
  draft: { label: "Draft", tone: "bg-sky-50 text-sky-700", icon: PencilLine },
  submitted: { label: "Awaiting approval", tone: "bg-purple-50 text-purple-700", icon: Send },
  changes_requested: { label: "Changes requested", tone: "bg-rose-50 text-rose-700", icon: RotateCcw },
  approved: { label: "Approved", tone: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  sent: { label: "Sent to family", tone: "bg-emerald-50 text-emerald-700", icon: Mail },
  skipped: { label: "Skipped", tone: "bg-slate-100 text-slate-600", icon: SkipForward },
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
        <Clock3 size={12} />
        Overdue
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.tone}`}>
      <Icon size={12} />
      {meta.label}
    </span>
  );
}

export function isOverdue(item: Pick<FeedbackItem, "status" | "dueAt">) {
  return ["pending", "draft", "changes_requested"].includes(item.status) && Boolean(item.dueAt) && new Date(item.dueAt as string).getTime() < Date.now();
}

export function initials(name: string) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const palette = ["bg-purple-100 text-purple-800", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-indigo-100 text-indigo-800"];
  const hash = Array.from(name || "").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-black ${palette[hash % palette.length]}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function RatingBar({ value }: { value: number }) {
  return (
    <div className="flex gap-1" aria-label={ratingLabel(value)}>
      {RATING_SCALE.map((step) => (
        <span key={step.value} className={`h-2 flex-1 rounded-full ${step.value <= value ? "bg-brand" : "bg-brand/10"}`} />
      ))}
    </div>
  );
}

/**
 * The report as the family sees it - used for the student's timeline and the
 * admin's "parent preview". Takes only parent-visible fields, so the internal
 * note cannot appear here even by mistake.
 */
export function ParentReportCard({ item, compact }: { item: Pick<FeedbackItem, "month" | "tier" | "studentName" | "coachName" | "courseName" | "levelName" | "stats" | "ratings" | "highlights" | "focusAreas" | "parentNote">; compact?: boolean }) {
  const set = questionSetFor(item.tier);
  const rows = [...set.skills, EFFORT_SKILL].filter((skill) => item.ratings?.[skill.key]);
  return (
    <article className="overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-xl shadow-brand/5">
      <header className="relative bg-gradient-to-br from-brand to-[#3d0c4e] px-5 pb-5 pt-4 text-white">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">Monthly progress report</div>
        <div className="mt-1 text-xl font-black">{monthLabel(item.month)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{item.studentName}</span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-black text-[#3d0c4e]">{[item.courseName, item.levelName].filter(Boolean).join(" · ") || set.tierLabel}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-accent" />
      </header>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-brand/10 bg-brand-50/40 p-3 text-center">
            <div className="text-2xl font-black text-brand">
              {item.stats.classesAttended}
              <span className="text-sm font-bold text-slate-500"> / {item.stats.classesScheduled}</span>
            </div>
            <div className="text-[11px] font-semibold text-slate-500">Classes attended</div>
          </div>
          <div className="rounded-xl border border-brand/10 bg-brand-50/40 p-3 text-center">
            <div className="text-2xl font-black text-brand">{item.stats.topicsCovered.length}</div>
            <div className="text-[11px] font-semibold text-slate-500">Topics covered</div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Skills this month</h3>
          <ul className="space-y-2.5">
            {rows.map((skill) => (
              <li key={skill.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-800">{skill.label}</span>
                  <span className="text-xs font-bold text-brand">{ratingLabel(item.ratings[skill.key])}</span>
                </div>
                <RatingBar value={item.ratings[skill.key]} />
              </li>
            ))}
          </ul>
        </div>

        {!compact && item.stats.topicsCovered.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Topics covered</h3>
            <div className="flex flex-wrap gap-1.5">
              {item.stats.topicsCovered.map((topic) => (
                <span key={topic} className="rounded-full border border-brand/10 bg-brand-50/40 px-2.5 py-1 text-xs text-slate-700">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {(item.highlights.length > 0 || item.focusAreas.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {item.highlights.length > 0 && (
              <div className="rounded-xl bg-emerald-50/60 p-3">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
                  <Sparkles size={13} />
                  Highlights
                </h3>
                <ul className="space-y-1 text-sm text-slate-800">
                  {item.highlights.map((value) => (
                    <li key={value}>• {value}</li>
                  ))}
                </ul>
              </div>
            )}
            {item.focusAreas.length > 0 && (
              <div className="rounded-xl bg-amber-50/70 p-3">
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">
                  <Target size={13} />
                  Next month
                </h3>
                <ul className="space-y-1 text-sm text-slate-800">
                  {item.focusAreas.map((value) => (
                    <li key={value}>• {value}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {item.parentNote && (
          <blockquote className="rounded-r-xl border-l-4 border-accent bg-brand-50/40 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">A note from Coach {item.coachName.split(" ")[0]}</div>
            <p className="mt-1 text-sm italic leading-6 text-slate-800">“{item.parentNote}”</p>
          </blockquote>
        )}
      </div>
    </article>
  );
}

export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex max-w-full overflow-x-auto rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition ${value === tab.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {tab.label}
          {typeof tab.count === "number" && (
            <span className={`rounded-full px-1.5 text-[11px] ${value === tab.key ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function dueLabel(dueAt: string | null) {
  if (!dueAt) return "";
  const due = new Date(dueAt);
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(due);
  if (days < 0) return `Overdue since ${date}`;
  if (days === 0) return `Due today`;
  if (days === 1) return `Due tomorrow`;
  return `Due ${date} · ${days} days left`;
}
