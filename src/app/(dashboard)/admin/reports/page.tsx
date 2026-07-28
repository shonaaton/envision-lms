import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { Tournament } from "@/models/Tournament";
import { User } from "@/models/User";
import { deriveScheduledSessionStatus, flattenScheduledSessions, isSessionUpcomingLike } from "@/lib/classroomSessions";
import { BarChart3, CalendarDays, ClipboardList, Download, ExternalLink, GraduationCap, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

const reportCards = [
  {
    type: "classrooms",
    title: "Classroom Sessions",
    description: "Sessions, coach, topic, students, meeting readiness.",
    icon: GraduationCap,
  },
  {
    type: "tournaments",
    title: "Tournament Overview",
    description: "Lifecycle, players, boards, leaders, rounds.",
    icon: Trophy,
  },
  {
    type: "attendance",
    title: "Attendance Records",
    description: "Student attendance, coach status, teaching time.",
    icon: ClipboardList,
  },
  {
    type: "coaching-hours",
    title: "Coaching Hours",
    description: "Coach workload, batch hours, teaching coverage.",
    icon: CalendarDays,
  },
] as const;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="text-lg font-black text-brand">{value}</div>
    </div>
  );
}

export default async function AdminReportsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");

  await dbConnect();

  const [classroomCount, tournamentCount, attendanceCount, coachCount] = await Promise.all([
    Classroom.countDocuments({}),
    Tournament.countDocuments({}),
    Attendance.countDocuments({}),
    User.countDocuments({ role: "instructor", isActive: { $ne: false } }),
  ]);
  const classroomDocs = await Classroom.find({})
    .populate("coach instructor students batches", "name")
    .lean();
  const sessionRows = flattenScheduledSessions(classroomDocs);
  const upcomingSessions = sessionRows.filter((row) => isSessionUpcomingLike(deriveScheduledSessionStatus(row.session, new Date()))).length;
  const completedSessions = sessionRows.filter((row) => ["completed", "missed", "cancelled", "rescheduled"].includes(deriveScheduledSessionStatus(row.session, new Date()))).length;

  return (
    <div className="space-y-4 text-slate-950">
      <section className="rounded-xl border border-brand/10 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-brand/70">Administration</div>
            <h1 className="mt-0.5 flex items-center gap-2 text-xl font-black text-brand"><BarChart3 size={21} /> Reports Center</h1>
            <p className="mt-0.5 text-xs text-slate-600">Export classroom, tournament, attendance, and coaching reports from one place.</p>
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            <Link href="/fees/reports" className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm">
              <ExternalLink size={15} /> Fee Reports
            </Link>
            <Link href="/admin/activity-tracker" className="inline-flex h-8 items-center gap-2 rounded-lg bg-purple-700 px-3 text-xs font-semibold text-white shadow-sm">
              <ExternalLink size={15} /> Activity Tracker
            </Link>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Classrooms" value={classroomCount} />
          <StatCard label="Tournaments" value={tournamentCount} />
          <StatCard label="Attendance Logs" value={attendanceCount} />
          <StatCard label="Active Coaches" value={coachCount} />
          <StatCard label="Upcoming Sessions" value={upcomingSessions} />
          <StatCard label="Completed / Closed Sessions" value={completedSessions} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-brand/10 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-black text-slate-950">Exports</h2>
          <p className="text-xs text-slate-500">Choose date range and format, then download.</p>
        </div>
        {reportCards.map((report) => {
          const Icon = report.icon;
          return (
            <form key={report.type} action="/api/admin/reports" className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 xl:grid-cols-[minmax(250px,1fr)_160px_160px_130px_190px] xl:items-end">
              <input type="hidden" name="type" value={report.type} />
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-slate-950">{report.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-600">{report.description}</p>
                </div>
              </div>
              <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">From</div>
                <input type="date" name="from" className="mt-0.5 w-full bg-transparent text-xs outline-none" />
              </label>
              <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">To</div>
                <input type="date" name="to" className="mt-0.5 w-full bg-transparent text-xs outline-none" />
              </label>
              <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Format</div>
                <select name="format" className="mt-0.5 w-full bg-transparent text-xs outline-none">
                  <option value="csv">CSV</option>
                  <option value="xls">Excel (.xls)</option>
                </select>
              </label>
              <button className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-purple-700 px-3 text-xs font-semibold text-white shadow-sm">
                <Download size={15} /> Download
              </button>
            </form>
          );
        })}
      </section>
    </div>
  );
}
