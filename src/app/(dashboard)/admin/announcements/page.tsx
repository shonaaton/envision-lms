"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { BellRing, CheckCircle2, Edit3, GraduationCap, Megaphone, Save, Search, Send, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TargetType = "batch" | "all_students" | "student" | "all_coaches" | "coach";

type UserOption = {
  _id: string;
  name: string;
  email: string;
  username?: string;
  role?: string;
};

type BatchOption = {
  _id: string;
  name: string;
  level?: string;
  students?: string[];
  coach?: UserOption;
};

type Announcement = {
  _id: string;
  title: string;
  message: string;
  priority: "normal" | "high";
  targetType: TargetType;
  targetBatch?: BatchOption;
  targetUser?: UserOption;
  recipientCount: number;
  sentAt: string;
  editedAt?: string;
  editCount?: number;
  createdBy?: UserOption;
  editedBy?: UserOption;
};

const targetOptions: Array<{ type: TargetType; title: string; description: string; icon: LucideIcon; needsPick?: "batch" | "student" | "coach" }> = [
  { type: "batch", title: "Batch", description: "Students in one batch", icon: Users, needsPick: "batch" },
  { type: "all_students", title: "All Students", description: "Every active student", icon: GraduationCap },
  { type: "student", title: "Student", description: "One selected student", icon: CheckCircle2, needsPick: "student" },
  { type: "all_coaches", title: "All Coaches", description: "Every active coach", icon: Sparkles },
  { type: "coach", title: "Coach", description: "One selected coach", icon: BellRing, needsPick: "coach" },
];

const targetLabels: Record<TargetType, string> = {
  batch: "Batch",
  all_students: "All Students",
  student: "Student",
  all_coaches: "All Coaches",
  coach: "Coach",
};

export const dynamic = "force-dynamic";

