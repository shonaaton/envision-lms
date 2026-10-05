"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HeartHandshake, Phone, RefreshCw, UserMinus, X } from "lucide-react";
import { toast } from "sonner";

type Reason = { code: string; severity: "moderate" | "strong" | "window"; label: string; detail: string };
type Flag = {
  _id: string;
  status: "open" | "resolved";
  level: "watch" | "at_risk" | "high";
  peakLevel: "watch" | "at_risk" | "high";
  reasons: Reason[];
  inWindow: boolean;
  firstFlaggedAt: string;
  lastEvaluatedAt: string;
  contactLog: Array<{ at: string; byName?: string; channel: string; note: string }>;
  resolution: { outcome: string; note?: string; byName?: string; at: string; auto: boolean } | null;
  student: { _id: string; name: string; parentName: string; phone: string; isActive: boolean };
  coaches: string[];
};
type Breakdown = { key: string; label: string; count: number };
type Overview = {
  stats: { open: number; high: number; watch: number; saved30: number; left30: number };
  open: Flag[];
  resolved: Flag[];
  exitReasons: Breakdown[];
  pauseReasons: Breakdown[];
};

const TABS = [
  { key: "call", label: "To call" },
  { key: "watch", label: "Watching" },
  { key: "resolved", label: "Settled" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const LEVEL_STYLE: Record<Flag["level"], { label: string; className: string }> = {
  high: { label: "High risk", className: "bg-rose-100 text-rose-800" },
  at_risk: { label: "At risk", className: "bg-amber-100 text-amber-800" },
  watch: { label: "Watch", className: "bg-slate-100 text-slate-700" },
};

const OUTCOMES = [
  { key: "stayed", label: "Staying" },
  { key: "paused", label: "Pausing instead" },
  { key: "left", label: "Leaving" },
  { key: "false_alarm", label: "Not a real risk" },
];
const OUTCOME_LABEL: Record<string, string> = {
  stayed: "Staying",
  paused: "Paused instead",
  left: "Left",
  recovered: "Signs cleared",
  false_alarm: "Not a real risk",
};
const CHANNELS = [
  { key: "call", label: "Phone call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "in_person", label: "In person" },
  { key: "other", label: "Other" },
];

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

export default function RetentionClient({ canManage, initialFlagId }: { canManage: boolean; initialFlagId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>("call");
  const [selectedId, setSelectedId] = useState(initialFlagId);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/retention", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error || "Could not load the retention list.");
      return;
    }
    setData(body);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === "resolved") return data.resolved;
    return data.open.filter((flag) => (tab === "watch" ? flag.level === "watch" : flag.level !== "watch"));
  }, [data, tab]);

  const selected = useMemo(() => [...(data?.open || []), ...(data?.resolved || [])].find((flag) => flag._id === selectedId) || null, [data, selectedId]);

  async function checkNow() {
    setChecking(true);
    const response = await fetch("/api/admin/retention", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setChecking(false);
    if (!response.ok) return toast.error(body.error || "Could not run the check.");
    setData(body);
    const summary = body.summary || {};
    toast.success(`Checked ${summary.scored || 0} students: ${summary.opened || 0} newly flagged, ${summary.recovered || 0} cleared.`);
  }

  return (
    <div className="min-h-screen min-w-0 text-slate-950">
      <div className="mb-5 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <HeartHandshake size={14} />
            User Management
          </div>
          <h1 className="mt-3 text-3xl font-black text-brand">Retention</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Students showing signs they may leave: missed classes, homework or practice stopping, low effort, a long pause, often just before a fee
            renewal. Checked every morning. Call the family, log what they said, and settle the flag.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="To call" value={data?.stats.open ?? "-"} icon={<Phone size={15} />} />
          <Stat label="High risk" value={data?.stats.high ?? "-"} icon={<AlertTriangle size={15} />} />
          <Stat label="Saved (30 days)" value={data?.stats.saved30 ?? "-"} icon={<CheckCircle2 size={15} />} />
          <Stat label="Left (30 days)" value={data?.stats.left30 ?? "-"} icon={<UserMinus size={15} />} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${tab === item.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
              {item.key === "watch" && data ? ` (${data.stats.watch})` : ""}
            </button>
          ))}
        </div>
        {canManage && (
          <button type="button" className="btn btn-outline ml-auto" onClick={checkNow} disabled={checking}>
            <RefreshCw size={16} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Check now"}
          </button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {!data && <div className="rounded-2xl border border-brand/10 bg-white p-10 text-center text-sm text-slate-500">Loading…</div>}
          {data && !rows.length && (
            <div className="rounded-2xl border border-brand/10 bg-white p-10 text-center">
              <HeartHandshake size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">{tab === "resolved" ? "Nothing settled in the last 90 days" : "Nobody here right now"}</p>
              <p className="mt-1 text-xs text-slate-500">The check runs every morning at 8:00. New flags also appear as tasks.</p>
            </div>
          )}
          {rows.map((flag) => (
            <FlagCard key={flag._id} flag={flag} onOpen={() => setSelectedId(flag._id)} />
          ))}
        </div>

        <div className="space-y-4">
          <Breakdown title="Why families left (6 months)" rows={data?.exitReasons || []} empty="No leavers with a reason yet. A reason is now asked whenever a student is deactivated." />
          <Breakdown title="Why families paused (6 months)" rows={data?.pauseReasons || []} empty="No pauses with a reason yet." />
        </div>
      </div>

      {selected && <FlagDrawer flag={selected} canManage={canManage} onClose={() => setSelectedId("")} onChanged={load} />}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand/10 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-black tabular-nums text-brand">{value}</div>
    </div>
  );
}

function LevelBadge({ level }: { level: Flag["level"] }) {
  const style = LEVEL_STYLE[level];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style.className}`}>{style.label}</span>;
}

function FlagCard({ flag, onOpen }: { flag: Flag; onOpen: () => void }) {
  const lastContact = flag.contactLog[flag.contactLog.length - 1];
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-2xl border border-brand/10 bg-white p-4 text-left shadow-sm transition hover:border-brand/30 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-black text-slate-950">{flag.student.name}</span>
        {flag.status === "open" ? <LevelBadge level={flag.level} /> : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">{OUTCOME_LABEL[flag.resolution?.outcome || ""] || "Settled"}</span>
        )}
        {flag.inWindow && flag.status === "open" && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">Renewal / return soon</span>}
        <span className="ml-auto text-xs text-slate-500">
          {flag.status === "open" ? `Flagged ${daysSince(flag.firstFlaggedAt)}d ago` : formatDate(flag.resolution?.at)}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {flag.reasons.map((reason) => (
          <li key={reason.code} className={`rounded-lg px-2 py-1 text-xs font-semibold ${reason.severity === "strong" ? "bg-rose-50 text-rose-800" : reason.severity === "window" ? "bg-brand/5 text-brand" : "bg-slate-50 text-slate-700"}`}>
            {reason.label}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {flag.coaches.length > 0 && <span>Coach: {flag.coaches.join(", ")}</span>}
        <span>{lastContact ? `Last contact ${formatDate(lastContact.at)}${lastContact.byName ? ` by ${lastContact.byName}` : ""}` : "Not contacted yet"}</span>
      </div>
    </button>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: Breakdown[]; empty: string }) {
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

function FlagDrawer({ flag, canManage, onClose, onChanged }: { flag: Flag; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [channel, setChannel] = useState("call");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const open = flag.status === "open";

  async function send(payload: Record<string, unknown>, success: string) {
    setSaving(true);
    const response = await fetch(`/api/admin/retention/${flag._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(body.error || "Could not save.");
      return false;
    }
    toast.success(success);
    await onChanged();
    return true;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">{flag.student.name}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {[flag.student.parentName && `Parent: ${flag.student.parentName}`, flag.student.phone].filter(Boolean).join(" · ") || "No contact details on file"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {open ? <LevelBadge level={flag.level} /> : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-700">{OUTCOME_LABEL[flag.resolution?.outcome || ""]}</span>}
          <span>Flagged {formatDate(flag.firstFlaggedAt)}</span>
          {flag.coaches.length > 0 && <span>· Coach: {flag.coaches.join(", ")}</span>}
        </div>

        <Section title="Why">
          <ul className="space-y-2">
            {flag.reasons.map((reason) => (
              <li key={reason.code} className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm font-bold text-slate-900">{reason.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">{reason.detail}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Contact log">
          {flag.contactLog.length ? (
            <ul className="space-y-2">
              {flag.contactLog.map((entry, index) => (
                <li key={index} className="rounded-lg border border-slate-100 p-3 text-sm">
                  <p className="text-xs text-slate-500">
                    {formatDate(entry.at)} · {CHANNELS.find((item) => item.key === entry.channel)?.label || entry.channel}
                    {entry.byName ? ` · ${entry.byName}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-line leading-6 text-slate-800">{entry.note}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nobody has spoken to the family yet.</p>
          )}
          {open && canManage && (
            <form
              className="mt-3 space-y-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await send({ action: "contact", channel, note }, "Call logged.")) setNote("");
              }}
            >
              <select className="input" value={channel} onChange={(event) => setChannel(event.target.value)}>
                {CHANNELS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <textarea className="input min-h-[80px]" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="What did the family say? e.g. finds the 7pm slot hard, wants weekends" />
              <button type="submit" className="btn btn-outline w-full" disabled={saving || !note.trim()}>
                <Phone size={16} /> Log contact
              </button>
            </form>
          )}
        </Section>

        {open && canManage ? (
          <Section title="Settle">
            <form
              className="space-y-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await send({ action: "resolve", outcome, note: outcomeNote }, "Flag settled.")) onClose();
              }}
            >
              <select className="input" value={outcome} onChange={(event) => setOutcome(event.target.value)} required>
                <option value="">How did it end?</option>
                {OUTCOMES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <textarea className="input min-h-[60px]" value={outcomeNote} maxLength={1000} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="Optional note" />
              {outcome === "left" && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                  This only settles the flag. Deactivate the student from Users when they actually stop, and choose the reason there.
                </p>
              )}
              {outcome === "paused" && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                  Set up the pause from Paused Students so their classes and invoices move with it.
                </p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={saving || !outcome}>
                <CheckCircle2 size={16} /> Settle flag
              </button>
            </form>
          </Section>
        ) : flag.resolution ? (
          <Section title="Outcome">
            <p className="text-sm font-bold text-slate-900">{OUTCOME_LABEL[flag.resolution.outcome] || flag.resolution.outcome}</p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(flag.resolution.at)}
              {flag.resolution.auto ? " · automatic" : flag.resolution.byName ? ` · ${flag.resolution.byName}` : ""}
            </p>
            {flag.resolution.note && <p className="mt-2 text-sm leading-6 text-slate-700">{flag.resolution.note}</p>}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{title}</p>
      {children}
    </div>
  );
}
