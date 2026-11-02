"use client";

import { MessageCircle, PhoneCall, PhoneMissed, Star } from "lucide-react";

export type RiskLevel = "none" | "watch" | "at_risk" | "high";

export type QueueRow = {
  familyKey: string;
  primaryStudentId: string;
  students: Array<{ _id: string; name: string; paused: boolean }>;
  parentName: string;
  phone: string;
  coaches: string[];
  flagLevel: RiskLevel;
  renewal: { label: string; dueAt: string | null; within7: boolean; sortKey: number } | null;
  lastConnectedAt: string | null;
  lastSatisfaction: number | null;
  pendingCallbackAt: string | null;
  state: "done" | "callback" | "missed" | "unreachable" | "not_called";
  missedThisMonth: number;
  lastAttemptAt: string | null;
  dueToday: boolean;
  priority: number;
  why: string[];
};

export type Queue = {
  monthKey: string;
  summary: { families: number; done: number; remaining: number; dueToday: number; dailyTarget: number; callbacksDue: number; unreachable: number; renewals: number };
  rows: QueueRow[];
};

export type CallRow = {
  _id: string;
  at: string;
  monthKey: string;
  familyKey: string;
  kind: string;
  kindLabel: string;
  outcome: string;
  outcomeLabel: string;
  byName: string;
  durationMinutes: number | null;
  satisfaction: number | null;
  leavingIntent: "no" | "maybe" | "yes" | null;
  students: Array<{ _id: string; name: string }>;
  primaryStudentId: string;
  answers: Array<{ question: string; answer: string; studentName: string }>;
  extraQuestions: Array<{ question: string; answer: string }>;
  notes: string;
  parentSummary: string;
  coachNote: string;
  talkingPoints: Array<{ label: string; discussed: boolean; studentName: string }>;
  actionItems: Array<{ type: string; label: string; note: string }>;
  callbackAt: string | null;
  message: { kind: "summary" | "missed"; whatsapp: string; email: string; error: string } | null;
};

export function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function daysAgo(value?: string | Date | null) {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

const LEVEL_STYLE: Record<Exclude<RiskLevel, "none">, { label: string; className: string }> = {
  high: { label: "High risk", className: "bg-rose-100 text-rose-800" },
  at_risk: { label: "At risk", className: "bg-amber-100 text-amber-800" },
  watch: { label: "Watch", className: "bg-slate-100 text-slate-700" },
};

export function LevelBadge({ level }: { level: RiskLevel }) {
  if (level === "none") return null;
  const style = LEVEL_STYLE[level];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style.className}`}>{style.label}</span>;
}

const STATE_STYLE: Record<QueueRow["state"], { label: string; className: string }> = {
  done: { label: "Called", className: "bg-emerald-100 text-emerald-800" },
  callback: { label: "Callback", className: "bg-brand/10 text-brand" },
  missed: { label: "Missed", className: "bg-amber-100 text-amber-800" },
  unreachable: { label: "Unreachable", className: "bg-rose-100 text-rose-800" },
  not_called: { label: "Not called", className: "bg-slate-100 text-slate-700" },
};

export function StateBadge({ row }: { row: Pick<QueueRow, "state" | "missedThisMonth"> }) {
  const style = STATE_STYLE[row.state];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style.className}`}>
      {style.label}
      {(row.state === "missed" || row.state === "unreachable") && row.missedThisMonth > 0 ? ` ×${row.missedThisMonth}` : ""}
    </span>
  );
}

export function Stars({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${value <= 2 ? "text-rose-700" : value >= 4 ? "text-emerald-700" : "text-amber-700"}`} title={`Satisfaction ${value}/5`}>
      <Star size={12} className="fill-current" />
      {value}/5
    </span>
  );
}

export function Stat({ label, value, icon, hint }: { label: string; value: number | string; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-brand/10 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
        {icon && <span className="text-brand">{icon}</span>}
        {label}
      </div>
      <div className="mt-1 text-xl font-black tabular-nums text-brand">{value}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-brand/10 bg-white p-10 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const MESSAGE_LABEL: Record<string, string> = {
  sent: "sent",
  skipped: "not sent",
  failed: "failed",
  template_pending: "waiting for Meta approval",
};

/** One past call, as everyone on the team sees it. */
export function CallCard({ call, showFamily = false }: { call: CallRow; showFamily?: boolean }) {
  const connected = call.outcome === "connected";
  return (
    <div className="rounded-2xl border border-brand/10 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {connected ? <PhoneCall size={15} className="text-emerald-600" /> : <PhoneMissed size={15} className="text-amber-600" />}
        <span className="font-bold text-slate-900">{call.outcomeLabel}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{call.kindLabel}</span>
        <Stars value={call.satisfaction} />
        {call.leavingIntent && call.leavingIntent !== "no" && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">{call.leavingIntent === "yes" ? "Plans to stop" : "Thinking of stopping"}</span>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {formatDateTime(call.at)}
          {call.byName ? ` · ${call.byName}` : ""}
          {call.durationMinutes ? ` · ${call.durationMinutes} min` : ""}
        </span>
      </div>
      {showFamily && (
        <p className="mt-1 text-xs font-semibold text-brand">
          <a href={`/admin/retention/call/${call.primaryStudentId}`} className="hover:underline">{call.students.map((student) => student.name).join(", ")}</a>
        </p>
      )}
      {call.notes && <p className="mt-2 whitespace-pre-line leading-6 text-slate-800">{call.notes}</p>}
      {(call.answers.length > 0 || call.extraQuestions.length > 0) && (
        <dl className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3">
          {[
            ...call.answers.map((row) => ({ question: `${row.question}${row.studentName ? ` (${row.studentName.split(/\s+/)[0]})` : ""}`, answer: row.answer })),
            ...call.extraQuestions,
          ].map((row, index) => (
            <div key={index}>
              <dt className="text-xs font-semibold text-slate-500">{row.question}</dt>
              <dd className="text-slate-800">{row.answer || "-"}</dd>
            </div>
          ))}
        </dl>
      )}
      {call.talkingPoints.some((point) => point.discussed) && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-semibold">Discussed:</span> {call.talkingPoints.filter((point) => point.discussed).map((point) => point.label).join(" · ")}
        </p>
      )}
      {call.parentSummary && <p className="mt-2 text-xs text-slate-600"><span className="font-semibold">Agreed with the parent:</span> {call.parentSummary}</p>}
      {call.coachNote && <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Shared with coach:</span> {call.coachNote}</p>}
      {call.actionItems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {call.actionItems.map((item, index) => (
            <li key={index} className="text-xs text-slate-700"><span className="font-semibold">{item.label}:</span> {item.note}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {call.callbackAt && <span>Callback: {formatDateTime(call.callbackAt)}</span>}
        {call.message && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={11} />
            {call.message.kind === "summary" ? "Thank-you" : "Missed-call"} message: WhatsApp {MESSAGE_LABEL[call.message.whatsapp] || call.message.whatsapp}, email {MESSAGE_LABEL[call.message.email] || call.message.email}
          </span>
        )}
      </div>
    </div>
  );
}
