"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpenCheck, CheckCircle2, Download, Eraser, Loader2, RotateCcw, Search, Send, Sparkles, TriangleAlert } from "lucide-react";
import { Badge, BranchHeader, EmptyState, Field, Modal, ModeBadge, Panel, Stat, api } from "./shared";
import { cn } from "@/lib/utils";

type TemplateRow = { id: string; title: string; topicName: string; courseName: string; levelName: string; autoAssign: boolean; linked: boolean; activities: string };
type CourseOption = { id: string; name: string; levels: { name: string; topics: string[] }[] };
type Library = {
  rows: TemplateRow[];
  total: number;
  page: number;
  pages: number;
  counts: { active: number; autoOn: number; autoOff: number };
  courseOptions: string[];
  levelOptions: string[];
  courses: CourseOption[];
};

type LogRow = {
  id: string;
  date: string;
  slotId: string;
  slotLabel: string;
  mode: string;
  studentId: string;
  studentName: string;
  topic: string;
  levelName: string;
  status: string;
  reason: string;
  templateTitle: string;
  resolved: null | { at: string; by: string; title: string };
  cleared: null | { at: string; by: string };
};
type LogGroup = "all" | "open" | "shared" | "fixed" | "no_template" | "no_topic" | "no_login";
type LogData = { rows: LogRow[]; hasMore: boolean; total: number; counts: Record<LogGroup, number> };

const GROUPS: { key: LogGroup; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Needs homework" },
  { key: "shared", label: "Shared automatically" },
  { key: "fixed", label: "Fixed by hand" },
  { key: "no_template", label: "No template" },
  { key: "no_topic", label: "No topic written" },
  { key: "no_login", label: "No login" },
];

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "muted" }> = {
  shared: { label: "Shared", tone: "good" },
  no_template: { label: "No template", tone: "bad" },
  no_topic: { label: "No topic", tone: "warn" },
  no_login: { label: "No login", tone: "warn" },
};

