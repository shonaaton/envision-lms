"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, GraduationCap, Megaphone, Search, Send, Sparkles, Users } from "lucide-react";
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
  createdBy?: UserOption;
};

const targetOptions: Array<{ type: TargetType; title: string; description: string; icon: any; needsPick?: "batch" | "student" | "coach" }> = [
  { type: "batch", title: "Particular Batch", description: "Send to all active students inside one batch.", icon: Users, needsPick: "batch" },
  { type: "all_students", title: "All Students", description: "Broadcast to every active student.", icon: GraduationCap },
  { type: "student", title: "Particular Student", description: "Send privately to one student.", icon: CheckCircle2, needsPick: "student" },
  { type: "all_coaches", title: "All Coaches", description: "Broadcast to every active coach.", icon: Sparkles },
  { type: "coach", title: "Particular Coach", description: "Send privately to one coach.", icon: BellRing, needsPick: "coach" },
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
  const [targetType, setTargetType] = useState<TargetType>("batch");
  const [targetId, setTargetId] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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
    return pickList.filter((item: any) => [item.name, item.email, item.username, item.level].filter(Boolean).some((value) => value.toLowerCase().includes(term)));
  }, [pickList, query]);

  const estimatedRecipients = useMemo(() => {
    if (targetType === "all_students") return targets.students.length;
    if (targetType === "all_coaches") return targets.coaches.length;
    if (targetType === "student" || targetType === "coach") return targetId ? 1 : 0;
    const batch = targets.batches.find((item) => item._id === targetId);
    return batch?.students?.length || 0;
  }, [targetId, targetType, targets]);

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
    toast.success(`Announcement sent to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}`);
  }

  return (
    <div className="min-h-screen text-slate-950">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <Megaphone size={14} />
            Administration
          </div>
          <h1 className="mt-3 text-3xl font-black text-brand">Announcements</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Send academy updates to batches, all students, coaches, or selected individuals.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-brand/10 bg-white p-3 shadow-xl shadow-brand/10">
          <Stat label="Students" value={targets.students.length} />
          <Stat label="Coaches" value={targets.coaches.length} />
          <Stat label="Batches" value={targets.batches.length} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-3xl border border-brand/10 bg-white p-5 shadow-2xl shadow-brand/10">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-brand">Create Announcement</h2>
              <p className="text-sm text-slate-500">Choose the audience first, then write the update.</p>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-bold", priority === "high" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
              {priority === "high" ? "High priority" : "Normal"}
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            {targetOptions.map((option) => {
              const Icon = option.icon;
              const active = option.type === targetType;
              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => setTargetType(option.type)}
                  className={cn("rounded-2xl border p-4 text-left transition", active ? "border-brand bg-brand text-white shadow-lg shadow-brand/25" : "border-slate-200 bg-white hover:border-brand/30 hover:shadow-md")}
                >
                  <Icon size={18} className={active ? "text-accent" : "text-brand"} />
                  <div className="mt-3 text-sm font-black">{option.title}</div>
                  <div className={cn("mt-1 text-xs leading-relaxed", active ? "text-white/75" : "text-slate-500")}>{option.description}</div>
                </button>
              );
            })}
          </div>

          {selectedOption.needsPick && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-950">Select {selectedOption.needsPick}</div>
                  <div className="text-xs text-slate-500">{filteredPickList.length} option{filteredPickList.length === 1 ? "" : "s"} available</div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand sm:w-72" />
                </div>
              </div>
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {filteredPickList.map((item: any) => (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setTargetId(item._id)}
                    className={cn("rounded-xl border p-3 text-left transition", targetId === item._id ? "border-brand bg-brand/10 shadow-sm" : "border-slate-200 bg-white hover:border-brand/40")}
                  >
                    <div className="font-bold text-slate-950">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.email || item.level || "Batch"}</div>
                    {selectedOption.needsPick === "batch" && <div className="mt-2 text-xs font-semibold text-brand">{item.students?.length || 0} students</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px]">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Saturday class timing update" className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as "normal" | "high")} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10">
                <option value="normal">Normal</option>
                <option value="high">High priority</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-bold text-slate-700">Message</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the announcement students or coaches should see..." rows={7} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10" />
          </label>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-accent/50 bg-accent/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-brand">Ready to send</div>
              <div className="text-xs text-slate-600">
                Audience: {targetLabels[targetType]} · Estimated recipients: {estimatedRecipients}
              </div>
            </div>
            <button type="button" onClick={sendAnnouncement} disabled={sending || loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60">
              <Send size={16} />
              {sending ? "Sending..." : "Send Announcement"}
            </button>
          </div>
        </section>

        <aside className="rounded-3xl border border-brand/10 bg-white p-5 shadow-2xl shadow-brand/10">
          <h2 className="text-xl font-black text-brand">Recent Announcements</h2>
          <p className="mt-1 text-sm text-slate-500">Last 100 messages sent by the academy.</p>
          <div className="mt-5 space-y-3">
            {loading && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading announcements...</div>}
            {!loading && announcements.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">No announcements sent yet.</div>}
            {announcements.map((item) => (
              <div key={item._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{item.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm text-slate-500">{item.message}</div>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-bold", item.priority === "high" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>{item.priority}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-brand/10 px-2 py-1 font-bold text-brand">{formatAudience(item)}</span>
                  <span>{item.recipientCount} recipient{item.recipientCount === 1 ? "" : "s"}</span>
                  <span>{new Date(item.sentAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-brand">{value}</div>
    </div>
  );
}

function formatAudience(item: Announcement) {
  if (item.targetType === "batch") return item.targetBatch?.name || "Batch";
  if (item.targetType === "student" || item.targetType === "coach") return item.targetUser?.name || targetLabels[item.targetType];
  return targetLabels[item.targetType];
}
