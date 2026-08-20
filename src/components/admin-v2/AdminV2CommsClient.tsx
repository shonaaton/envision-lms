"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Filter, Megaphone, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { AdminV2Card, AdminV2Stat } from "./AdminV2Primitives";
import { cn } from "@/lib/utils";

type TargetOption = {
  key: string;
  label: string;
  targetType: "batch" | "all_students" | "student" | "all_coaches" | "coach";
  targetId?: string;
  count: number;
};
type Announcement = {
  _id: string;
  title: string;
  message: string;
  priority: "normal" | "high";
  recipientCount: number;
  sentAt: string;
  editedAt?: string;
  targetBatch?: { name?: string };
  targetUser?: { name?: string; role?: string };
  targetType: string;
};
type ActivityLog = {
  _id: string;
  type: string;
  label: string;
  occurredAt: string;
  entityType?: string;
  metadata?: Record<string, any>;
  actor?: { name?: string; role?: string; email?: string };
  targetUser?: { name?: string; role?: string; email?: string };
};

function groupLabel(type: string) {
  if (type.includes("tournament")) return "Tournament";
  if (type.includes("invoice") || type.includes("fee") || type.includes("credit") || type.includes("payment")) return "Fees";
  if (type.includes("homework")) return "Homework";
  if (type.includes("attendance")) return "Attendance";
  if (type.includes("booking")) return "Bookings";
  if (type.includes("user") || type.includes("batch")) return "Directory";
  return "General";
}