const dateText = (value: string) =>
  new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const when = (value: string) =>
  new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function shift(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function HomeworkTemplatesClient({ can, autoHomework }: { can: string[]; autoHomework: boolean }) {
  const [tab, setTab] = useState<"log" | "templates">("log");
  const [log, setLog] = useState<LogData | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);

  // The log's "needs homework" count shows on both tabs.
  const refreshCounts = useCallback(() => {
    api<LogData>("/api/bowbazar/homework/log?group=open").then(setLog).catch(() => undefined);
  }, []);
  useEffect(() => {
    refreshCounts();
    api<Library>("/api/bowbazar/homework/library").then(setLibrary).catch((error) => toast.error(error.message));
  }, [refreshCounts]);

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Homework templates"
        subtitle="The academy's own templates, the same ones the online classes use. After every centre register and online live class, each present student gets the template for their topic and their course level."
        can={can}
      />

      {!autoHomework && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert size={16} />
          <span className="font-bold">Auto-share is switched off,</span> so nothing is shared or logged after classes.
          {can.includes("fees") && <Link href="/bowbazar/settings" className="font-bold text-brand underline">Turn it on in Branch Settings</Link>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Needs homework" value={log ? log.counts.open : "-"} tone={log?.counts.open ? "bad" : "good"} icon={<TriangleAlert size={16} />} hint="Present students who got nothing" onClick={() => setTab("log")} />
        <Stat label="Shared automatically" value={log ? log.counts.shared : "-"} tone="good" icon={<Send size={16} />} hint="Bowbazar classes only" onClick={() => setTab("log")} />
        <Stat label="Templates" value={library ? library.counts.active : "-"} icon={<BookOpenCheck size={16} />} hint="Shared with online" onClick={() => setTab("templates")} />
        <Stat label="Auto-assign on" value={library ? library.counts.autoOn : "-"} icon={<Sparkles size={16} />} hint={library ? `${library.counts.autoOff} switched off by the academy` : undefined} onClick={() => setTab("templates")} />
      </div>

      <div className="flex gap-1 rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
        {(["log", "templates"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn("flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition", tab === key ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-50")}
          >
            {key === "log" ? "Auto-share log" : "Templates"}
          </button>
        ))}
      </div>

      {tab === "log" ? <LogPanel onChanged={refreshCounts} /> : <TemplatesPanel initial={library} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-share log
// ---------------------------------------------------------------------------

function LogPanel({ onChanged }: { onChanged: () => void }) {
  const [group, setGroup] = useState<LogGroup>("open");
  const [mode, setMode] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cleared, setCleared] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState<LogRow | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ group, mode, q: search, from, to, cleared: cleared ? "1" : "" });
    return value;
  }, [group, mode, search, from, to, cleared]);

  const load = useCallback(() => {
    api<LogData>(`/api/bowbazar/homework/log?${params}&page=${page}`)
      .then((result) => {
        setData(result);
        setSelected([]);
      })
      .catch((error) => toast.error(error.message));
  }, [params, page]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  useEffect(() => setPage(1), [params]);

  async function clear(ids: string[], restore = false) {
    try {
      const result = await api<{ changed: number }>("/api/bowbazar/homework/log", { method: "POST", json: { action: restore ? "restore" : "clear", ids } });
      toast.success(`${result.changed} line${result.changed === 1 ? "" : "s"} ${restore ? "brought back" : "cleared"}.`);
      load();
      onChanged();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const rows = data?.rows || [];
  const allPicked = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  return (
    <Panel
      title="Auto-share log"
      subtitle="Only Bowbazar classes, centre and online. One line per present student per class."
      actions={
        <a href={`/api/bowbazar/homework/log?${params}&format=csv`} className="btn-secondary inline-flex h-9 items-center gap-1.5 text-sm">
          <Download size={14} /> Download
        </a>
      }
    >
      <div className="space-y-3 border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setGroup(item.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold ring-1 transition",
                group === item.key ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200 hover:bg-brand-50"
              )}
            >
              {item.label}
              {data && <span className="ml-1 opacity-75">{data.counts[item.key]}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, topic, class, homework" />
          </div>
          <select className="input h-9 w-auto" value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Class type">
            <option value="">Centre + online</option>
            <option value="offline">Centre classes</option>
            <option value="online">Online classes</option>
          </select>
          <input type="date" className="input h-9 w-auto" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From" />
          <input type="date" className="input h-9 w-auto" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To" />
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={cleared} onChange={(event) => setCleared(event.target.checked)} /> Show cleared
          </label>
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold text-slate-700">{selected.length} picked</span>
            <button type="button" className="btn-secondary inline-flex h-8 items-center gap-1.5 text-xs" onClick={() => clear(selected, cleared)}>
              {cleared ? <RotateCcw size={13} /> : <Eraser size={13} />} {cleared ? "Bring back" : "Clear"}
            </button>
          </div>
        )}
      </div>

      {!data ? (
        <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      ) : !rows.length ? (
        <EmptyState
          icon={<CheckCircle2 size={20} />}
          title={group === "open" ? "Every present student has homework" : "Nothing here"}
          hint="Lines appear when a register is saved or an online live class ends."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input type="checkbox" checked={allPicked} onChange={() => setSelected(allPicked ? [] : rows.map((row) => row.id))} aria-label="Pick all" />
                </th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Topic</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const status = STATUS[row.status] || { label: row.status, tone: "muted" as const };
                const open = row.status !== "shared" && !row.resolved;
                return (
                  <tr key={row.id} className={cn(row.cleared && "opacity-60")}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() => setSelected((list) => (list.includes(row.id) ? list.filter((value) => value !== row.id) : [...list, row.id]))}
                        aria-label={`Pick ${row.studentName}`}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-slate-800">{dateText(row.date)}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500"><ModeBadge mode={row.mode} /> {row.slotLabel}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-slate-800">{row.studentName}</div>
                      {row.levelName && <div className="text-xs text-slate-500">{row.levelName}</div>}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">{row.topic || <span className="text-slate-400">-</span>}</td>
                    <td className="max-w-[22rem] px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={row.resolved ? "good" : status.tone} dot>{row.resolved ? "Fixed by hand" : status.label}</Badge>
                        {row.templateTitle && <span className="text-xs font-semibold text-slate-700">{row.templateTitle}</span>}
                      </div>
                      {row.status !== "shared" && <div className="mt-1 text-xs text-slate-500">{row.reason}</div>}
                      {row.resolved && (
                        <div className="mt-1 text-xs text-emerald-700">
                          {row.resolved.title ? `"${row.resolved.title}" set` : "Homework set"} by {row.resolved.by} · {when(row.resolved.at)}
                        </div>
                      )}
                      {row.cleared && <div className="mt-1 text-xs text-slate-400">Cleared by {row.cleared.by} · {when(row.cleared.at)}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                      {open && row.status !== "no_login" && (
                        <button type="button" className="btn-primary inline-flex h-8 items-center gap-1.5 text-xs" onClick={() => setAssigning(row)}>
                          <Send size={13} /> Set homework
                        </button>
                      )}
                      {open && row.status === "no_login" && (
                        <Link href="/bowbazar/students" className="text-xs font-bold text-brand underline">Send login</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && (page > 1 || data.hasMore) && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
          <span className="font-semibold text-slate-500">Page {page} · {data.total} lines</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary h-8 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button type="button" className="btn-secondary h-8 text-xs" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}

      {assigning && (
        <AssignModal
          row={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            load();
            onChanged();
          }}
        />
      )}
    </Panel>
  );
}

type PickTemplate = { id: string; title: string; topicName: string; levelName: string; courseName: string; activityCount: number };

function AssignModal({ row, onClose, onDone }: { row: LogRow; onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState(row.topic);
  const [templates, setTemplates] = useState<PickTemplate[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const defaultDue = useMemo(() => {
    const due = shift(row.date, 6);
    return due < istToday() ? istToday() : due;
  }, [row.date]);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api<{ templates: PickTemplate[] }>(`/api/bowbazar/homework/templates?q=${encodeURIComponent(query)}`)
        .then((result) => setTemplates(result.templates))
        .catch((error) => toast.error(error.message));
    }, 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  async function submit() {
    if (!picked) return toast.error("Pick the homework to set.");
    setBusy(true);
    try {
      await api(`/api/bowbazar/homework/log/${row.id}/assign`, { method: "POST", json: { templateId: picked, dueDate } });
      toast.success(`Homework set for ${row.studentName}.`);
      onDone();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Set homework for ${row.studentName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary inline-flex items-center gap-1.5" disabled={busy || !picked} onClick={submit}>
            {busy && <Loader2 size={14} className="animate-spin" />} Set homework
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          {dateText(row.date)} · {row.slotLabel}
          {row.topic && <> · taught <span className="font-semibold text-slate-800">{row.topic}</span></>}
          {row.levelName && <> · {row.levelName}</>}
        </p>
        <Field label="Find a template">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Topic, title, level" autoFocus />
          </div>
        </Field>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
          {!templates ? (
            <div className="flex items-center gap-2 p-3 text-slate-500"><Loader2 size={14} className="animate-spin" /> Searching...</div>
          ) : !templates.length ? (
            <div className="p-3 text-slate-500">No template matches. Try a shorter search.</div>
          ) : (
            templates.map((template) => (
              <label
                key={template.id}
                className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5", picked === template.id ? "bg-brand-50 ring-1 ring-brand/30" : "hover:bg-slate-50")}
              >
                <input type="radio" name="template" className="mt-1" checked={picked === template.id} onChange={() => setPicked(template.id)} />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-800">{template.title}</span>
                  <span className="block text-xs text-slate-500">
                    {[template.courseName, template.levelName, template.topicName].filter(Boolean).join(" · ")} · {template.activityCount} activit{template.activityCount === 1 ? "y" : "ies"}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        <Field label="Due date" hint="Goes on the class's copy of this homework, like setting it on the register.">
          <input type="date" className="input h-9" value={dueDate} min={istToday()} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Templates (read-only: the academy edits them online)
// ---------------------------------------------------------------------------

function TemplatesPanel({ initial }: { initial: Library | null }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("");
  const [level, setLevel] = useState("");
  const [auto, setAuto] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Library | null>(initial);
  const first = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => setPage(1), [search, course, level, auto]);
  useEffect(() => {
    // The page already loaded the unfiltered first page.
    if (first.current && initial && !search && !course && !level && !auto && page === 1) {
      first.current = false;
      return;
    }
    first.current = false;
    const params = new URLSearchParams({ q: search, course, level, auto, page: String(page) });
    api<Library>(`/api/bowbazar/homework/library?${params}`).then(setData).catch((error) => toast.error(error.message));
  }, [search, course, level, auto, page, initial]);

  return (
    <div className="space-y-4">
      <TopicChecker courses={data?.courses || initial?.courses || []} />
      <Panel title="Templates" subtitle={data ? `${data.total} shown · made and edited by the academy's online admins` : undefined}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search template, topic, course, level" />
          </div>
          <select className="input h-9 w-auto" value={course} onChange={(event) => { setCourse(event.target.value); setLevel(""); }} aria-label="Course">
            <option value="">All courses</option>
            {(data?.courseOptions || []).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="input h-9 w-auto" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Level">
            <option value="">All levels</option>
            {(data?.levelOptions || []).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="input h-9 w-auto" value={auto} onChange={(event) => setAuto(event.target.value)} aria-label="Auto-assign">
            <option value="">Auto on + off</option>
            <option value="on">Auto-assign on</option>
            <option value="off">Auto-assign off</option>
          </select>
        </div>
        {!data ? (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
        ) : !data.rows.length ? (
          <EmptyState icon={<BookOpenCheck size={20} />} title="No templates match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Template</th>
                  <th className="px-3 py-2">Topic</th>
                  <th className="px-3 py-2">Course · level</th>
                  <th className="px-3 py-2">Activities</th>
                  <th className="px-3 py-2">Auto-assign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.title}</td>
                    <td className="px-3 py-2 text-slate-700">{row.topicName || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{[row.courseName, row.levelName].filter(Boolean).join(" · ") || "Any course"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.activities}</td>
                    <td className="px-3 py-2">
                      <Badge tone={row.autoAssign ? "good" : "muted"} dot>{row.autoAssign ? "On" : "Off"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-500">Page {data.page} of {data.pages}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary h-8 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button type="button" className="btn-secondary h-8 text-xs" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function TopicChecker({ courses }: { courses: CourseOption[] }) {
  const [courseId, setCourseId] = useState("");
  const [levelName, setLevelName] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ template: { title: string; activities: string } | null; reason: string } | null>(null);
  const course = courses.find((item) => item.id === courseId);
  const topics = course?.levels.find((item) => item.name === levelName)?.topics || [];

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await api("/api/bowbazar/homework/library/check", { method: "POST", json: { courseId, levelName, topic } }));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Check a topic" subtitle="What a student of this level gets when this topic is written on the register.">
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <Field label="Course">
          <select className="input h-9" value={courseId} onChange={(event) => { setCourseId(event.target.value); setLevelName(""); setResult(null); }}>
            <option value="">No course set</option>
            {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Level">
          <select className="input h-9" value={levelName} onChange={(event) => { setLevelName(event.target.value); setResult(null); }} disabled={!course}>
            <option value="">No level set</option>
            {(course?.levels || []).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Topic taught">
          <input className="input h-9" list="bowbazar-topic-options" value={topic} onChange={(event) => { setTopic(event.target.value); setResult(null); }} placeholder="e.g. Forks" />
          <datalist id="bowbazar-topic-options">
            {topics.map((name) => <option key={name} value={name} />)}
          </datalist>
        </Field>
        <button type="button" className="btn-primary inline-flex h-9 items-center justify-center gap-1.5" disabled={busy || !topic.trim()} onClick={check}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Check
        </button>
      </div>
      {result && (
        <div className={cn("mx-4 mb-3 rounded-lg px-3 py-2 text-sm", result.template ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
          {result.template ? (
            <>
              <span className="font-bold">Sends &ldquo;{result.template.title}&rdquo;</span> · {result.template.activities}
            </>
          ) : (
            <>
              <span className="font-bold">Nothing would be shared.</span> {result.reason}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
