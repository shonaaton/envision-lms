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
import { scheduledPaymentMinutes } from "@/lib/teachingStats";

export const dynamic = "force-dynamic";

const reportCards = [
  {
    type: "classrooms",
    title: "Classroom Sessions",
    description: "Sessions, coach, topic, students, meeting readiness.",
    icon: GraduationCap,
    peopleFilters: ["coach"],
  },
  {
    type: "tournaments",
    title: "Tournament Overview",
    description: "Lifecycle, players, boards, leaders, rounds.",
    icon: Trophy,
    peopleFilters: [],
  },
  {
    type: "attendance",
    title: "Attendance Records",
    description: "Student-wise or teacher-wise attendance with teaching time.",
    icon: ClipboardList,
    peopleFilters: ["student", "coach"],
  },
  {
    type: "coaching-hours",
    title: "Coaching Hours",
    description: "Coach-wise workload, batch hours, teaching coverage.",
    icon: CalendarDays,
    peopleFilters: ["coach"],
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

  const [classroomCount, tournamentCount, attendanceCount, coachCount, students, coaches] = await Promise.all([
    Classroom.countDocuments({}),
    Tournament.countDocuments({}),
    Attendance.countDocuments({}),
    User.countDocuments({ role: "instructor", isActive: { $ne: false } }),
    User.find({ role: "student", isActive: { $ne: false } }, { name: 1, username: 1, email: 1 }).sort({ name: 1 }).lean(),
    User.find({ role: "instructor", isActive: { $ne: false } }, { name: 1, username: 1, email: 1 }).sort({ name: 1 }).lean(),
  ]);
  const classroomDocs = await Classroom.find({})
    .populate("coach instructor students batches", "name")
    .lean();
  const sessionRows = flattenScheduledSessions(classroomDocs);
  const upcomingSessions = sessionRows.filter((row) => isSessionUpcomingLike(deriveScheduledSessionStatus(row.session, new Date()))).length;
  const completedSessions = sessionRows.filter((row) => ["completed", "missed", "cancelled", "rescheduled"].includes(deriveScheduledSessionStatus(row.session, new Date()))).length;
  const completedDemoRows = sessionRows.filter((row) => row.classroom.classroomType === "demo" && deriveScheduledSessionStatus(row.session, new Date()) === "completed");
  const demoHours = Number((completedDemoRows.reduce((sum, row) => sum + scheduledPaymentMinutes(row.session, row.classroom), 0) / 60).toFixed(2));

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
          <StatCard label="Demo Classes" value={completedDemoRows.length} />
          <StatCard label="Demo Hours" value={demoHours} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-brand/10 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-black text-slate-950">Exports</h2>
          <p className="text-xs text-slate-500">Choose people, date range, and format.</p>
        </div>
        {reportCards.map((report) => {
          const Icon = report.icon;
          return (
            <form key={report.type} action="/api/admin/reports" className="grid gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0 lg:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(0,160px)_minmax(0,160px)_128px_128px_104px_116px] xl:items-end">
              <input type="hidden" name="type" value={report.type} />
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon size={17} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-slate-950">{report.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-600">{report.description}</p>
                </div>
              </div>
              {(report.peopleFilters as readonly string[]).includes("student") ? (
                <SelectField name="studentId" label="Student" options={[["", "All students"], ...students.map((student: any) => [String(student._id), `${student.name} (${student.username || student.email})`] as [string, string])]} />
              ) : <div className="hidden xl:block" />}
              {(report.peopleFilters as readonly string[]).includes("coach") ? (
                <SelectField name="coachId" label="Coach" options={[["", "All coaches"], ...coaches.map((coach: any) => [String(coach._id), `${coach.name} (${coach.username || coach.email})`] as [string, string])]} />
              ) : <div className="hidden xl:block" />}
              <label className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">From</div>
                <input type="date" name="from" className="mt-0.5 w-full bg-transparent text-xs outline-none" />
              </label>
              <label className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">To</div>
                <input type="date" name="to" className="mt-0.5 w-full bg-transparent text-xs outline-none" />
              </label>
              <label className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Format</div>
                <select name="format" className="mt-0.5 w-full bg-transparent text-xs outline-none">
                  <option value="csv">CSV</option>
                  <option value="xls">Excel (.xls)</option>
                </select>
              </label>
              <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-purple-700 px-2.5 text-xs font-semibold text-white shadow-sm">
                <Download size={14} /> Download
              </button>
            </form>
          );
        })}
      </section>
    </div>
  );
}

function SelectField({ name, label, options }: { name: string; label: string; options: Array<[string, string]> }) {
  return (
    <label className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <select name={name} className="mt-0.5 w-full bg-transparent text-xs outline-none">
        {options.map(([value, text]) => <option key={`${name}-${value || "all"}`} value={value}>{text}</option>)}
      </select>
    </label>
  );
}
