"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Archive, BookOpen, CheckCircle2, GraduationCap, MessageCircle, Pause, Play, Search, Send, Sparkles, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PopupCard } from "@/components/popups/LoginPopup";
import { academyDateTimeLocalInput, parseAcademyDateTimeLocal } from "@/lib/academyTime";
import { cn } from "@/lib/utils";

type Audience = "all_students" | "batch" | "course" | "student" | "demo_students";
type PickItem = { _id: string; name: string; detail?: string };
type Targets = { batches: PickItem[]; courses: PickItem[]; students: PickItem[] };
type PopupRow = {
  _id: string;
  title: string;
  body: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  audience: Audience;
  targetIds?: string[];
  targetLabel?: string;
  startsAt: string;
  endsAt?: string | null;
  priority: "high" | "normal";
  status: "draft" | "active" | "archived";
  createdByName?: string;
  createdAt: string;
  stats: { seen: number; clicked: number; dismissed: number };
};
type Overview = {
  enabled: boolean;
  sendHour: number;
  weeks: Array<{ weekKey: string; digest: number; nudge: number; sent: number; failed: number; pending: number }>;
  optOuts: { total: number; byStop: number; byAdmin: number };
  recent: Array<{ _id: string; weekKey: string; student: { _id: string; name: string } | null; kind: "digest" | "nudge"; status: string; error: string; sentAt: string | null }>;
  quiet: Array<{ _id: string; name: string; lastSeenAt: string }>;
  quietCount: number;
  neverSeenCount: number;
};

const audienceOptions: Array<{ type: Audience; title: string; description: string; icon: LucideIcon; pick?: keyof Targets }> = [
  { type: "all_students", title: "All students", description: "Every enrolled student", icon: GraduationCap },
  { type: "batch", title: "Batches", description: "Students in chosen batches", icon: Users, pick: "batches" },
  { type: "course", title: "Courses", description: "Students in chosen courses", icon: BookOpen, pick: "courses" },
  { type: "student", title: "Students", description: "Chosen students only", icon: CheckCircle2, pick: "students" },
  { type: "demo_students", title: "Demo students", description: "Families trying a demo", icon: UserPlus },
];

const audienceLabels: Record<Audience, string> = {
  all_students: "All students",
  batch: "Batches",
  course: "Courses",
  student: "Students",
  demo_students: "Demo students",
};

const emptyTargets: Targets = { batches: [], courses: [], students: [] };

/** /admin/popups: write pop-ups students see on opening the portal, and watch the weekly WhatsApp. */
export default function PopupsClient() {
  const [tab, setTab] = useState<"compose" | "popups" | "whatsapp">("compose");
  const [popups, setPopups] = useState<PopupRow[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/popups", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return toast.error(data.error || "Could not load pop-ups");
    setPopups(data.popups || []);
    setTargets(data.targets || emptyTargets);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const live = popups.filter((popup) => popup.status === "active").length;

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand/70">
              <Sparkles size={15} /> Communications
            </div>
            <h1 className="mt-1 text-2xl font-black text-brand">Pop-ups &amp; Engagement</h1>
            <p className="mt-1 text-sm text-slate-600">
              Pop-ups appear once when a student opens the portal. Personal ones (report ready, new badge, homework due, last week&apos;s recap) are added automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Live pop-ups" value={live} />
            <Stat label="All pop-ups" value={popups.length} />
          </div>
        </div>
        <div className="mt-4 inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
          <TabButton active={tab === "compose"} onClick={() => setTab("compose")}>New pop-up</TabButton>
          <TabButton active={tab === "popups"} onClick={() => setTab("popups")}>Pop-ups</TabButton>
          <TabButton active={tab === "whatsapp"} onClick={() => setTab("whatsapp")}>Weekly WhatsApp</TabButton>
        </div>
      </section>

      {tab === "compose" && (
        <ComposePanel
          targets={targets}
          loading={loading}
          onCreated={(popup) => {
            setPopups((current) => [popup, ...current]);
            setTab("popups");
          }}
        />
      )}
      {tab === "popups" && <PopupList popups={popups} loading={loading} onChanged={(popup) => setPopups((current) => current.map((item) => (item._id === popup._id ? { ...popup, stats: item.stats } : item)))} />}
      {tab === "whatsapp" && <WhatsAppPanel />}
    </div>
  );
}

