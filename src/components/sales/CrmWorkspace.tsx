"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck,
  Clock3,
  Flame,
  Loader2,
  Phone,
  PhoneOff,
  RefreshCw,
  CloudOff,
  Search,
  Sparkles,
  Target,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import type { CrmLeadView, CrmPayload } from "@/lib/crm/leads";
import type { StageGroup } from "@/lib/crm/stageGroups";

/** Inbound changes land in the mirror on the webhook; a poll is enough to show them. */
const POLL_INTERVAL_MS = 10_000;

const GROUP_LABELS: Record<StageGroup, string> = {
  new: "New",
  qualified: "Qualified",
  hot: "Hot",
  demo_requested: "Demo requested",
  demo_booked: "Demo booked",
  demo_completed: "Demo completed",
  converted: "Converted",
  closed: "Closed",
  other: "Other",
};

const GROUP_TONES: Record<StageGroup, string> = {
  new: "bg-slate-100 text-slate-700",
  qualified: "bg-sky-50 text-sky-700",
  hot: "bg-rose-50 text-rose-700",
  demo_requested: "bg-violet-50 text-violet-700",
  demo_booked: "bg-brand-50 text-brand",
  demo_completed: "bg-amber-50 text-amber-700",
  converted: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
  other: "bg-slate-100 text-slate-500",
};

const CALL_OUTCOMES: Array<{ id: string; label: string }> = [
  { id: "connected", label: "Connected" },
  { id: "no_answer", label: "No answer" },
  { id: "busy", label: "Busy" },
  { id: "callback_requested", label: "Callback requested" },
  { id: "wrong_number", label: "Wrong number" },
  { id: "not_interested", label: "Not interested" },
];

type CounterId = keyof CrmPayload["today"];

const COUNTERS: Array<{ id: CounterId; label: string; note: string; icon: any; group?: StageGroup }> = [
  { id: "newLeads", label: "New leads today", note: "First seen from the CRM today", icon: Sparkles },
  { id: "qualified", label: "Qualified leads", note: "Sitting in a qualified stage", icon: Target, group: "qualified" },
  { id: "hot", label: "Hot leads", note: "Sitting in a hot stage", icon: Flame, group: "hot" },
  { id: "demoRequested", label: "Demo requested", note: "Awaiting a coach or a slot", icon: UserPlus, group: "demo_requested" },
  { id: "demoBooked", label: "Demo booked", note: "Approved and scheduled", icon: CalendarCheck, group: "demo_booked" },
  { id: "assignedToday", label: "Assigned today", note: "Upcoming demos assigned today", icon: Clock3 },
  { id: "noShowsToday", label: "No shows today", note: "Missed their demo today", icon: PhoneOff },
  { id: "completedToday", label: "Demos completed today", note: "Delivered today", icon: CalendarCheck },
  { id: "closedToday", label: "Closed today", note: "No response, dead or deleted", icon: UserX, group: "closed" },
];

