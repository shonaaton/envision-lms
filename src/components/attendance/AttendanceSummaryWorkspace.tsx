"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BellRing, CalendarDays, CheckCircle2, Clock3, Mail, RefreshCw, UserCheck } from "lucide-react";
import { toast } from "sonner";
import PageLoadingOverlay from "@/components/feedback/PageLoadingOverlay";

type Role = "student" | "instructor" | "admin" | "sub-admin";
type SummaryKind = "completed" | "missed" | "pending" | "marked";
type SessionRow = {
  id: string;
  classroomId: string;
  sessionId: string;
  title: string;
  topicName: string;
  courseName: string;
  levelName: string;
  batchNames: string[];
  coachName: string;
  coachEmail?: string;
  scheduledFor: string;
  startTime: string;
  durationMinutes: number;
  status: string;
  attendanceState: "marked" | "missed";
  coachStatus: string;
  studentRecords: number;
  markedAt?: string | null;
};

function formatDateTime(value?: string | Date | null, startTime?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  const dateText = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
  return startTime ? `${dateText}, ${startTime}` : dateText;
}

function formatDuration(minutes: number) {
  if (!minutes) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function prettyStatus(value: string) {
  return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function summaryIcon(kind: SummaryKind) {
  if (kind === "completed") return <CalendarDays size={16} />;
  if (kind === "pending") return <Clock3 size={16} />;
  if (kind === "marked") return <CheckCircle2 size={16} />;
  return <BellRing size={16} />;
}

export default function AttendanceSummaryWorkspace({ role, kind }: { role: Role; kind: SummaryKind }) {
  const canAccess = role === "admin" || role === "sub-admin";
  const canSendReminder = canAccess && kind === "missed";
  const [data, setData] = useState<{ title?: string; description?: string; sessions: SessionRow[] } | null>(null);
  const [busyMessage, setBusyMessage] = useState("");
  const [sendingId, setSendingId] = useState("");

  const sessions = data?.sessions || [];
  const coaches = useMemo(() => new Set(sessions.map((session) => session.coachName)).size, [sessions]);

  async function load() {
    setBusyMessage("Loading attendance summary...");
    try {
      const currentParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const params = new URLSearchParams({ kind });
      const date = currentParams.get("date");
      if (date) params.set("date", date);
      const response = await fetch(`/api/attendance/summary?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload?.error || "Attendance summary could not be loaded");
        setData({ sessions: [] });
        return;
      }
      setData(payload);
    } finally {
      setBusyMessage("");
    }
  }

  async function sendReminder(session: SessionRow) {
    setSendingId(session.id);
    try {
      const response = await fetch("/api/attendance/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: session.classroomId,
          sessionId: session.sessionId,
          sessionDate: session.scheduledFor,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload?.error || "Reminder could not be sent");
        return;
      }
      toast.success(payload?.emailDelivered ? "Reminder sent by email and notification" : "Reminder sent as an in-app notification");
    } finally {
      setSendingId("");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  if (!canAccess) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        This page is available for admin and sub-admin accounts.
      </div>
    );
  }

  return (
    <div className="space-y-4 text-slate-950 sm:space-y-6">
      <PageLoadingOverlay visible={!!busyMessage} message={busyMessage} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/attendance" className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-brand">
            <ArrowLeft size={16} /> Attendance
          </Link>
          <h1 className="font-display text-2xl text-brand sm:text-3xl">{data?.title || prettyStatus(kind)}</h1>
          <p className="mt-1 text-sm text-slate-500">{data?.description || "Review attendance sessions."}</p>
        </div>
        <button type="button" onClick={load} className="btn-outline h-11 justify-center">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Sessions" value={sessions.length} icon={summaryIcon(kind)} />
        <SummaryCard label="Coaches" value={coaches} icon={<UserCheck size={16} />} />
        <SummaryCard label={kind === "marked" ? "Student Records" : "Can Email"} value={kind === "marked" ? sessions.reduce((sum, session) => sum + Number(session.studentRecords || 0), 0) : sessions.filter((session) => session.coachEmail).length} icon={<Mail size={16} />} />
      </div>

      <section className="rounded-lg border border-brand/10 bg-white p-3 shadow-[0_18px_45px_rgba(90,19,114,0.08)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">{data?.title || "Attendance Sessions"}</h2>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-black uppercase text-brand">{sessions.length} total</span>
        </div>
        <div className="space-y-3">
          {sessions.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              No sessions found here.
            </div>
          )}
          {sessions.map((session) => (
            <div key={session.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="font-black text-slate-950">{session.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{session.topicName} - {session.courseName} - {session.levelName}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoTile label="Coach" value={session.coachName} />
                    <InfoTile label="Schedule" value={formatDateTime(session.scheduledFor, session.startTime)} />
                    <InfoTile label="Duration" value={formatDuration(session.durationMinutes)} />
                    <InfoTile label="Status" value={prettyStatus(session.status)} />
                    <InfoTile label="Attendance" value={prettyStatus(session.attendanceState)} />
                    <InfoTile label="Batch" value={session.batchNames.join(", ") || "Unassigned"} />
                    {kind === "marked" ? <InfoTile label="Students Marked" value={session.studentRecords || 0} /> : null}
                    {kind !== "marked" ? <InfoTile label="Email" value={session.coachEmail || "Not available"} /> : null}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                  <Link href={`/classrooms/${session.classroomId}/summary?session=${session.sessionId}`} className="btn-outline justify-center">
                    View Details
                  </Link>
                  {canSendReminder ? (
                    <button
                      type="button"
                      onClick={() => sendReminder(session)}
                      disabled={sendingId === session.id}
                      className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <BellRing size={16} /> {sendingId === session.id ? "Sending..." : "Send Reminder"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-black text-brand">{value}</div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">{icon}</span>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}
