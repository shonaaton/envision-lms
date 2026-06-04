import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Activity } from "@/models/Activity";
import { Attendance } from "@/models/Attendance";
import { Batch } from "@/models/Batch";
import { Booking } from "@/models/Booking";
import { Classroom } from "@/models/Classroom";
import { Homework, Submission } from "@/models/Homework";
import { Payment } from "@/models/Payment";
import { PGN } from "@/models/PGN";
import { User } from "@/models/User";
import { Invoice } from "@/models/Fee";
import { Tournament } from "@/models/Tournament";
import {
  Activity as ActivityIcon,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Gamepad2,
  GraduationCap,
  Search,
  TrendingUp,
  Users,
  Trophy,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

type DashboardSearchParams = {
  preset?: string;
  from?: string;
  to?: string;
  q?: string;
  date?: string;
  academicYear?: string;
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRange(searchParams: DashboardSearchParams) {
  const today = new Date();
  const preset = searchParams.preset || "30";
  const customFrom = parseDate(searchParams.from);
  const customTo = parseDate(searchParams.to);

  if (preset === "custom" && customFrom && customTo) {
    return { preset, from: startOfDay(customFrom), to: endOfDay(customTo) };
  }

  const days = preset === "7" ? 7 : preset === "90" ? 90 : 30;
  return {
    preset,
    from: startOfDay(new Date(today.getTime() - (days - 1) * DAY)),
    to: endOfDay(today),
  };
}

function dateFilter(field: string, from: Date, to: Date) {
  return { [field]: { $gte: from, $lte: to } };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTimeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / DAY)} day${Math.floor(diff / DAY) === 1 ? "" : "s"} ago`;
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1, notation: value > 9999 ? "compact" : "standard" }).format(value);
}

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function miniBars(points: { label: string; value: number }[]) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return points.map((point) => ({
    ...point,
    height: Math.max(8, Math.round((point.value / max) * 130)),
  }));
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-50 text-purple-700 shadow-md shadow-purple-900/10">
        <Icon size={16} />
      </span>
      <div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, note, icon: Icon, tone = "purple" }: { label: string; value: string | number; note: string; icon: any; tone?: "purple" | "green" | "amber" | "blue" | "rose" }) {
  const tones = {
    purple: "bg-purple-50 text-purple-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(90,19,114,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(90,19,114,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function ActivityBadge({ type }: { type: string }) {
  const tone = type.includes("homework")
    ? "bg-violet-50 text-violet-700"
    : type.includes("attendance")
      ? "bg-emerald-50 text-emerald-700"
      : type.includes("pgn")
        ? "bg-amber-50 text-amber-700"
        : type.includes("payment")
          ? "bg-sky-50 text-sky-700"
          : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{type.replace(".", " ")}</span>;
}

async function StandardDashboard({ userId, role }: { userId: string; role: string }) {
  const classroomFilter = role === "instructor" ? { instructor: userId } : role === "student" ? { students: userId } : {};
  const [classrooms, openHomework, upcomingBookings, tournaments] = await Promise.all([
    Classroom.find(classroomFilter).limit(6).lean(),
    Homework.find({}).limit(5).lean(),
    Booking.find({ $or: [{ student: userId }, { instructor: userId }], startAt: { $gte: new Date() } })
      .sort({ startAt: 1 })
      .limit(5)
      .lean(),
    Tournament.find({
      status: { $in: ["upcoming", "live"] },
      startAt: { $gte: new Date(Date.now() - DAY) },
      $or: [
        { "access.users": userId },
        { participants: userId },
        { "access.allActiveStudents": true },
      ],
    }).sort({ startAt: 1 }).limit(6).lean(),
  ]);

  const tiles = [
    { label: "Classrooms", value: classrooms.length, icon: BookOpen, href: "/classrooms" },
    { label: "Open Homework", value: openHomework.length, icon: ClipboardList, href: "/homework" },
    { label: "Upcoming Sessions", value: upcomingBookings.length, icon: Calendar, href: "/booking" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-accent">Dashboard</h1>
        <p className="text-sm text-gray-400">Your snapshot of academy activity.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card-hover flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">{tile.label}</div>
              <div className="mt-1 text-3xl font-bold text-white">{tile.value}</div>
            </div>
            <tile.icon className="text-accent" size={32} />
          </Link>
        ))}
      </div>
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold text-white">Upcoming Tournaments</h2>
        {tournaments.length === 0 ? (
          <p className="text-sm text-gray-400">No upcoming tournaments available for you yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tournaments.map((tournament: any) => (
              <Link key={tournament._id.toString()} href={`/tournaments/${tournament._id}`} className="rounded-md border border-ink-700 p-3 hover:bg-white/5">
                <div className="font-semibold text-white">{tournament.name}</div>
                <div className="mt-1 text-xs text-gray-400">{tournament.type === "arena" ? "Arena" : "Swiss"} - {new Date(tournament.startAt).toLocaleString("en-IN")}</div>
                <div className="mt-2 inline-flex rounded bg-brand px-2 py-1 text-xs text-white">{tournament.status}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | undefined;

  await dbConnect();

  if (role !== "admin") {
    return <StandardDashboard userId={userId} role={role ?? "student"} />;
  }

  const { preset, from, to } = getRange(searchParams);
  const focusDate = parseDate(searchParams.date) || new Date();
  const focusFrom = startOfDay(focusDate);
  const focusTo = endOfDay(focusDate);
  const academicYearStart = Number(searchParams.academicYear || (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1));
  const academicFrom = new Date(academicYearStart, 3, 1, 0, 0, 0, 0);
  const academicTo = new Date(academicYearStart + 1, 2, 31, 23, 59, 59, 999);
  const q = (searchParams.q || "").trim().toLowerCase();
  const userSearch = q
    ? {
        $or: [
          { name: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { username: { $regex: q, $options: "i" } },
        ],
      }
    : {};

  const [
    students,
    coaches,
    batches,
    classrooms,
    homework,
    submissions,
    attendance,
    bookings,
    payments,
    allPayments,
    invoices,
    pgns,
    loggedActivities,
  ] = await Promise.all([
    User.find({ role: "student", ...userSearch }, { passwordHash: 0 }).sort({ createdAt: -1 }).lean(),
    User.find({ role: "instructor" }, { passwordHash: 0 }).sort({ name: 1 }).lean(),
    Batch.find({}).populate("coach", "name").lean(),
    Classroom.find({}).lean(),
    Homework.find(dateFilter("createdAt", from, to)).lean(),
    Submission.find(dateFilter("submittedAt", from, to)).populate("student", "name username").lean(),
    Attendance.find(dateFilter("sessionDate", from, to)).populate("classroom", "title").lean(),
    Booking.find(dateFilter("startAt", from, to)).populate("student instructor", "name").lean(),
    Payment.find({ status: "paid", $or: [dateFilter("paidAt", from, to), dateFilter("createdAt", from, to)] }).populate("user", "name username").lean(),
    Payment.find({ status: "paid", $or: [dateFilter("paidAt", academicFrom, academicTo), dateFilter("createdAt", academicFrom, academicTo)] }).lean(),
    Invoice.find(dateFilter("createdAt", academicFrom, academicTo)).lean(),
    PGN.find(dateFilter("createdAt", from, to)).populate("uploadedBy", "name username").lean(),
    Activity.find(dateFilter("occurredAt", from, to))
      .populate("actor targetUser", "name username role")
      .sort({ occurredAt: -1 })
      .limit(120)
      .lean(),
  ]);

  const activeStudents = students.filter((student: any) => student.isActive !== false);
  const newStudents = students.filter((student: any) => new Date(student.createdAt) >= from && new Date(student.createdAt) <= to);
  const studentsAddedToday = students.filter((student: any) => new Date(student.createdAt) >= focusFrom && new Date(student.createdAt) <= focusTo);
  const genderCounts = {
    male: students.filter((student: any) => student.gender === "male").length,
    female: students.filter((student: any) => student.gender === "female").length,
    other: students.filter((student: any) => student.gender === "other").length,
    notAvailable: students.filter((student: any) => !student.gender || student.gender === "not_available").length,
  };
  const activeClassrooms = classrooms.filter((classroom: any) => classroom.isActive !== false);
  const publishedHomework = homework.filter((item: any) => item.isPublished !== false);
  const paidRevenue = payments.reduce((sum: number, payment: any) => sum + (payment.amount || 0), 0);
  const todayCollection = invoices
    .filter((invoice: any) => invoice.status === "paid" && new Date(invoice.paidAt || invoice.updatedAt || invoice.createdAt) >= focusFrom && new Date(invoice.paidAt || invoice.updatedAt || invoice.createdAt) <= focusTo)
    .reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
  const todayDue = invoices
    .filter((invoice: any) => invoice.status !== "paid" && invoice.status !== "cancelled" && new Date(invoice.dueDate) >= focusFrom && new Date(invoice.dueDate) <= focusTo)
    .reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
  const collectedFees = invoices.filter((invoice: any) => invoice.status === "paid").reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
  const pastDues = invoices.filter((invoice: any) => invoice.status !== "paid" && invoice.status !== "cancelled" && new Date(invoice.dueDate) < new Date()).reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
  const futureDues = invoices.filter((invoice: any) => invoice.status !== "paid" && invoice.status !== "cancelled" && new Date(invoice.dueDate) >= new Date()).reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
  const badDebt = invoices.filter((invoice: any) => invoice.status === "overdue" && new Date(invoice.dueDate) < new Date(Date.now() - 60 * DAY)).reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
  const transactionModes = ["upi", "cash", "card", "cheque", "other"].map((mode) => ({
    mode,
    amount: allPayments.filter((payment: any) => (payment.method || "other") === mode).reduce((sum: number, payment: any) => sum + (payment.amount || 0), 0),
  }));

  const classroomStudents = new Map<string, string[]>();
  classrooms.forEach((classroom: any) => {
    classroomStudents.set(objectId(classroom._id), (classroom.students || []).map(objectId));
  });

  const homeworkMaxScore = new Map<string, number>();
  homework.forEach((item: any) => {
    homeworkMaxScore.set(
      objectId(item._id),
      (item.puzzles || []).reduce((sum: number, puzzle: any) => sum + (puzzle.points ?? 1), 0)
    );
  });

  const assignedHomeworkTotal = homework.reduce((sum: number, item: any) => {
    return sum + (classroomStudents.get(objectId(item.classroom))?.length ?? 0);
  }, 0);
  const completionRate = percent(submissions.length, assignedHomeworkTotal);
  const totalPossibleScore = submissions.reduce((sum: number, sub: any) => sum + (homeworkMaxScore.get(objectId(sub.homework)) || 0), 0);
  const totalScore = submissions.reduce((sum: number, sub: any) => sum + (sub.totalScore || 0), 0);
  const scoreRate = percent(totalScore, totalPossibleScore);

  const attendanceRecords = attendance.flatMap((item: any) => item.records || []);
  const presentRecords = attendanceRecords.filter((record: any) => record.status === "present" || record.status === "late");
  const attendanceRate = percent(presentRecords.length, attendanceRecords.length);

  const growthBuckets = new Map<string, number>();
  const totalDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY));
  const bucketStep = totalDays > 45 ? 7 : 1;
  for (let cursor = startOfDay(from); cursor <= to; cursor = new Date(cursor.getTime() + bucketStep * DAY)) {
    growthBuckets.set(dateKey(cursor), 0);
  }
  newStudents.forEach((student: any) => {
    const created = startOfDay(new Date(student.createdAt));
    const offset = Math.floor((created.getTime() - startOfDay(from).getTime()) / DAY);
    const bucketStart = new Date(startOfDay(from).getTime() + Math.floor(Math.max(0, offset) / bucketStep) * bucketStep * DAY);
    const key = dateKey(bucketStart);
    growthBuckets.set(key, (growthBuckets.get(key) || 0) + 1);
  });
  const growthPoints = miniBars(
    Array.from(growthBuckets.entries()).map(([key, value]) => ({
      label: new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(key)),
      value,
    }))
  );

  const studentRows = activeStudents.slice(0, 10).map((student: any) => {
    const sid = objectId(student._id);
    const studentClasses = classrooms.filter((classroom: any) => (classroom.students || []).map(objectId).includes(sid));
    const assignedHomework = homework.filter((item: any) => studentClasses.some((classroom: any) => objectId(classroom._id) === objectId(item.classroom)));
    const completed = submissions.filter((sub: any) => objectId(sub.student?._id ?? sub.student) === sid);
    const studentAttendance = attendanceRecords.filter((record: any) => objectId(record.student) === sid);
    const studentPresent = studentAttendance.filter((record: any) => record.status === "present" || record.status === "late");
    const studentPgns = pgns.filter((pgn: any) => objectId(pgn.uploadedBy?._id ?? pgn.uploadedBy) === sid);
    const lastDates = [
      ...completed.map((sub: any) => new Date(sub.submittedAt)),
      ...studentPgns.map((pgn: any) => new Date(pgn.createdAt)),
      ...bookings.filter((booking: any) => objectId(booking.student?._id ?? booking.student) === sid).map((booking: any) => new Date(booking.startAt)),
    ].filter((date) => !Number.isNaN(date.getTime()));
    const lastActivity = lastDates.sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      id: sid,
      name: student.name,
      username: student.username,
      classes: studentClasses.length,
      homework: `${completed.length}/${assignedHomework.length}`,
      attendance: percent(studentPresent.length, studentAttendance.length),
      pgns: studentPgns.length,
      lastActivity,
    };
  });

  const coachRows = coaches.map((coach: any) => {
    const cid = objectId(coach._id);
    const coachClasses = classrooms.filter((classroom: any) => objectId(classroom.coach || classroom.instructor) === cid);
    const studentIds = new Set(coachClasses.flatMap((classroom: any) => (classroom.students || []).map(objectId)));
    const coachHomework = homework.filter((item: any) => objectId(item.instructor) === cid);
    const coachAttendance = attendance.filter((item: any) => coachClasses.some((classroom: any) => objectId(classroom._id) === objectId(item.classroom?._id ?? item.classroom)));
    return {
      id: cid,
      name: coach.name,
      students: studentIds.size,
      classes: coachClasses.length,
      homework: coachHomework.length,
      sessions: coachAttendance.length,
    };
  });

  const activities: any[] = [
    ...loggedActivities.map((item: any) => ({
      id: objectId(item._id),
      type: item.type,
      label: item.label,
      actor: item.actor?.name || item.targetUser?.name || "System",
      when: new Date(item.occurredAt),
    })),
    ...submissions.map((item: any) => ({
      id: `submission-${objectId(item._id)}`,
      type: "homework.submitted",
      label: "Homework submission recorded",
      actor: item.student?.name || "Student",
      when: new Date(item.submittedAt),
    })),
    ...attendance.map((item: any) => ({
      id: `attendance-${objectId(item._id)}`,
      type: "attendance.session",
      label: `Attendance marked for ${item.classroom?.title || "class"}`,
      actor: "Coach/Admin",
      when: new Date(item.sessionDate),
    })),
    ...pgns.map((item: any) => ({
      id: `pgn-${objectId(item._id)}`,
      type: "pgn.uploaded",
      label: item.title,
      actor: item.uploadedBy?.name || "User",
      when: new Date(item.createdAt),
    })),
    ...bookings.map((item: any) => ({
      id: `booking-${objectId(item._id)}`,
      type: "booking.session",
      label: `${item.status} coaching session`,
      actor: item.student?.name || "Student",
      when: new Date(item.startAt),
    })),
    ...payments.map((item: any) => ({
      id: `payment-${objectId(item._id)}`,
      type: "payment.paid",
      label: `${money(item.amount)} payment received`,
      actor: item.user?.name || "Student",
      when: new Date(item.paidAt || item.createdAt),
    })),
  ]
    .filter((item) => item.when >= from && item.when <= to)
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 60);

  const homeworkByDay = miniBars(
    Array.from(growthBuckets.keys()).map((key) => ({
      label: new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(key)),
      value: submissions.filter((item: any) => dateKey(new Date(item.submittedAt)) === key).length,
    }))
  );

  const upcomingBookings = bookings.filter((booking: any) => new Date(booking.startAt) >= new Date()).slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Live academy performance from {formatDate(from)} to {formatDate(to)}.</p>
        </div>

        <form className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_12px_30px_rgba(90,19,114,0.10)]">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Academic Year
            <input name="academicYear" type="number" defaultValue={academicYearStart} className="h-10 w-28 rounded-md border border-slate-200 px-3 text-sm text-slate-700" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Date
            <input name="date" type="date" defaultValue={dateKey(focusDate)} className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700" />
          </label>
          <select name="preset" defaultValue={preset} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
          <input name="from" type="date" defaultValue={dateKey(from)} className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700" />
          <input name="to" type="date" defaultValue={dateKey(to)} className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700" />
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input name="q" defaultValue={searchParams.q} placeholder="Search students..." className="h-10 w-44 rounded-md border border-slate-200 pl-9 pr-3 text-sm text-slate-700" />
          </label>
          <button className="h-10 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white shadow-md shadow-purple-900/20 hover:bg-purple-800">Apply</button>
        </form>
      </div>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)]">
        <SectionTitle icon={Users} title="Academy Snapshot" subtitle={`Academic year ${academicYearStart}-${String(academicYearStart + 1).slice(-2)} and selected date ${formatDate(focusDate)}`} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Student Strength" value={students.length} note="All student profiles" icon={Users} tone="purple" />
          <StatCard label="Total Active Students" value={activeStudents.length} note="Active student profiles" icon={CheckCircle2} tone="green" />
          <StatCard label="Students Added Today" value={studentsAddedToday.length} note={formatDate(focusDate)} icon={GraduationCap} tone="blue" />
          <StatCard label="Today's Fee Collection" value={money(todayCollection)} note="Paid invoices on selected date" icon={CircleDollarSign} tone="green" />
          <StatCard label="Today's Due Amount" value={money(todayDue)} note="Invoices due on selected date" icon={Calendar} tone="amber" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4 shadow-inner shadow-slate-200/70">
            <h3 className="text-sm font-semibold text-slate-950">Gender-wise Student Count</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>Male <b className="float-right">{genderCounts.male}</b></div>
              <div>Female <b className="float-right">{genderCounts.female}</b></div>
              <div>Others <b className="float-right">{genderCounts.other}</b></div>
              <div>Not Available <b className="float-right">{genderCounts.notAvailable}</b></div>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 shadow-inner shadow-slate-200/70">
            <h3 className="text-sm font-semibold text-slate-950">Overall Fee Statistics</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div>Collected Fees <b className="float-right">{money(collectedFees)}</b></div>
              <div>Past Dues <b className="float-right text-rose-700">{money(pastDues)}</b></div>
              <div>Future Dues <b className="float-right text-amber-700">{money(futureDues)}</b></div>
              <div>Bad Debt <b className="float-right text-slate-700">{money(badDebt)}</b></div>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 shadow-inner shadow-slate-200/70">
            <h3 className="text-sm font-semibold text-slate-950">Mode of Transaction Summary</h3>
            <div className="mt-3 space-y-2 text-sm">
              {transactionModes.map((item) => (
                <div key={item.mode}>{item.mode === "cheque" ? "Cheque / PDC / DD" : item.mode.toUpperCase()} <b className="float-right">{money(item.amount)}</b></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.9fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)]">
          <SectionTitle icon={TrendingUp} title="Student Growth Analytics" subtitle="New student registrations inside the selected calendar range" />
          <div className="flex h-44 items-end gap-1 rounded-md bg-slate-50 px-3 py-4">
            {growthPoints.map((point) => (
              <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t bg-purple-600" style={{ height: `${point.height}px` }} title={`${point.label}: ${point.value}`} />
                <span className="w-full truncate text-center text-[10px] text-slate-500">{point.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Growth</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{newStudents.length}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Avg Score</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{scoreRate}%</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">PGN/Game Reviews</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{pgns.length}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Booked Sessions</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{bookings.length}</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)]">
          <SectionTitle icon={ActivityIcon} title="Activity Tracking" subtitle="Account, learning, attendance, payment, and PGN activity" />
          <div className="max-h-[342px] space-y-3 overflow-auto pr-1">
            {activities.length === 0 ? (
              <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No activity found for this date range.</div>
            ) : (
              activities.map((item) => (
                <div key={item.id} className="rounded-md border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <ActivityBadge type={item.type} />
                    <span className="shrink-0 text-xs text-slate-400">{formatTimeAgo(item.when)}</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-950">{item.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.actor}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)] xl:col-span-2">
          <SectionTitle icon={BarChart3} title="Classroom & Engagement" subtitle="Attendance, homework submissions, sessions, and platform usage" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <StatCard label="Sessions Held" value={attendance.length} note="Attendance sheets" icon={Calendar} tone="blue" />
            <StatCard label="Homework Published" value={publishedHomework.length} note="Assignments in range" icon={ClipboardList} tone="purple" />
            <StatCard label="Gameplay Activity" value={pgns.length} note="PGNs uploaded/reviewed" icon={Gamepad2} tone="amber" />
            <StatCard label="Assessments" value={submissions.length} note={`${scoreRate}% score rate`} icon={CheckCircle2} tone="green" />
          </div>
          <div className="mt-4 flex h-32 items-end gap-1 rounded-md bg-slate-50 px-3 py-4">
            {homeworkByDay.map((point) => (
              <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t bg-emerald-500" style={{ height: `${point.height}px` }} title={`${point.label}: ${point.value}`} />
                <span className="w-full truncate text-center text-[10px] text-slate-500">{point.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)]">
          <SectionTitle icon={Calendar} title="Upcoming Sessions" subtitle="Filtered sessions still ahead" />
          <div className="space-y-3">
            {upcomingBookings.length === 0 ? (
              <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No upcoming sessions in this range.</div>
            ) : (
              upcomingBookings.map((booking: any) => (
                <div key={objectId(booking._id)} className="rounded-md border border-slate-100 p-3">
                  <div className="text-sm font-medium text-slate-950">{booking.student?.name || "Student"} with {booking.instructor?.name || "Coach"}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDate(new Date(booking.startAt))} - {booking.status}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)]">
        <SectionTitle icon={Users} title="Student Progress & Performance" subtitle="Homework, classes, attendance, PGN activity, and latest engagement" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3 font-medium">Student</th>
                <th className="px-3 py-3 font-medium">Classes</th>
                <th className="px-3 py-3 font-medium">Homework</th>
                <th className="px-3 py-3 font-medium">Attendance</th>
                <th className="px-3 py-3 font-medium">PGNs</th>
                <th className="px-3 py-3 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {studentRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-950">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.username || "No username"}</div>
                  </td>
                  <td className="px-3 py-3">{row.classes}</td>
                  <td className="px-3 py-3">{row.homework}</td>
                  <td className="px-3 py-3">{row.attendance}%</td>
                  <td className="px-3 py-3">{row.pgns}</td>
                  <td className="px-3 py-3 text-slate-500">{row.lastActivity ? formatTimeAgo(row.lastActivity) : "No activity"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)]">
        <SectionTitle icon={GraduationCap} title="Coach Performance" subtitle="Assigned students, active classes, homework, and attendance sessions" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3 font-medium">Coach</th>
                <th className="px-3 py-3 font-medium">Students</th>
                <th className="px-3 py-3 font-medium">Classes</th>
                <th className="px-3 py-3 font-medium">Homework</th>
                <th className="px-3 py-3 font-medium">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {coachRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 font-medium text-slate-950">{row.name}</td>
                  <td className="px-3 py-3">{compactNumber(row.students)}</td>
                  <td className="px-3 py-3">{compactNumber(row.classes)}</td>
                  <td className="px-3 py-3">{compactNumber(row.homework)}</td>
                  <td className="px-3 py-3">{compactNumber(row.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
