"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Download, Eraser, Loader2, RotateCcw, Search, Send, X } from "lucide-react";

type EventRow = {
  id: string;
  status: string;
  createdAt: string;
  topicName: string;
  message: string;
  classroomId: string;
  classroomTitle: string;
  templateTitle: string;
  homeworkTitle: string;
  actionable: boolean;
  resolved: null | { at: string; by: string; homeworkTitle: string; templateTitle: string; dueAt: string };
  cleared: null | { at: string; by: string };
};

type Group = "open" | "all" | "missing" | "skipped" | "error" | "assigned" | "resolved";

const GROUPS: Array<{ key: Group; label: string; tone: string }> = [
  { key: "all", label: "All", tone: "slate" },
  { key: "open", label: "Needs homework", tone: "rose" },
  { key: "missing", label: "Missing template", tone: "rose" },
  { key: "skipped", label: "Skipped", tone: "amber" },
  { key: "error", label: "Errors", tone: "rose" },
  { key: "assigned", label: "Auto-assigned", tone: "emerald" },
  { key: "resolved", label: "Assigned from here", tone: "emerald" },
];

const STATUS_LABELS: Record<string, string> = {
  assigned: "assigned",
  assigned_without_due: "assigned, no deadline",
  missing_template: "missing template",
  ambiguous_template: "several templates",
  skipped_no_batch: "skipped: no batch",
  skipped_no_next_class: "skipped: no next class",
  error: "error",
};

function badgeClass(status: string) {
  if (status.startsWith("assigned")) return "bg-emerald-50 text-emerald-700";
  if (status === "ambiguous_template" || status.startsWith("skipped")) return "bg-amber-50 text-amber-700";
  if (status === "missing_template" || status === "error") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(value));
}

// datetime-local works in the browser's own zone; the academy runs on IST.
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const API = "/api/admin/assignment-templates/automation-events";

