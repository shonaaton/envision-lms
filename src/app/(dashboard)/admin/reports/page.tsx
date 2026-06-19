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
    description: "Export session lifecycle, join access, topic, coach, student counts, and meeting readiness.",
    icon: GraduationCap,
  },
  {
    type: "tournaments",
    title: "Tournament Overview",
    description: "Export tournament lifecycle, player access state, participant counts, live boards, leaders, and round progress.",
    icon: Trophy,
  },
  {
    type: "attendance",
    title: "Attendance Records",
    description: "Export student attendance, coach status, teaching time, and session-level backup records.",
    icon: ClipboardList,
  },
  {
    type: "coaching-hours",
    title: "Coaching Hours",
    description: "Export coach workload, batch-wise hours, attendance percentage, and teaching coverage.",
    icon: CalendarDays,
  },
] as const;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-brand">{value}</div>
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
    <div className="space-y-6 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white px-5 py-5 shadow-[0_24px_60px_rgba(90,19,114,0.12)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">Administration</div>
            <h1 className="mt-1 flex items-center gap-3 text-3xl font-black text-brand"><BarChart3 size={28} /> Reports Center</h1>
            <p className="mt-1 text-sm text-slate-600">One place to export classroom sessions, tournaments, attendance, and coaching hours without bouncing between modules.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/fees/reports" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm">
              <ExternalLink size={15} /> Fee Reports
            </Link>
            <Link href="/admin/activity-tracker" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm">
              <ExternalLink size={15} /> Activity Tracker
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Classrooms" value={classroomCount} />
          <StatCard label="Tournaments" value={tournamentCount} />
          <StatCard label="Attendance Logs" value={attendanceCount} />
          <StatCard label="Active Coaches" value={coachCount} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatCard label="Upcoming Sessions" value={upcomingSessions} />
          <StatCard label="Completed / Closed Sessions" value={completedSessions} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {reportCards.map((report) => {
          const Icon = report.icon;
          return (
            <form key={report.type} action="/api/admin/reports" className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
              <input type="hidden" name="type" value={report.type} />
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Icon size={20} />
                </span>
                <div>
                  <h2 className="text-lg font-black text-slate-950">{report.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{report.description}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">From</div>
                  <input type="date" name="from" className="mt-1 w-full bg-transparent text-sm outline-none" />
                </label>
                <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">To</div>
                  <input type="date" name="to" className="mt-1 w-full bg-transparent text-sm outline-none" />
                </label>
                <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Format</div>
                  <select name="format" className="mt-1 w-full bg-transparent text-sm outline-none">
                    <option value="csv">CSV</option>
                    <option value="xls">Excel (.xls)</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="inline-flex h-11 items-center gap-2 rounded-2xl bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm">
                  <Download size={16} /> Download {report.title}
                </button>
              </div>
            </form>
          );
        })}
      </section>
    </div>
  );
}