function ComposePanel({ targets, loading, onCreated }: { targets: Targets; loading: boolean; onCreated: (popup: PopupRow) => void }) {
  const [audience, setAudience] = useState<Audience>("all_students");
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [startsAt, setStartsAt] = useState(() => academyDateTimeLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  const option = audienceOptions.find((item) => item.type === audience) || audienceOptions[0];
  const pickList = useMemo(() => (option.pick ? targets[option.pick] : []), [option.pick, targets]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pickList.filter((item) => !needle || `${item.name} ${item.detail || ""}`.toLowerCase().includes(needle)).slice(0, 200);
  }, [pickList, query]);

  function chooseAudience(next: Audience) {
    setAudience(next);
    setPicked([]);
    setQuery("");
  }

  function togglePick(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function create() {
    setSaving(true);
    const names = pickList.filter((item) => picked.includes(item._id)).map((item) => item.name);
    const start = parseAcademyDateTimeLocal(startsAt);
    const end = endsAt ? parseAcademyDateTimeLocal(endsAt) : null;
    const response = await fetch("/api/admin/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        imageUrl,
        ctaLabel,
        ctaHref,
        priority,
        audience,
        targetIds: picked,
        targetLabel: names.join(", "),
        startsAt: start ? start.toISOString() : undefined,
        endsAt: end ? end.toISOString() : null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not create the pop-up");
    toast.success("Pop-up is live for the chosen students");
    setTitle("");
    setBody("");
    setImageUrl("");
    setCtaLabel("");
    setCtaHref("");
    setPicked([]);
    onCreated(data);
  }

  const inputClass = "mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";

  return (
    <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <div>
          <div className="text-sm font-black text-slate-950">1. Who sees it</div>
          <div className="mt-3 grid gap-2">
            {audienceOptions.map((item) => {
              const Icon = item.icon;
              const active = item.type === audience;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => chooseAudience(item.type)}
                  className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition", active ? "border-brand bg-brand text-white shadow-sm" : "border-slate-200 bg-slate-50 hover:border-brand/40")}
                >
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", active ? "bg-white/15 text-accent" : "bg-white text-brand")}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{item.title}</span>
                    <span className={cn("block text-xs", active ? "text-white/75" : "text-slate-500")}>{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {option.pick && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">{picked.length} chosen</div>
                <div className="relative w-40">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none focus:border-brand" />
                </div>
              </div>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {loading && <div className="text-xs text-slate-500">Loading...</div>}
                {filtered.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => togglePick(item._id)}
                    className={cn("w-full rounded-lg border px-3 py-2 text-left transition", picked.includes(item._id) ? "border-brand bg-brand/10" : "border-slate-200 bg-white hover:border-brand/40")}
                  >
                    <div className="truncate text-sm font-bold text-slate-950">{item.name}</div>
                    {item.detail && <div className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</div>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-black text-slate-950">2. Write it</div>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_170px]">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Title</span>
                <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Inter-academy tournament on 15 Nov" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Priority</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value as "normal" | "high")} className={inputClass}>
                  <option value="normal">Normal</option>
                  <option value="high">High - shown first</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Message</span>
              <textarea value={body} maxLength={1200} onChange={(event) => setBody(event.target.value)} rows={6} placeholder="What should students and parents know?" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Image link (optional)</span>
              <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Button text (optional)</span>
                <input value={ctaLabel} maxLength={40} onChange={(event) => setCtaLabel(event.target.value)} placeholder="e.g. Register now" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Button link</span>
                <input value={ctaHref} onChange={(event) => setCtaHref(event.target.value)} placeholder="/tournaments or https://..." className={inputClass} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Show from (IST)</span>
                <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Stop showing (optional)</span>
                <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={inputClass} />
              </label>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-accent/50 bg-accent/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-600">
                Each student sees it once, the next time they open the dashboard. It stops appearing for them once they close it or press the button.
              </div>
              <button type="button" onClick={create} disabled={saving || loading} className="btn-primary h-10 shrink-0">
                <Send size={16} />
                {saving ? "Publishing..." : "Publish pop-up"}
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-sm font-black text-slate-950">Preview</div>
          <div className="mt-3 flex justify-center rounded-lg bg-slate-950/40 p-4">
            <PopupCard popup={{ key: "preview", kind: priority === "high" ? "campaign_high" : "campaign", title, body, imageUrl: /^https:\/\//i.test(imageUrl) ? imageUrl : "", ctaLabel, ctaHref }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PopupList({ popups, loading, onChanged }: { popups: PopupRow[]; loading: boolean; onChanged: (popup: PopupRow) => void }) {
  const [busy, setBusy] = useState("");

  async function setStatus(popup: PopupRow, status: PopupRow["status"]) {
    setBusy(popup._id);
    const response = await fetch(`/api/admin/popups/${popup._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) return toast.error(data.error || "Could not update the pop-up");
    onChanged(data);
    toast.success(status === "active" ? "Pop-up is live again" : status === "draft" ? "Pop-up paused" : "Pop-up archived");
  }

  if (loading) return <section className="rounded-lg border border-brand/10 bg-white p-5 text-sm text-slate-500 shadow-sm">Loading pop-ups...</section>;
  if (!popups.length) return <section className="rounded-lg border border-brand/10 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">No pop-ups yet.</section>;
  return (
    <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {popups.map((popup) => {
          const ended = popup.endsAt && new Date(popup.endsAt) <= new Date();
          const state = popup.status === "archived" ? "Archived" : popup.status === "draft" ? "Paused" : ended ? "Ended" : new Date(popup.startsAt) > new Date() ? "Scheduled" : "Live";
          return (
            <div key={popup._id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-black text-slate-950">{popup.title}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", state === "Live" ? "bg-emerald-100 text-emerald-700" : state === "Scheduled" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600")}>{state}</span>
                  {popup.priority === "high" && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">High</span>}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-slate-600">{popup.body}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {audienceLabels[popup.audience]}{popup.targetLabel ? `: ${popup.targetLabel}` : ""} - from {formatDate(popup.startsAt)}{popup.endsAt ? ` to ${formatDate(popup.endsAt)}` : ""}{popup.createdByName ? ` - by ${popup.createdByName}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <MiniStat label="Seen" value={popup.stats.seen} />
                <MiniStat label="Clicked" value={popup.stats.clicked} />
                <MiniStat label="Closed" value={popup.stats.dismissed} />
                {popup.status === "active" ? (
                  <button type="button" disabled={busy === popup._id} onClick={() => setStatus(popup, "draft")} className="btn h-9 border border-slate-200 bg-white text-xs">
                    <Pause size={14} /> Pause
                  </button>
                ) : (
                  <button type="button" disabled={busy === popup._id} onClick={() => setStatus(popup, "active")} className="btn h-9 border border-slate-200 bg-white text-xs">
                    <Play size={14} /> Make live
                  </button>
                )}
                {popup.status !== "archived" && (
                  <button type="button" disabled={busy === popup._id} onClick={() => setStatus(popup, "archived")} className="btn h-9 border border-slate-200 bg-white text-xs">
                    <Archive size={14} /> Archive
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WhatsAppPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/popups?view=engagement", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load the weekly WhatsApp overview");
        setOverview(data);
      })
      .catch((reason) => setError(reason.message));
  }, []);

  if (error) return <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</section>;
  if (!overview) return <section className="rounded-lg border border-brand/10 bg-white p-5 text-sm text-slate-500 shadow-sm">Loading...</section>;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <MessageCircle size={16} className="text-brand" /> Weekly progress WhatsApp
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              Every Sunday from {String(overview.sendHour).padStart(2, "0")}:00 IST each family gets one message: a progress digest, or a practice nudge when the child has not practised or opened the portal for 7 days (never two nudges in a row). Families can reply STOP; class and fee messages are not affected.
            </p>
          </div>
          <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-bold", overview.enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800")}>
            {overview.enabled ? "Sending is on" : "Sending is off - waiting for Meta template approval"}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pr-3">Week of</th><th className="py-2 pr-3">Digests</th><th className="py-2 pr-3">Nudges</th><th className="py-2 pr-3">Delivered</th><th className="py-2 pr-3">Failed</th><th className="py-2">Waiting</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overview.weeks.map((week) => (
                <tr key={week.weekKey}>
                  <td className="py-2 pr-3 font-semibold">{formatDay(week.weekKey)}</td>
                  <td className="py-2 pr-3">{week.digest}</td>
                  <td className="py-2 pr-3">{week.nudge}</td>
                  <td className="py-2 pr-3 text-emerald-700">{week.sent}</td>
                  <td className={cn("py-2 pr-3", week.failed ? "text-red-700" : "")}>{week.failed}</td>
                  <td className="py-2">{week.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
          <div className="text-sm font-black text-slate-950">Opted out</div>
          <div className="mt-2 text-3xl font-black text-brand">{overview.optOuts.total}</div>
          <div className="mt-1 text-xs text-slate-600">{overview.optOuts.byStop} replied STOP - {overview.optOuts.byAdmin} switched off by an admin. Change it per student in User Management.</div>
        </section>
        <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="text-sm font-black text-slate-950">Not opening the portal</div>
          <div className="mt-1 text-xs text-slate-600">
            {overview.quietCount} active students have not opened the portal for 14+ days. {overview.neverSeenCount} have no visit recorded yet (visits are tracked from this release on).
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {overview.quiet.map((student) => (
              <span key={student._id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700" title={`Last seen ${formatDate(student.lastSeenAt)}`}>
                {student.name} - {formatDate(student.lastSeenAt)}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-black text-slate-950">Latest messages</div>
        {overview.recent.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">Nothing sent yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {overview.recent.map((row) => (
              <div key={row._id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="font-semibold">{row.student?.name || "Student"}</span>
                  <span className="ml-2 text-xs text-slate-500">{row.kind === "nudge" ? "Practice nudge" : "Digest"} - week of {formatDay(row.weekKey)}</span>
                  {row.error && row.status !== "sent" && <div className="truncate text-xs text-red-600">{row.error}</div>}
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", row.status === "sent" ? "bg-emerald-100 text-emerald-700" : row.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
                  {row.status === "template_pending" ? "Waiting for Meta" : row.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("h-9 rounded-md px-4 text-sm font-bold transition", active ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-brand")}>
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-brand">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-16 rounded-lg bg-slate-50 px-2.5 py-1 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function formatDay(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