function dialHref(phone: string) {
  const cleaned = String(phone || "").replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

function when(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function LeadDrawer({
  lead,
  stages,
  canChangeStage,
  canLog,
  outboundConfigured,
  callLoggingConfigured,
  onClose,
  onUpdated,
}: {
  lead: CrmLeadView;
  stages: string[];
  canChangeStage: boolean;
  canLog: boolean;
  outboundConfigured: boolean;
  callLoggingConfigured: boolean;
  onClose: () => void;
  onUpdated: (lead: CrmLeadView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [callOutcome, setCallOutcome] = useState("connected");
  const [callNote, setCallNote] = useState("");
  const [callMinutes, setCallMinutes] = useState("");

  const send = useCallback(
    async (payload: Record<string, unknown>, successMessage: string) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/sales/crm/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "That did not go through.");
        if (data?.lead) onUpdated(data.lead);
        toast.success(successMessage);
        return true;
      } catch (issue: any) {
        toast.error(issue?.message || "That did not go through.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [lead.id, onUpdated],
  );

  const href = dialHref(lead.phone);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-slate-100 bg-gradient-to-r from-brand to-brand-400 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
                {lead.pipeline || "Leads"} - #{lead.crmLeadId}
              </div>
              <h2 className="truncate text-lg font-bold">{lead.name}</h2>
              <p className="mt-0.5 text-xs text-white/80">
                {lead.phone || "No phone"}
                {lead.email ? ` - ${lead.email}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close lead"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition hover:bg-white/25"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
          {lead.lastPushError ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Last push to the CRM failed: {lead.lastPushError}</span>
            </div>
          ) : null}

          <section className="flex flex-wrap items-center gap-3">
            {href ? (
              <a href={href} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-white transition hover:bg-brand-600">
                <Phone size={14} /> Call {lead.phone}
              </a>
            ) : null}
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${GROUP_TONES[lead.stageGroup]}`}>
              {lead.stage || "No stage"}
            </span>
            <span className="text-xs text-slate-500">Changed {when(lead.stageChangedAt)}</span>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Stage</h3>
            {canChangeStage ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={lead.stage}
                  disabled={busy || !outboundConfigured}
                  onChange={(event) => void send({ action: "stage", stage: event.target.value }, "Stage updated in the CRM.")}
                  className="h-9 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 focus:border-brand focus:outline-none disabled:opacity-60"
                >
                  {!stages.includes(lead.stage) && lead.stage ? <option value={lead.stage}>{lead.stage}</option> : null}
                  {stages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
                {busy ? <Loader2 size={15} className="animate-spin text-brand" /> : null}
                {!outboundConfigured ? (
                  <span className="text-xs font-semibold text-amber-700">CRM credentials are not configured.</span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-600">{lead.stage || "No stage"}</p>
            )}
          </section>

          {lead.notes ? (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">CRM notes</h3>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{lead.notes}</p>
            </section>
          ) : null}

          {lead.attributes.length ? (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Lead attributes</h3>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {lead.attributes.map((attribute) => (
                  <div key={attribute.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{attribute.label}</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-800">{attribute.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Calls ({lead.calls.length})</h3>
            <p className="mb-2 text-xs text-slate-500">
              {callLoggingConfigured
                ? "Logged here and mirrored into the CRM, so both sides share one call history."
                : "The CRM Calls endpoint is not configured, so these calls stay in the portal only."}
            </p>
            {canLog ? (
              <form
                className="mb-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[160px_100px_1fr_auto]"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const ok = await send(
                    { action: "call", outcome: callOutcome, durationMinutes: Number(callMinutes || 0), note: callNote },
                    callLoggingConfigured ? "Call logged and sent to the CRM." : "Call logged in the portal.",
                  );
                  if (ok) {
                    setCallNote("");
                    setCallMinutes("");
                  }
                }}
              >
                <select
                  value={callOutcome}
                  onChange={(event) => setCallOutcome(event.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 focus:border-brand focus:outline-none"
                >
                  {CALL_OUTCOMES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={callMinutes}
                  onChange={(event) => setCallMinutes(event.target.value)}
                  type="number"
                  min={0}
                  placeholder="Mins"
                  className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-800 focus:border-brand focus:outline-none"
                />
                <input
                  value={callNote}
                  onChange={(event) => setCallNote(event.target.value)}
                  // The CRM rejects a connected call with no notes, so the field is
                  // required here rather than failing after the fact.
                  required={callOutcome === "connected"}
                  placeholder={callOutcome === "connected" ? "What happened on the call (required)" : "What happened on the call"}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-800 focus:border-brand focus:outline-none"
                />
                <button type="submit" disabled={busy} className="h-9 rounded-lg bg-brand px-3 text-xs font-bold text-white disabled:opacity-60">
                  Log
                </button>
              </form>
            ) : null}
            <ul className="space-y-2">
              {lead.calls.map((call) => (
                <li key={call.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-bold text-slate-800">{call.by}</span>
                    <span>{when(call.at)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
                      {CALL_OUTCOMES.find((option) => option.id === call.outcome)?.label || call.outcome}
                    </span>
                    {call.durationMinutes ? <span>{call.durationMinutes} min</span> : null}
                    {call.syncedToCrm ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">In CRM</span>
                    ) : (
                      <span
                        title={call.pushError || "This call was not sent to the CRM."}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700"
                      >
                        <CloudOff size={11} /> Portal only
                      </span>
                    )}
                  </div>
                  {call.note ? <p className="mt-1 text-slate-700">{call.note}</p> : null}
                </li>
              ))}
              {!lead.calls.length ? <li className="text-sm text-slate-500">No calls logged yet.</li> : null}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Internal notes ({lead.internalNotes.length})
            </h3>
            <p className="mb-2 text-xs text-slate-500">Stays in the portal. Never sent to the CRM.</p>
            {canLog ? (
              <form
                className="mb-3 flex gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const ok = await send({ action: "note", body: noteText }, "Note saved.");
                  if (ok) setNoteText("");
                }}
              >
                <input
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Add an internal note"
                  className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:border-brand focus:outline-none"
                />
                <button type="submit" disabled={busy} className="h-9 rounded-lg bg-brand px-3 text-xs font-bold text-white disabled:opacity-60">
                  Save
                </button>
              </form>
            ) : null}
            <ul className="space-y-2">
              {lead.internalNotes.map((note) => (
                <li key={note.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="text-xs text-slate-500">
                    <span className="font-bold text-slate-800">{note.by}</span> - {when(note.at)}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{note.body}</p>
                </li>
              ))}
              {!lead.internalNotes.length ? <li className="text-sm text-slate-500">No internal notes yet.</li> : null}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Stage history</h3>
            <ol className="space-y-1.5">
              {lead.stageHistory.map((entry, index) => (
                <li key={`${entry.stage}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold text-slate-900">{entry.stage}</span>
                  <span className="text-xs text-slate-500">{when(entry.at)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                    {entry.source === "portal" ? `Portal - ${entry.actorName || "staff"}` : entry.source === "import" ? "Imported" : "CRM"}
                  </span>
                </li>
              ))}
              {!lead.stageHistory.length ? <li className="text-sm text-slate-500">No stage changes recorded yet.</li> : null}
            </ol>
            <p className="mt-3 text-xs text-slate-500">
              First seen {when(lead.firstSeenAt)} - last update {when(lead.lastEventAt)}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function CrmWorkspace({
  initial,
  canChangeStage,
  canLog,
}: {
  initial: CrmPayload;
  canChangeStage: boolean;
  canLog: boolean;
}) {
  const [data, setData] = useState<CrmPayload>(initial);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<StageGroup | "all">("all");
  const [stage, setStage] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sales/crm/leads", { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } catch {
      // A dropped poll is not worth a toast; the next tick recovers.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const stages = useMemo(() => data.catalogue.map((entry) => entry.stage), [data.catalogue]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.leads.filter((lead) => {
      if (group !== "all" && lead.stageGroup !== group) return false;
      if (stage !== "all" && lead.stage !== stage) return false;
      if (!needle) return true;
      return [lead.name, lead.phone, lead.email, lead.stage, lead.notes].join(" ").toLowerCase().includes(needle);
    });
  }, [data.leads, query, group, stage]);

  const openLead = openId ? data.leads.find((lead) => lead.id === openId) || null : null;

  const applyUpdate = useCallback((updated: CrmLeadView) => {
    setData((current) => ({ ...current, leads: current.leads.map((lead) => (lead.id === updated.id ? updated : lead)) }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-10 pt-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-brand to-brand-400 px-5 py-4 text-white">
          <div>
            <h1 className="text-lg font-bold">Lead CRM</h1>
            <p className="text-xs text-white/80">Mirrored from the CRM. Stage changes sync back both ways.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-bold text-white transition hover:bg-white/25"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 xl:grid-cols-5">
          {COUNTERS.map((counter) => {
            const Icon = counter.icon;
            const active = counter.group && group === counter.group;
            return (
              <button
                key={counter.id}
                type="button"
                onClick={() => counter.group && setGroup(active ? "all" : counter.group)}
                className={`rounded-xl border p-3 text-left transition ${
                  active ? "border-brand bg-brand-50" : "border-slate-200 bg-white"
                } ${counter.group ? "hover:border-brand/40" : "cursor-default"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{counter.label}</span>
                  <Icon size={14} className="shrink-0 text-brand" />
                </div>
                <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{data.today[counter.id]}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{counter.note}</div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
          <label className="relative flex h-9 min-w-[220px] flex-1 items-center sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone, email, stage"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
          </label>
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value as StageGroup | "all")}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-brand focus:outline-none"
          >
            <option value="all">All groups</option>
            {(Object.keys(GROUP_LABELS) as StageGroup[]).map((value) => (
              <option key={value} value={value}>
                {GROUP_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-brand focus:outline-none"
          >
            <option value="all">All stages</option>
            {stages.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs font-semibold text-slate-500">
            {rows.length} of {data.leads.length} leads
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-bold">Lead</th>
                <th className="px-3 py-2.5 font-bold">Phone</th>
                <th className="px-3 py-2.5 font-bold">Stage</th>
                <th className="px-3 py-2.5 font-bold">Last call</th>
                <th className="px-3 py-2.5 font-bold">Last update</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-950">{lead.name}</div>
                      <div className="text-xs text-slate-500">{lead.email || `#${lead.crmLeadId}`}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {dialHref(lead.phone) ? (
                        <a href={dialHref(lead.phone)} className="inline-flex items-center gap-1.5 font-bold text-brand hover:underline">
                          <Phone size={13} /> {lead.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">No phone</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${GROUP_TONES[lead.stageGroup]}`}>
                        {lead.stage || "No stage"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{lead.lastCallAt ? when(lead.lastCallAt) : <span className="text-slate-400">Never</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{when(lead.lastEventAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenId(lead.id)}
                        className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-brand-50"
                      >
                        More details
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                    {data.leads.length
                      ? "No leads match these filters."
                      : "No leads yet. Leads appear here as soon as the CRM sends its first webhook, or after an admin imports the existing pipeline."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openLead ? (
        <LeadDrawer
          lead={openLead}
          stages={stages}
          canChangeStage={canChangeStage}
          canLog={canLog}
          outboundConfigured={data.outboundConfigured}
          callLoggingConfigured={data.callLoggingConfigured}
          onClose={() => setOpenId(null)}
          onUpdated={applyUpdate}
        />
      ) : null}
    </div>
  );
}