export default function AutomationEventsPanel() {
  const [group, setGroup] = useState<Group>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cleared, setCleared] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Group, number>>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [assignFor, setAssignFor] = useState<EventRow | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const filters = useMemo(() => ({ group, q: debouncedQ, from, to, cleared: cleared ? "1" : "" }), [group, debouncedQ, from, to, cleared]);
  const hasFilters = Boolean(debouncedQ || from || to || group !== "all" || cleared);

  const query = useCallback((extra: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...extra }).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);

  const load = useCallback(async (nextPage = 1) => {
    // A late answer for older filters must not overwrite the newer list.
    const request = ++requestRef.current;
    setLoading(true);
    const response = await fetch(`${API}?${query({ page: String(nextPage) })}`, { cache: "no-store" }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (request !== requestRef.current) return;
    setLoading(false);
    if (!response?.ok) {
      toast.error(data.error || "Could not load automation events");
      return;
    }
    setEvents((current) => (nextPage === 1 ? data.events : [...current, ...data.events]));
    setCounts(data.counts || {});
    setTotal(data.total || 0);
    setPage(nextPage);
    setHasMore(Boolean(data.hasMore));
    setCanManage(Boolean(data.canManage));
  }, [query]);

  useEffect(() => {
    setSelected([]);
    void load(1);
  }, [load]);

  function resetFilters() {
    setGroup("all");
    setQ("");
    setDebouncedQ("");
    setFrom("");
    setTo("");
    setCleared(false);
  }

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const allSelected = events.length > 0 && events.every((event) => selected.includes(event.id));

  function download(format: "xlsx" | "csv") {
    setDownloadOpen(false);
    const extra: Record<string, string> = { download: format };
    if (selected.length) extra.ids = selected.join(",");
    window.location.href = `${API}?${query(extra)}`;
  }

  async function clearOrRestore(action: "clear" | "restore", ids?: string[]) {
    const scopeText = ids?.length ? `${ids.length} event${ids.length === 1 ? "" : "s"}` : `all ${total} event${total === 1 ? "" : "s"} matching these filters`;
    if (!ids?.length || ids.length > 1) {
      const verb = action === "clear" ? "Clear" : "Restore";
      const note = action === "clear" ? " They are hidden from this list, not deleted, and can be restored from \"Show cleared\"." : "";
      if (!window.confirm(`${verb} ${scopeText}?${note}`)) return;
    }
    setBusy(true);
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids?.length ? { action, ids } : { action, filters }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) return toast.error(data.error || "Could not update the events");
    toast.success(`${action === "clear" ? "Cleared" : "Restored"} ${data.updated} event${data.updated === 1 ? "" : "s"}`);
    setSelected([]);
    void load(1);
  }

  const openCount = counts.open ?? 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-2">
          <Clock3 size={18} className="text-brand" />
          <div>
            <h2 className="text-lg font-black text-slate-950">Automation Events</h2>
            <p className="text-xs text-slate-500">
              {cleared ? "Cleared events - restore any you still need." : openCount ? `${openCount} class${openCount === 1 ? "" : "es"} still without homework.` : "Every class has its homework."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={cleared} onChange={(event) => setCleared(event.target.checked)} className="h-4 w-4 accent-brand" />
            Show cleared
          </label>
          <div className="relative">
            <button type="button" onClick={() => setDownloadOpen((open) => !open)} disabled={!total && !selected.length} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 disabled:opacity-40">
              <Download size={15} /> {selected.length ? `Download ${selected.length}` : `Download ${total}`}
            </button>
            {downloadOpen && (
              <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                <button type="button" onClick={() => download("xlsx")} className="block w-full px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50">Excel (.xlsx)</button>
                <button type="button" onClick={() => download("csv")} className="block w-full px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50">CSV</button>
              </div>
            )}
          </div>
          {canManage && !selected.length && total > 0 && (
            <button type="button" onClick={() => clearOrRestore(cleared ? "restore" : "clear")} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 disabled:opacity-40">
              {cleared ? <RotateCcw size={15} /> : <Eraser size={15} />} {cleared ? "Restore" : "Clear"} all {total}
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {GROUPS.map((item) => {
          const active = group === item.key;
          const count = counts[item.key];
          const urgent = item.key === "open" && Boolean(count);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setGroup(item.key)}
              className={`inline-flex h-9 flex-none items-center gap-2 rounded-full border px-3 text-sm font-bold transition ${
                active ? "border-brand bg-brand text-white" : urgent ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.label}
              <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{count ?? "-"}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
        <span className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
          <Search size={15} className="text-slate-400" />
          <input value={q} onChange={(event) => setQ(event.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Search topic, class, message" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-slate-400"><X size={14} /></button>}
        </span>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-500">
          From
          <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="min-w-0 flex-1 text-sm font-semibold text-slate-700 outline-none" />
        </label>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-500">
          To
          <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="min-w-0 flex-1 text-sm font-semibold text-slate-700 outline-none" />
        </label>
        <button type="button" onClick={resetFilters} disabled={!hasFilters} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:opacity-40">Reset filters</button>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-brand/20 bg-brand/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-bold text-slate-950">{selected.length} selected</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelected([])} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">Deselect</button>
            {canManage && (
              <button type="button" onClick={() => clearOrRestore(cleared ? "restore" : "clear", selected)} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-black text-white disabled:opacity-50">
                {cleared ? <RotateCcw size={15} /> : <Eraser size={15} />} {cleared ? "Restore" : "Clear"} selected
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-bold text-slate-500">
        <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : events.map((event) => event.id))} disabled={!events.length} className="h-4 w-4 accent-brand" aria-label="Select every loaded event" />
        Showing {events.length} of {total}
        {loading && <Loader2 size={13} className="animate-spin" />}
      </div>

      <div className="space-y-2">
        {events.map((event) => {
          const needsHomework = event.actionable && !event.resolved;
          return (
            <div
              key={event.id}
              className={`grid gap-3 rounded-lg border p-3 text-sm md:grid-cols-[20px_170px_minmax(0,1fr)_150px_auto] md:items-center ${
                selected.includes(event.id) ? "border-brand/30 bg-brand/5" : needsHomework ? "border-rose-100 bg-rose-50/40" : "border-slate-200 bg-slate-50"
              }`}
            >
              <input type="checkbox" checked={selected.includes(event.id)} onChange={() => toggle(event.id)} className="h-4 w-4 accent-brand" aria-label={`Select ${event.topicName || "event"}`} />
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(event.status)}`}>{STATUS_LABELS[event.status] || event.status.replaceAll("_", " ")}</span>
              <div className="min-w-0">
                <div className="font-semibold text-slate-950">{event.message || event.topicName || "Automation event"}</div>
                <div className="truncate text-xs text-slate-500">
                  {event.classroomId ? <Link href={`/classrooms/${event.classroomId}`} className="font-semibold text-slate-600 hover:text-brand hover:underline">{event.classroomTitle || "Class"}</Link> : "Class removed"}
                  {" - "}{event.templateTitle || "No template"}{" - "}{event.homeworkTitle || "No homework"}
                </div>
                {event.resolved && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    <CheckCircle2 size={12} /> Assigned &quot;{event.resolved.homeworkTitle || event.resolved.templateTitle}&quot;{event.resolved.by ? ` by ${event.resolved.by}` : ""} - due {formatDate(event.resolved.dueAt)}
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-500">{formatDate(event.createdAt)}</div>
              <div className="flex items-center gap-1 md:justify-end">
                {canManage && needsHomework && !event.cleared && (
                  <button type="button" onClick={() => setAssignFor(event)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-black text-white">
                    <Send size={13} /> Assign
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => clearOrRestore(event.cleared ? "restore" : "clear", [event.id])}
                    disabled={busy}
                    title={event.cleared ? "Restore to the list" : "Clear from the list"}
                    aria-label={event.cleared ? "Restore event" : "Clear event"}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
                  >
                    {event.cleared ? <RotateCcw size={14} /> : <X size={14} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!loading && !events.length && (
          <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
            {hasFilters ? "No events match these filters." : "No automation events yet."}
          </div>
        )}
      </div>

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={() => load(page + 1)} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:opacity-50">
            {loading && <Loader2 size={14} className="animate-spin" />} Load more ({total - events.length} left)
          </button>
        </div>
      )}

      {assignFor && (
        <AssignDialog
          event={assignFor}
          onClose={() => setAssignFor(null)}
          onAssigned={() => {
            setAssignFor(null);
            void load(1);
          }}
        />
      )}
    </section>
  );
}

type TemplateOption = { id: string; title: string; topicName: string; courseName: string; levelName: string; reason: string; autoAssign: boolean };

type AssignContext = {
  event: { id: string; status: string; topicName: string; message: string };
  classroom: { id: string; title: string; levelName: string; sessionStart: string };
  recipients: string;
  suggestedDueAt: string;
  existingHomework: Array<{ id: string; title: string; dueAt: string }>;
  suggestions: TemplateOption[];
  results: TemplateOption[];
};

function AssignDialog({ event, onClose, onAssigned }: { event: EventRow; onClose: () => void; onAssigned: () => void }) {
  const [context, setContext] = useState<AssignContext | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TemplateOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<TemplateOption | null>(null);
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const url = `${API}/${event.id}/assign`;

  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (!alive) return;
        if (!response.ok) return setError(data.error || "Could not load this event");
        setContext(data);
        setDueAt(toLocalInput(data.suggestedDueAt));
        if (data.suggestions?.length === 1) setPicked(data.suggestions[0]);
      })
      .catch(() => alive && setError("Could not load this event"));
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      const response = await fetch(`${url}?q=${encodeURIComponent(term)}`, { cache: "no-store" }).catch(() => null);
      const data = response ? await response.json().catch(() => ({})) : {};
      if (!alive) return;
      setSearching(false);
      setResults(response?.ok ? data.results || [] : []);
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [search, url]);

  async function assign() {
    if (!picked) return toast.error("Pick a template to assign");
    const due = new Date(dueAt);
    if (!dueAt || Number.isNaN(due.getTime())) return toast.error("Set a submission deadline");
    if (due.getTime() <= Date.now()) return toast.error("The deadline must be in the future");
    setSaving(true);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: picked.id, dueAt: due.toISOString() }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSaving(false);
    if (!response?.ok) return toast.error(data.error || "Could not assign homework");
    toast.success(`Assigned "${data.title}" - due ${formatDate(data.dueAt)}`);
    onAssigned();
  }

  function TemplateCard({ template }: { template: TemplateOption }) {
    const active = picked?.id === template.id;
    return (
      <button
        type="button"
        onClick={() => setPicked(template)}
        className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-950">{template.title}</div>
            <div className="truncate text-xs text-slate-500">{[template.courseName, template.levelName, template.topicName].filter(Boolean).join(" - ") || "Not filed under a course"}</div>
          </div>
          {active && <CheckCircle2 size={16} className="flex-none text-brand" />}
        </div>
        {template.reason && <div className="mt-1 text-xs font-semibold text-amber-700">{template.reason}</div>}
      </button>
    );
  }

  const suggestionIds = new Set((context?.suggestions || []).map((item) => item.id));
  const otherResults = results.filter((item) => !suggestionIds.has(item.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" onMouseDown={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="assign-event-title" className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">Assign missed homework</div>
            <h3 id="assign-event-title" className="mt-1 text-xl font-black text-slate-950">{event.topicName || "Class topic"}</h3>
            <p className="mt-1 truncate text-sm text-slate-500">{event.classroomTitle || "Class"}{context?.classroom.sessionStart ? ` - class on ${formatDate(context.classroom.sessionStart)}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 text-slate-600" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}
          {!context && !error && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Finding matching templates...</div>}
          {context && (
            <>
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{context.event.message}</div>

              {context.existingHomework.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                  This class already has: {context.existingHomework.map((item) => `"${item.title}"`).join(", ")}. Assigning adds another.
                </div>
              )}

              <div>
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Suggested templates</div>
                {context.suggestions.length ? (
                  <div className="space-y-2">{context.suggestions.map((template) => <TemplateCard key={template.id} template={template} />)}</div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">No template matches this topic. Search for one below.</div>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Or search all templates</div>
                <span className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3">
                  <Search size={15} className="text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 text-sm outline-none" placeholder="Template, topic, course or level" />
                  {searching && <Loader2 size={14} className="animate-spin text-slate-400" />}
                </span>
                {search.trim() && !searching && (
                  <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                    {otherResults.map((template) => <TemplateCard key={template.id} template={template} />)}
                    {!otherResults.length && <div className="text-xs text-slate-500">No other templates match.</div>}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                  Submission deadline
                  <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="input mt-1 h-11 normal-case tracking-normal text-slate-950" />
                  <span className="mt-1 block font-semibold normal-case tracking-normal text-slate-500">Defaults to just before the next class.</span>
                </label>
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Goes to
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold normal-case tracking-normal text-slate-800">
                    {context.recipients || <span className="text-rose-600">No batch or students on this class</span>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
          <div className="min-w-0 truncate text-xs text-slate-500">{picked ? <>Assigning <b className="text-slate-800">{picked.title}</b></> : "Pick a template"}</div>
          <div className="flex flex-none gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancel</button>
            <button type="button" onClick={assign} disabled={saving || !picked || !context?.recipients} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-black text-white disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Assign homework
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