export default function AdminV2CommsClient() {
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<TargetOption[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [targetToAdd, setTargetToAdd] = useState("");
  const [filters, setFilters] = useState({ q: "", role: "", typeGroup: "", tournamentMode: "hide_internal", from: "", to: "" });
  const [loading, setLoading] = useState(true);

  async function loadTargetsAndAnnouncements() {
    const [targetResponse, announcementResponse] = await Promise.all([
      fetch("/api/admin/announcements/targets", { cache: "no-store" }),
      fetch("/api/admin/announcements", { cache: "no-store" }),
    ]);
    const targetData = await targetResponse.json().catch(() => ({}));
    const announcementData = await announcementResponse.json().catch(() => []);
    if (targetResponse.ok) {
      const nextTargets: TargetOption[] = [
        { key: "all_students", label: "All Students", targetType: "all_students", count: targetData.students?.length || 0 },
        { key: "all_coaches", label: "All Coaches", targetType: "all_coaches", count: targetData.coaches?.length || 0 },
        ...(targetData.batches || []).map((batch: any) => ({ key: `batch:${batch._id}`, label: `Batch: ${batch.name}`, targetType: "batch" as const, targetId: batch._id, count: batch.students?.length || 0 })),
        ...(targetData.students || []).map((student: any) => ({ key: `student:${student._id}`, label: `Student: ${student.name}`, targetType: "student" as const, targetId: student._id, count: 1 })),
        ...(targetData.coaches || []).map((coach: any) => ({ key: `coach:${coach._id}`, label: `Coach: ${coach.name}`, targetType: "coach" as const, targetId: coach._id, count: 1 })),
      ];
      setTargets(nextTargets);
    }
    if (announcementResponse.ok) setAnnouncements(announcementData);
  }

  async function loadLogs() {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    const response = await fetch(`/api/admin-v2/activity?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => []);
    if (response.ok) setLogs(data);
    else toast.error("Could not load activity logs");
  }

  async function load() {
    setLoading(true);
    await Promise.all([loadTargetsAndAnnouncements(), loadLogs()]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estimatedRecipients = selectedTargets.reduce((sum, item) => sum + item.count, 0);

  const filteredLogs = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return logs.filter((log) => {
      const group = groupLabel(log.type);
      const actorRole = log.actor?.role || log.targetUser?.role || "";
      const haystack = [log.label, log.type, log.actor?.name, log.actor?.email, log.targetUser?.name, log.metadata?.courseName, log.metadata?.batchName, log.metadata?.tournamentName].filter(Boolean).join(" ").toLowerCase();
      const internalTournament = group === "Tournament" && /monthly|internal/i.test([log.label, log.metadata?.tournamentName, log.metadata?.source].filter(Boolean).join(" "));
      if (q && !haystack.includes(q)) return false;
      if (filters.role && actorRole !== filters.role) return false;
      if (filters.typeGroup && group !== filters.typeGroup) return false;
      if (filters.tournamentMode === "hide_internal" && internalTournament) return false;
      if (filters.tournamentMode === "only_tournaments" && group !== "Tournament") return false;
      return true;
    });
  }, [filters, logs]);

  function addTarget() {
    const target = targets.find((item) => item.key === targetToAdd);
    if (!target || selectedTargets.some((item) => item.key === target.key)) return;
    setSelectedTargets((current) => [...current, target]);
    setTargetToAdd("");
  }

  async function send() {
    if (!title.trim() || !message.trim()) return toast.error("Title and message are required");
    if (!selectedTargets.length) return toast.error("Select at least one recipient target");
    for (const target of selectedTargets) {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, priority, targetType: target.targetType, targetId: target.targetId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(data.error || `Could not send to ${target.label}`);
    }
    toast.success("Announcement broadcast sent");
    setTitle("");
    setMessage("");
    setPriority("normal");
    setSelectedTargets([]);
    await loadTargetsAndAnnouncements();
  }

  const exportParams = new URLSearchParams();
  if (filters.q) exportParams.set("q", filters.q);
  if (filters.role) exportParams.set("userType", filters.role);
  if (filters.from) exportParams.set("from", filters.from);
  if (filters.to) exportParams.set("to", filters.to);

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <AdminV2Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">Broadcast</div>
              <h2 className="mt-1 text-2xl font-black text-brand">Announcements</h2>
            </div>
            <AdminV2Stat label="Reach" value={estimatedRecipients} tone="accent" />
          </div>
          <div className="mt-5 grid gap-3">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Announcement title" />
            <textarea className="input min-h-36" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message" />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <select className="input h-11" value={targetToAdd} onChange={(event) => setTargetToAdd(event.target.value)}>
                <option value="">Choose recipient target</option>
                {targets.map((target) => <option key={target.key} value={target.key}>{target.label} ({target.count})</option>)}
              </select>
              <button className="btn-outline h-11" onClick={addTarget}><Plus size={16} /> Add Target</button>
              <select className="input h-11" value={priority} onChange={(event) => setPriority(event.target.value as "normal" | "high")}>
                <option value="normal">Standard</option>
                <option value="high">High Priority</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTargets.map((target) => (
                <button key={target.key} onClick={() => setSelectedTargets((current) => current.filter((item) => item.key !== target.key))} className="inline-flex items-center gap-2 rounded-full bg-brand/5 px-3 py-1.5 text-xs font-black text-brand">
                  {target.label}<X size={13} />
                </button>
              ))}
              {!selectedTargets.length ? <span className="text-sm text-slate-500">No targets selected.</span> : null}
            </div>
            <button className="btn-primary justify-self-start" onClick={() => void send()}><Send size={16} /> Send Broadcast</button>
          </div>
        </AdminV2Card>

        <AdminV2Card>
          <div className="flex items-center gap-2 text-lg font-black text-brand"><Megaphone size={18} /> History</div>
          <div className="mt-4 divide-y divide-slate-100">
            {announcements.slice(0, 12).map((item) => (
              <details key={item._id} className="group py-3">
                <summary className="cursor-pointer list-none font-black text-slate-950">{item.title}</summary>
                <div className="mt-2 text-sm leading-6 text-slate-600">{item.message}</div>
                <div className="mt-2 text-xs font-semibold text-slate-500">
                  {item.recipientCount} recipients - {new Date(item.sentAt).toLocaleString("en-IN")}
                  {item.editedAt ? ` - Edited ${new Date(item.editedAt).toLocaleString("en-IN")}` : ""}
                </div>
              </details>
            ))}
            {!announcements.length && !loading ? <div className="py-6 text-sm text-slate-500">No announcements yet.</div> : null}
          </div>
        </AdminV2Card>
      </div>

      <AdminV2Card className="min-h-[720px]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">Audit</div>
            <h2 className="mt-1 text-2xl font-black text-brand">Activity Timeline</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-outline h-10" href={`/api/admin/activity-tracker/export?${new URLSearchParams({ ...Object.fromEntries(exportParams), format: "csv" }).toString()}`}><Download size={16} /> CSV</a>
            <a className="btn-outline h-10" href={`/api/admin/activity-tracker/export?${new URLSearchParams({ ...Object.fromEntries(exportParams), format: "xls" }).toString()}`}><Download size={16} /> Excel</a>
          </div>
        </div>
        <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <input className="input h-10" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search logs" />
          <select className="input h-10" value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}>
            <option value="">All roles</option>
            <option value="student">Student</option>
            <option value="instructor">Coach</option>
            <option value="admin">Admin</option>
            <option value="sub-admin">Sub-admin</option>
          </select>
          <select className="input h-10" value={filters.typeGroup} onChange={(event) => setFilters((current) => ({ ...current, typeGroup: event.target.value }))}>
            <option value="">All activity</option>
            {["Fees", "Homework", "Attendance", "Tournament", "Bookings", "Directory", "General"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="input h-10" value={filters.tournamentMode} onChange={(event) => setFilters((current) => ({ ...current, tournamentMode: event.target.value }))}>
            <option value="hide_internal">Hide internal monthly tournament noise</option>
            <option value="show_all">Show all logs</option>
            <option value="only_tournaments">Only tournaments</option>
          </select>
          <input className="input h-10" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          <div className="flex gap-2">
            <input className="input h-10" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
            <button className="btn-outline h-10" onClick={() => void loadLogs()}><Filter size={16} /></button>
          </div>
        </div>

        <div className="mt-5 max-h-[760px] space-y-3 overflow-y-auto pr-2">
          {filteredLogs.map((log) => (
            <article key={log._id} className={cn("relative rounded-2xl border bg-white p-4 shadow-sm", groupLabel(log.type) === "Tournament" ? "border-accent/70" : "border-slate-200")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand/5 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-brand">{groupLabel(log.type)}</span>
                <span className="text-xs font-semibold text-slate-500">{new Date(log.occurredAt).toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-2 font-black text-slate-950">{log.label}</div>
              <div className="mt-1 text-sm text-slate-500">{log.actor?.name || log.targetUser?.name || "System"} - {log.type}</div>
              {log.metadata ? <div className="mt-2 line-clamp-2 text-xs text-slate-500">{Object.entries(log.metadata).slice(0, 5).map(([key, value]) => `${key}: ${String(value)}`).join(" - ")}</div> : null}
            </article>
          ))}
          {!filteredLogs.length && !loading ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No logs match these filters.</div> : null}
          {loading ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Loading logs...</div> : null}
        </div>
      </AdminV2Card>
    </div>
  );
}

