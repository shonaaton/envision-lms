"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, History, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import PageLoadingOverlay from "@/components/feedback/PageLoadingOverlay";

type Role = "student" | "instructor" | "admin" | "sub-admin";
type StudentRow = { _id: string; name: string; username?: string; email?: string; status: "present" | "absent" | "late"; note?: string };
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
  scheduledFor: string;
  startTime: string;
  durationMinutes: number;
  status: string;
  attendanceState: "marked" | "pending" | "missed";
  coachStatus: "present" | "absent" | "late" | "pending" | "cancelled" | "rescheduled";
  teachingMinutes: number;
  actualTeachingMinutes?: number;
  punctualityScore?: number;
  students: StudentRow[];
};

function formatDate(value?: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
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

function lifecycleTone(value: string) {
  if (value === "completed") return "bg-emerald-50 text-emerald-700";
  if (value === "missed") return "bg-amber-50 text-amber-700";
  if (value === "cancelled") return "bg-rose-50 text-rose-700";
  if (value === "rescheduled") return "bg-sky-50 text-sky-700";
  if (value === "ongoing") return "bg-brand/10 text-brand";
  if (value === "join_available") return "bg-brand/10 text-brand";
  return "bg-slate-100 text-slate-600";
}

export default function AttendanceWorkspace({ role }: { role: Role }) {
  const canEditAttendance = role === "admin";
  const canManageMissedAttendance = role === "admin" || role === "sub-admin";
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [draft, setDraft] = useState<Record<string, "present" | "absent" | "late">>({});
  const [coachStatus, setCoachStatus] = useState<"present" | "absent" | "late">("present");
  const [busyMessage, setBusyMessage] = useState("");

  const selectedSession: SessionRow | null = useMemo(
    () => (data?.sessions || []).find((session: SessionRow) => session.id === selectedSessionId) || null,
    [data, selectedSessionId]
  );

  async function load() {
    setBusyMessage("Loading attendance...");
    try {
      const response = await fetch(`/api/attendance/workspace?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const next = await response.json();
      setData(next);
      const first = next?.sessions?.[0];
      const picked = next?.sessions?.find((session: SessionRow) => session.id === selectedSessionId) || first;
      setSelectedSessionId(picked?.id || "");
      const nextDraft: Record<string, "present" | "absent" | "late"> = {};
      (picked?.students || []).forEach((student: StudentRow) => {
        nextDraft[student._id] = student.status || "present";
      });
      setDraft(nextDraft);
      setCoachStatus((picked?.coachStatus === "absent" || picked?.coachStatus === "late") ? picked.coachStatus : "present");
    } finally {
      setBusyMessage("");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (!selectedSession) return;
    const nextDraft: Record<string, "present" | "absent" | "late"> = {};
    selectedSession.students.forEach((student) => {
      nextDraft[student._id] = student.status || "present";
    });
    setDraft(nextDraft);
    setCoachStatus((selectedSession.coachStatus === "absent" || selectedSession.coachStatus === "late") ? selectedSession.coachStatus : "present");
  }, [selectedSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAttendance() {
    if (!selectedSession) return;
    setBusyMessage("Saving attendance...");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroom: selectedSession.classroomId,
          sessionId: selectedSession.sessionId,
          sessionDate: selectedSession.scheduledFor,
          coachStatus,
          teachingMinutes: selectedSession.teachingMinutes || selectedSession.durationMinutes,
          records: selectedSession.students.map((student) => ({
            student: student._id,
            status: draft[student._id] || "present",
            note: "Marked from attendance workspace",
          })),
        }),
      });
      if (!response.ok) {
        toast.error("Attendance could not be saved");
        return;
      }
      toast.success("Attendance saved");
      await load();
    } finally {
      setBusyMessage("");
    }
  }

  if (role === "student") {
    const sessionRows = data?.sessionRows || [];
    return (
      <div className="space-y-4 text-slate-950 sm:space-y-6">
        <PageLoadingOverlay visible={!!busyMessage} message={busyMessage} />
        <div>
          <h1 className="font-display text-2xl text-brand sm:text-3xl">Attendance</h1>
          <p className="mt-1 text-sm text-slate-500">Track your class participation, attendance history, and session details.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Attendance %" value={`${data?.overall?.attendancePercentage || 0}%`} icon={<CheckCircle2 size={16} />} />
          <SummaryCard label="Classes Attended" value={data?.overall?.classesAttended || 0} icon={<UserCheck size={16} />} />
          <SummaryCard label="Classes Missed" value={data?.overall?.classesMissed || 0} icon={<History size={16} />} />
          <SummaryCard label="Late Entries" value={data?.overall?.lateEntries || 0} icon={<Clock3 size={16} />} />
          <SummaryCard label="Hours Attended" value={data?.overall?.totalTeachingHoursAttended || 0} icon={<CalendarDays size={16} />} />
        </div>

        <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.08)] sm:p-5">
          <h2 className="text-lg font-black text-slate-950">Course-Wise Attendance</h2>
          <div className="mt-4 grid gap-3 md:hidden">
            {(data?.courseRows || []).map((row: any) => (
              <div key={row.courseName} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="font-semibold text-slate-950">{row.courseName}</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoTile label="Attendance" value={`${row.attendancePercentage}%`} />
                  <InfoTile label="Attended" value={row.attended} />
                  <InfoTile label="Missed" value={row.missed} />
                </div>
              </div>
            ))}
            {!(data?.courseRows || []).length && <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No course attendance yet.</div>}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr className="border-b border-slate-100"><th className="px-3 py-3">Course</th><th className="px-3 py-3">Attendance %</th><th className="px-3 py-3">Attended</th><th className="px-3 py-3">Missed</th></tr></thead>
              <tbody>
                {(data?.courseRows || []).map((row: any) => (
                  <tr key={row.courseName} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-semibold">{row.courseName}</td>
                    <td className="px-3 py-3">{row.attendancePercentage}%</td>
                    <td className="px-3 py-3">{row.attended}</td>
                    <td className="px-3 py-3">{row.missed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.08)] sm:p-5">
          <h2 className="text-lg font-black text-slate-950">Session Details</h2>
          <div className="mt-4 space-y-3">
            {sessionRows.map((row: any) => (
              <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{row.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{row.topicName} • {row.courseName} • {row.coachName}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${lifecycleTone(row.status)}`}>{prettyStatus(row.status)}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="Date" value={formatDate(row.sessionDate)} />
                  <InfoTile label="Duration" value={formatDuration(row.durationMinutes || 0)} />
                  <InfoTile label="Attendance" value={prettyStatus(row.status)} />
                  <InfoTile label="Time Present" value={formatDuration(row.totalTimePresentMinutes || 0)} />
                  <InfoTile label="Joined" value={row.joinedAt ? new Date(row.joinedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "-"} />
                  <InfoTile label="Left" value={row.leftAt ? new Date(row.leftAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "-"} />
                  <InfoTile label="Course" value={row.courseName} />
                  <InfoTile label="Topic" value={row.topicName} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-slate-950 sm:space-y-6">
      <PageLoadingOverlay visible={!!busyMessage} message={busyMessage} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl text-brand sm:text-3xl">Attendance</h1>
          <p className="mt-1 text-sm text-slate-500">
            {role === "admin"
              ? "Monitor today’s attendance, review missed records, and override sessions when needed."
              : "Backup attendance management for your completed classes and pending session records."}
          </p>
        </div>
        <input className="input h-11 w-full lg:max-w-[220px]" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Completed Classes" value={data?.counts?.completedClasses || 0} icon={<CalendarDays size={16} />} href={canManageMissedAttendance ? "/attendance/completed" : undefined} />
        <SummaryCard label="Missed Attendance" value={data?.counts?.missedAttendanceClasses || 0} icon={<History size={16} />} href={canManageMissedAttendance ? "/attendance/missed" : undefined} />
        <SummaryCard label="Pending Classes" value={data?.counts?.attendancePendingClasses || 0} icon={<Clock3 size={16} />} href={canManageMissedAttendance ? `/attendance/pending?date=${encodeURIComponent(date)}` : undefined} />
        <SummaryCard label="Marked Classes" value={data?.counts?.previouslyMarkedClasses || 0} icon={<CheckCircle2 size={16} />} href={canManageMissedAttendance ? "/attendance/marked" : undefined} />
      </div>

      {role === "admin" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryCard label="Student Attendance %" value={`${data?.analytics?.studentAttendancePercentage || 0}%`} icon={<Users size={16} />} />
          <SummaryCard label="Coach Attendance %" value={`${data?.analytics?.coachAttendancePercentage || 0}%`} icon={<UserCheck size={16} />} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr] xl:gap-5">
        <section className="rounded-lg border border-brand/10 bg-white p-3 shadow-[0_18px_45px_rgba(90,19,114,0.08)] sm:p-4">
          <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-brand">Sessions</div>
          <div className="space-y-3">
            {(data?.sessions || []).length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No sessions found for the selected date.</div>}
            {(data?.sessions || []).map((session: SessionRow) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className={`w-full rounded-lg border p-3 text-left transition sm:p-4 ${selectedSessionId === session.id ? "border-brand bg-brand/5 shadow-lg shadow-brand/10" : "border-slate-200 bg-slate-50 hover:border-brand/20"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{session.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{session.topicName}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${session.attendanceState === "marked" ? "bg-emerald-50 text-emerald-700" : session.attendanceState === "missed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{session.attendanceState}</span>
                </div>
                <div className="mt-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${lifecycleTone(session.status)}`}>{prettyStatus(session.status)}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <InfoTile label="Course" value={session.courseName} />
                  <InfoTile label="Level" value={session.levelName} />
                  <InfoTile label="Date" value={formatDate(session.scheduledFor)} />
                  <InfoTile label="Duration" value={formatDuration(session.durationMinutes)} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-brand/10 bg-white p-3 shadow-[0_18px_45px_rgba(90,19,114,0.08)] sm:p-5">
          {selectedSession ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-950">{selectedSession.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedSession.topicName} • {selectedSession.courseName} • {selectedSession.levelName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["completed", "missed", "cancelled", "rescheduled"].includes(selectedSession.status) ? (
                    <Link href={`/classrooms/${selectedSession.classroomId}/summary?session=${selectedSession.sessionId}`} className="btn-outline">
                      View Details
                    </Link>
                  ) : null}
                  {canEditAttendance ? <button className="btn-primary w-full sm:w-auto" onClick={saveAttendance}>Save Attendance</button> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="Batch" value={selectedSession.batchNames.join(", ") || "Unassigned"} />
                <InfoTile label="Coach" value={selectedSession.coachName} />
                <InfoTile label="Time" value={selectedSession.startTime || "--"} />
                <InfoTile label="Scheduled Duration" value={formatDuration(selectedSession.durationMinutes)} />
                <InfoTile label="Paid Hours" value={formatDuration(selectedSession.teachingMinutes || selectedSession.durationMinutes)} />
                <InfoTile label="Actual Class Time" value={formatDuration(selectedSession.actualTeachingMinutes || 0)} />
                <InfoTile label="Punctuality Score" value={selectedSession.punctualityScore ? `${selectedSession.punctualityScore}%` : "Pending"} />
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 text-sm font-black text-slate-950">Coach Attendance</div>
                <div className="flex flex-wrap gap-2">
                  {(["present", "absent", "late"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => canEditAttendance && setCoachStatus(value)}
                      disabled={!canEditAttendance}
                      className={`min-w-[96px] flex-1 rounded-lg border px-3 py-2 text-sm font-semibold sm:flex-none ${coachStatus === value ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-700"}`}
                    >
                      {value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {selectedSession.students.map((student) => (
                  <div key={student._id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-semibold text-slate-950">{student.name}</div>
                      <div className="text-xs text-slate-500">{student.username || student.email}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                      {(["present", "absent", "late"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => canEditAttendance && setDraft((current) => ({ ...current, [student._id]: value }))}
                          disabled={!canEditAttendance}
                          className={`min-w-0 rounded-lg border px-2 py-2 text-xs font-semibold sm:min-w-[104px] sm:px-4 sm:text-sm ${draft[student._id] === value ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-700"}`}
                        >
                          {value[0].toUpperCase() + value.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">Select a session to view or edit attendance.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, href }: { label: string; value: string | number; icon: React.ReactNode; href?: string }) {
  const content = (
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-black text-brand">{value}</div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">{icon}</span>
      </div>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-lg border border-brand/10 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.08)] transition hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-[0_22px_50px_rgba(90,19,114,0.12)]">
        {content}
      </Link>
    );
  }
  return (
    <div className="rounded-lg border border-brand/10 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.08)]">
      {content}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}