export default function AdminAnnouncementsPage() {
  const [tab, setTab] = useState<"compose" | "past">("compose");
  const [targetType, setTargetType] = useState<TargetType>("batch");
  const [targetId, setTargetId] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState({ title: "", message: "", priority: "normal" as "normal" | "high" });
  const [targets, setTargets] = useState<{ batches: BatchOption[]; students: UserOption[]; coaches: UserOption[] }>({
    batches: [],
    students: [],
    coaches: [],
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  async function load() {
    setLoading(true);
    const [targetsResponse, announcementsResponse] = await Promise.all([
      fetch("/api/admin/announcements/targets", { cache: "no-store" }),
      fetch("/api/admin/announcements", { cache: "no-store" }),
    ]);
    if (!targetsResponse.ok || !announcementsResponse.ok) {
      toast.error("Could not load announcement data");
      setLoading(false);
      return;
    }
    setTargets(await targetsResponse.json());
    setAnnouncements(await announcementsResponse.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setTargetId("");
    setQuery("");
  }, [targetType]);

  const selectedOption = targetOptions.find((option) => option.type === targetType)!;
  const pickList = useMemo(() => {
    if (selectedOption.needsPick === "batch") return targets.batches;
    if (selectedOption.needsPick === "student") return targets.students;
    if (selectedOption.needsPick === "coach") return targets.coaches;
    return [];
  }, [selectedOption.needsPick, targets]);

  const filteredPickList = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return pickList;
    return pickList.filter((item: any) => [item.name, item.email, item.username, item.level].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [pickList, query]);

  const filteredAnnouncements = useMemo(() => {
    const term = historyQuery.trim().toLowerCase();
    if (!term) return announcements;
    return announcements.filter((item) => [item.title, item.message, formatAudience(item), item.priority].join(" ").toLowerCase().includes(term));
  }, [announcements, historyQuery]);

  const estimatedRecipients = useMemo(() => {
    if (targetType === "all_students") return targets.students.length;
    if (targetType === "all_coaches") return targets.coaches.length;
    if (targetType === "student" || targetType === "coach") return targetId ? 1 : 0;
    const batch = targets.batches.find((item) => item._id === targetId);
    return batch?.students?.length || 0;
  }, [targetId, targetType, targets]);

  const editing = announcements.find((item) => item._id === editingId) || null;

  async function sendAnnouncement() {
    if (!title.trim()) return toast.error("Please add a title");
    if (!message.trim()) return toast.error("Please add a message");
    if (selectedOption.needsPick && !targetId) return toast.error(`Please select a ${selectedOption.needsPick}`);

    setSending(true);
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, targetType, targetId, priority }),
    });
    const data = await response.json();
    setSending(false);
    if (!response.ok) return toast.error(data.error || "Could not send announcement");

    setAnnouncements((current) => [data, ...current]);
    setTitle("");
    setMessage("");
    setPriority("normal");
    setTargetId("");
    setQuery("");
    setTab("past");
    toast.success(`Announcement sent to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}`);
  }

  function startEdit(item: Announcement) {
    setEditingId(item._id);
    setEditDraft({ title: item.title, message: item.message, priority: item.priority });
    setTab("past");
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editDraft.title.trim()) return toast.error("Please add a title");
    if (!editDraft.message.trim()) return toast.error("Please add a message");

    setSaving(true);
    const response = await fetch("/api/admin/announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editDraft }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(data.error || "Could not update announcement");

    setAnnouncements((current) => current.map((item) => (item._id === data._id ? data : item)));
    setEditingId(data._id);
    toast.success("Announcement updated and marked as edited for recipients");
  }

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand/70">
              <Megaphone size={15} /> Administration
            </div>
            <h1 className="mt-1 text-2xl font-black text-brand">Announcements</h1>
            <p className="mt-1 text-sm text-slate-600">Create academy updates, review past messages, and edit announcements with visible timestamps.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Students" value={targets.students.length} />
            <Stat label="Coaches" value={targets.coaches.length} />
            <Stat label="Batches" value={targets.batches.length} />
          </div>
        </div>
        <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-1">
          <TabButton active={tab === "compose"} onClick={() => setTab("compose")}>Compose</TabButton>
          <TabButton active={tab === "past"} onClick={() => setTab("past")}>Past Announcements</TabButton>
        </div>
      </section>

      {tab === "compose" ? (
        <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <div className="text-sm font-black text-slate-950">1. Choose Audience</div>
              <div className="mt-3 grid gap-2">
                {targetOptions.map((option) => {
                  const Icon = option.icon;
                  const active = option.type === targetType;
                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setTargetType(option.type)}
                      className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition", active ? "border-brand bg-brand text-white shadow-sm" : "border-slate-200 bg-slate-50 hover:border-brand/40")}
                    >
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", active ? "bg-white/15 text-accent" : "bg-white text-brand")}>
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black">{option.title}</span>
                        <span className={cn("block text-xs", active ? "text-white/75" : "text-slate-500")}>{option.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedOption.needsPick && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">Select {selectedOption.needsPick}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{filteredPickList.length} available</div>
                    </div>
                    <div className="relative w-40">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none focus:border-brand" />
                    </div>
                  </div>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {filteredPickList.map((item: any) => (
                      <button
                        key={item._id}
                        type="button"
                        onClick={() => setTargetId(item._id)}
                        className={cn("w-full rounded-lg border px-3 py-2 text-left transition", targetId === item._id ? "border-brand bg-brand/10" : "border-slate-200 bg-white hover:border-brand/40")}
                      >
                        <div className="truncate text-sm font-bold text-slate-950">{item.name}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{item.email || item.level || "Batch"}</div>
                        {selectedOption.needsPick === "batch" && <div className="mt-1 text-xs font-semibold text-brand">{item.students?.length || 0} students</div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-950">2. Write Announcement</div>
                  <div className="text-xs text-slate-500">Audience: {targetLabels[targetType]} - Estimated recipients: {estimatedRecipients}</div>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", priority === "high" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
                  {priority === "high" ? "High priority" : "Normal"}
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Title</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Saturday class timing update" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Priority</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as "normal" | "high")} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10">
                    <option value="normal">Normal</option>
                    <option value="high">High priority</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Message</span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the announcement students or coaches should see..." rows={8} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
              </label>

              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-accent/50 bg-accent/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-brand">Ready to send</div>
                  <div className="text-xs text-slate-600">Recipients will get a bell notification and email automation where configured.</div>
                </div>
                <button type="button" onClick={sendAnnouncement} disabled={sending || loading} className="btn-primary h-10">
                  <Send size={16} />
                  {sending ? "Sending..." : "Send Announcement"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-black text-slate-950">Past Announcements</h2>
                <p className="text-xs text-slate-500">Review and edit previous academy messages separately from creation.</p>
              </div>
              <div className="relative w-full lg:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search announcements" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-brand" />
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {loading && <div className="p-5 text-sm text-slate-500">Loading announcements...</div>}
              {!loading && filteredAnnouncements.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No announcements match this search.</div>}
              {filteredAnnouncements.map((item) => (
                <article key={item._id} className={cn("p-4 transition hover:bg-slate-50/80", editingId === item._id && "bg-brand/[0.03]")}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-slate-950">{item.title}</h3>
                        <PriorityPill priority={item.priority} />
                        {item.editedAt && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Edited {formatShortDate(item.editedAt)}</span>}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-brand/10 px-2.5 py-1 font-bold text-brand">{formatAudience(item)}</span>
                        <span>{item.recipientCount} recipient{item.recipientCount === 1 ? "" : "s"}</span>
                        <span>Sent {formatShortDate(item.sentAt)}</span>
                        {item.editedBy?.name && <span>Edited by {item.editedBy.name}</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => startEdit(item)} className="btn-outline h-10 shrink-0">
                      <Edit3 size={15} /> Edit
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
            {editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-brand">Edit Announcement</h2>
                    <p className="mt-1 text-xs text-slate-500">Audience stays locked. Recipients see the edited label and timestamp.</p>
                  </div>
                  <PriorityPill priority={editDraft.priority} />
                </div>

                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                  <div><span className="font-bold text-slate-800">Audience:</span> {formatAudience(editing)}</div>
                  <div className="mt-1"><span className="font-bold text-slate-800">Sent:</span> {formatShortDate(editing.sentAt)}</div>
                  {editing.editedAt && <div className="mt-1"><span className="font-bold text-slate-800">Last edited:</span> {formatShortDate(editing.editedAt)}</div>}
                </div>

                <label className="mt-4 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Title</span>
                  <input value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
                </label>
                <label className="mt-3 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Priority</span>
                  <select value={editDraft.priority} onChange={(event) => setEditDraft((current) => ({ ...current, priority: event.target.value as "normal" | "high" }))} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10">
                    <option value="normal">Normal</option>
                    <option value="high">High priority</option>
                  </select>
                </label>
                <label className="mt-3 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Message</span>
                  <textarea value={editDraft.message} onChange={(event) => setEditDraft((current) => ({ ...current, message: event.target.value }))} rows={9} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
                </label>
                <button type="button" onClick={saveEdit} disabled={saving} className="btn-primary mt-4 h-10 w-full">
                  <Save size={15} /> {saving ? "Saving..." : "Save Edit"}
                </button>
              </>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <Edit3 size={22} className="text-brand" />
                <h2 className="mt-3 text-sm font-black text-slate-950">Select an announcement to edit</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose Edit from the past announcements list. The edited timestamp will be visible here and in recipient notifications.</p>
              </div>
            )}
          </aside>
        </section>
      )}
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

function PriorityPill({ priority }: { priority: "normal" | "high" }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", priority === "high" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
      {priority === "high" ? "High" : "Normal"}
    </span>
  );
}

function formatShortDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatAudience(item: Announcement) {
  if (item.targetType === "batch") return item.targetBatch?.name || "Batch";
  if (item.targetType === "student" || item.targetType === "coach") return item.targetUser?.name || targetLabels[item.targetType];
  return targetLabels[item.targetType];
}
