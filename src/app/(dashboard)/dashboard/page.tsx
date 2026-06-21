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
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";
import { StudentReward } from "@/models/ClassroomLive";
import {
  deriveScheduledSessionStatus,
  flattenScheduledSessions,
  formatJoinWindowLabel,
  isJoinWindowOpen,
  isSessionUpcomingLike,
} from "@/lib/classroomSessions";
import { summarizeCoachSessions } from "@/lib/teachingStats";
import JoinScheduledSessionButton from "@/components/classroom/JoinScheduledSessionButton";
import {
  Activity as ActivityIcon,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Flame,
  Gamepad2,
  GraduationCap,
  MessageSquare,
  PlayCircle,
  Search,
  TrendingUp,
  Users,
  Trophy,
  Zap,
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
  summaryMonth?: string;
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

function startOfMonth(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfMonth(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth() + 1, 0);
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

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
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

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
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

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function QuickLinkCard({ href, title, subtitle, icon: Icon }: { href: string; title: string; subtitle: string; icon: any }) {
  return (
    <Link href={href} className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-brand/20 hover:bg-white hover:shadow-lg hover:shadow-brand/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-slate-950">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-brand">
        Open <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

async function computeStudentRank(userId: string) {
  const [students, submissions, rewards] = await Promise.all([
    User.find({ role: "student", isActive: { $ne: false } }).select("_id batches").lean(),
    Submission.find({}).select("student totalScore").lean(),
    StudentReward.find({}).select("student xp coins").lean(),
  ]);

  const rows = students.map((student: any) => {
    const id = objectId(student._id);
    const score = submissions.filter((row: any) => objectId(row.student) === id).reduce((sum: number, row: any) => sum + (row.totalScore || 0), 0);
    const xp = rewards.filter((row: any) => objectId(row.student) === id).reduce((sum: number, row: any) => sum + (row.xp || 0) + (row.coins || 0), 0);
    return { id, batches: (student.batches || []).map(objectId), total: score + xp };
  }).sort((a, b) => b.total - a.total);

  const academyRank = rows.findIndex((row) => row.id === userId) + 1;
  const studentRow = rows.find((row) => row.id === userId);
  const batchPool = rows.filter((row) => row.batches.some((batch: string) => studentRow?.batches.includes(batch)));
  const batchRank = batchPool.sort((a, b) => b.total - a.total).findIndex((row) => row.id === userId) + 1;

  return {
    academyRank: academyRank || "-",
    batchRank: batchRank || "-",
  };
}

function sessionTopic(session: any, classroom: any) {
  return session?.topicName || classroom?.topicName || classroom?.title || "Class session";
}

function isHistoricalSessionStatus(status: string) {
  return ["completed", "missed", "cancelled", "rescheduled"].includes(status);
}

function statusChipClass(status: string) {
  if (status === "completed") return "chip bg-emerald-50 text-emerald-700";
  if (status === "missed") return "chip bg-amber-50 text-amber-700";
  if (status === "cancelled") return "chip bg-rose-50 text-rose-700";
  if (status === "rescheduled") return "chip bg-sky-50 text-sky-700";
  if (status === "ongoing") return "chip bg-emerald-50 text-emerald-700";
  if (status === "join_available") return "chip bg-brand/10 text-brand";
  return "chip";
}

function formatDateTimeLabel(value?: Date | string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function getTeachingSummaryRange(searchParams: DashboardSearchParams) {
  const now = new Date();
  const mode = searchParams.summaryMonth === "last" ? "last" : "current";
  if (mode === "last") {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      mode,
      from: startOfMonth(lastMonthDate),
      to: endOfMonth(lastMonthDate),
      label: formatMonthLabel(lastMonthDate),
    };
  }
  return {
    mode,
    from: startOfMonth(now),
    to: endOfMonth(now),
    label: formatMonthLabel(now),
  };
}

function buildCoachUpcomingSessions(classrooms: any[], now: Date) {
  const seen = new Set<string>();
  return flattenScheduledSessions(classrooms)
    .filter((row) => row.start && isSessionUpcomingLike(deriveScheduledSessionStatus(row.session, now)))
    .filter(({ classroom, session, start }) => {
      const sourceId = String(classroom?.sourceSessionId || "");
      const sessionId = objectId(session?._id);
      const classroomId = objectId(classroom?._id);
      const dedupeKey = sourceId || sessionId || `${classroomId}-${start?.toISOString?.() || ""}-${session?.startTime || ""}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));
}

function coachSessionDayLabel(date: Date, now: Date) {
  const today = startOfDay(now).getTime();
  const target = startOfDay(date).getTime();
  const diff = Math.round((target - today) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short" }).format(date);
}

async function StudentDashboard({ userId }: { userId: string }) {
  const now = new Date();
  const [student, classrooms, homework, submissions, tournaments, rewards, attendance, conversations, messages] = await Promise.all([
    User.findById(userId).populate("batches", "name level").lean(),
    Classroom.find({ students: userId, isActive: { $ne: false } })
      .populate("coach instructor", "name username")
      .populate("batches", "name")
      .lean(),
    Homework.find({ isPublished: true }).sort({ dueAt: 1, createdAt: -1 }).lean(),
    Submission.find({ student: userId }).lean(),
    Tournament.find({
      status: { $in: ["upcoming", "live"] },
      $or: [
        { "access.users": userId },
        { "access.allActiveStudents": true },
        { participants: userId },
      ],
    }).sort({ startAt: 1 }).limit(6).lean(),
    StudentReward.find({ student: userId }).lean(),
    Attendance.find({ "records.student": userId }).lean(),
    AskCoachConversation.find({ $or: [{ student: userId }, { "participants.user": userId }] }).sort({ updatedAt: -1 }).limit(6).lean(),
    AskCoachMessage.find({ receiver: userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const batchIds = ((student as any)?.batches || []).map((batch: any) => objectId(batch));
  const classroomIds = classrooms.map((classroom: any) => objectId(classroom._id));
  const visibleHomework = homework.filter((item: any) =>
    (item.assignedStudents || []).some((studentId: any) => objectId(studentId) === userId) ||
    (item.assignedBatches || []).some((batchId: any) => batchIds.includes(objectId(batchId))) ||
    classroomIds.includes(objectId(item.classroom))
  );
  const upcomingSessions = flattenScheduledSessions(classrooms)
    .filter((row) => row.start && isSessionUpcomingLike(deriveScheduledSessionStatus(row.session, now)))
    .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));
  const completedSessions = flattenScheduledSessions(classrooms)
    .filter((row) => row.start && isHistoricalSessionStatus(deriveScheduledSessionStatus(row.session, now)))
    .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0));
  const nextSession = upcomingSessions[0];
  const activeHomework = visibleHomework.slice(0, 4);
  const totalXp = rewards.reduce((sum: number, reward: any) => sum + (reward.xp || 0), 0);
  const totalCoins = rewards.reduce((sum: number, reward: any) => sum + (reward.coins || 0), 0);
  const totalBadges = rewards.filter((reward: any) => reward.badge).length;
  const totalHomeworkScore = submissions.reduce((sum: number, submission: any) => sum + (submission.totalScore || 0), 0);
  const homeworkCompleted = submissions.length;
  const homeworkCompletion = percent(homeworkCompleted, Math.max(visibleHomework.length, 1));
  const quizAccuracy = Math.round(submissions.reduce((sum: number, submission: any) => sum + (submission.accuracy || 0), 0) / Math.max(submissions.length, 1));
  const attendanceRecords = attendance.flatMap((item: any) => item.records || []).filter((record: any) => objectId(record.student) === userId);
  const attendancePresent = attendanceRecords.filter((record: any) => record.status === "present" || record.status === "late");
  const attendancePct = percent(attendancePresent.length, Math.max(attendanceRecords.length, 1));
  const currentStreak = submissions
    .slice()
    .sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .reduce((streak: number, item: any, index: number, rows: any[]) => {
      if (!index) return 1;
      const diff = Math.round((startOfDay(new Date(rows[index - 1].submittedAt)).getTime() - startOfDay(new Date(item.submittedAt)).getTime()) / DAY);
      return diff === 1 && streak === index ? streak + 1 : streak;
    }, submissions.length ? 1 : 0);
  const unreadCoachReplies = messages.filter((message: any) => !(message.readBy || []).some((entry: any) => objectId(entry.user) === userId)).length;
  const heroSessionOpen = nextSession ? isJoinWindowOpen(nextSession.session, now) : false;
  const studentRank = await computeStudentRank(userId);

  return (
    <div className="space-y-5 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white px-5 py-5 shadow-[0_24px_60px_rgba(90,19,114,0.12)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">Student Workspace</div>
            <h1 className="mt-1 text-3xl font-black text-brand">Welcome back, {(student as any)?.name || "Student"}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Level: <span className="font-semibold text-slate-900">{(student as any)?.batches?.[0]?.level || "Not set"}</span>
              <span className="mx-2 text-slate-300">•</span>
              Batch: <span className="font-semibold text-slate-900">{(student as any)?.batches?.[0]?.name || "Not assigned"}</span>
              <span className="mx-2 text-slate-300">•</span>
              {formatDate(new Date())}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Upcoming Classes" value={upcomingSessions.length} note="Scheduled sessions" icon={Calendar} tone="purple" />
            <StatCard label="Homework" value={activeHomework.length} note="Active assignments" icon={ClipboardList} tone="amber" />
            <StatCard label="XP" value={totalXp} note="Learning points" icon={Zap} tone="blue" />
            <StatCard label="Coins" value={totalCoins} note="Rewards earned" icon={Trophy} tone="green" />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="rounded-[28px] border border-brand/10 bg-[linear-gradient(135deg,rgba(90,19,114,1),rgba(124,31,162,0.92))] p-6 text-white shadow-[0_24px_60px_rgba(90,19,114,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                <BellRing size={14} />
                Featured Activity
              </div>
              <h2 className="mt-4 text-3xl font-black">{nextSession ? sessionTopic(nextSession.session, nextSession.classroom) : "Stay sharp today"}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/80">
                {nextSession
                  ? `${nextSession.classroom.courseName || "General class"} • ${nextSession.classroom.levelName || "Level not set"} • Coach ${(nextSession.classroom.coach as any)?.name || "Assigned coach"}`
                  : "Your next class, homework, tournaments, and training challenges will show up here."}
              </p>
            </div>
            <span className="rounded-full bg-white/12 px-4 py-2 text-sm font-bold text-white/90">
              {nextSession ? formatJoinWindowLabel(nextSession.session, now) : "No class scheduled"}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {nextSession ? (
              <>
                <JoinScheduledSessionButton
                  classroomId={objectId(nextSession.classroom._id)}
                  sessionId={String(nextSession.session._id)}
                  meetingUrl={nextSession.classroom.meetingUrl}
                  className={heroSessionOpen ? "inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-black text-brand shadow-lg shadow-black/20" : "inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white"}
                  label="Join Classroom"
                  disabled={!heroSessionOpen}
                />
                {nextSession.classroom.meetingUrl ? (
                  <a
                    href={nextSession.classroom.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white"
                  >
                    Join Google Meet
                  </a>
                ) : null}
              </>
            ) : (
              <Link href="/square-trainer" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-black text-brand shadow-lg shadow-black/20">
                <Zap size={16} /> Play Square Trainer
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <SectionTitle icon={Trophy} title="Ranking Snapshot" subtitle="Your current academy pulse" />
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label="Batch Rank" value={studentRank.batchRank} />
            <InfoTile label="Academy Rank" value={studentRank.academyRank} />
            <InfoTile label="Badges" value={totalBadges} />
            <InfoTile label="Homework Points" value={totalHomeworkScore} />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            Recent performance: <span className="font-semibold text-slate-900">{quizAccuracy}% accuracy</span> with <span className="font-semibold text-slate-900">{currentStreak} day streak</span>.
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <SectionTitle icon={Calendar} title="Upcoming Classes" subtitle="Join only through your scheduled sessions" />
          <div className="grid gap-3">
            {upcomingSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No upcoming classes yet.</div>
            ) : upcomingSessions.slice(0, 4).map(({ classroom, session }) => {
              const canJoin = isJoinWindowOpen(session, now);
              return (
                <div key={`${classroom._id}-${session._id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-black text-slate-950">{sessionTopic(session, classroom)}</div>
                      <div className="mt-1 text-sm text-slate-600">{classroom.courseName || "General"} • {classroom.levelName || "Not set"} • Coach {(classroom.coach as any)?.name || "Assigned coach"}</div>
                    </div>
                    <span className={canJoin ? "chip bg-emerald-50 text-emerald-700" : "chip"}>{formatJoinWindowLabel(session, now)}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <InfoTile label="Date" value={formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} />
                    <InfoTile label="Time" value={session.startTime || classroom.startTime || "--"} />
                    <InfoTile label="Duration" value={formatDuration(session.durationMinutes || classroom.durationMinutes || 60)} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <JoinScheduledSessionButton
                      classroomId={objectId(classroom._id)}
                      sessionId={String(session._id)}
                      meetingUrl={classroom.meetingUrl}
                      className={canJoin ? "btn-primary" : "btn-outline"}
                      label="Join Classroom"
                      disabled={!canJoin}
                    />
                    {classroom.meetingUrl ? (
                      <a href={classroom.meetingUrl} target="_blank" rel="noreferrer" className="btn-outline">
                        Join Google Meet
                      </a>
                    ) : null}
                    <Link href={`/classrooms/${objectId(classroom._id)}/summary?session=${String(session._id)}`} className="btn-outline">
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
            <SectionTitle icon={ClipboardList} title="Current Homework" subtitle="What needs attention next" />
            <div className="space-y-3">
              {activeHomework.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No active homework right now.</div> : activeHomework.map((item: any) => {
                const submission = submissions.find((row: any) => objectId(row.homework) === objectId(item._id));
                return (
                  <div key={objectId(item._id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-slate-950">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500">Due {item.dueAt ? formatDate(new Date(item.dueAt)) : "Any time"}</div>
                      </div>
                      <span className="chip">{submission ? "Submitted" : "Active"}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-600">{(item.activities || []).length || (item.puzzles || []).length} activity items</div>
                      <Link href={`/homework/${item._id}`} className="btn-outline">{submission ? "View" : "Start"}</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
            <SectionTitle icon={MessageSquare} title="Ask Coach" subtitle="Quick access to support" />
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm text-slate-600">Recent conversations: <span className="font-semibold text-slate-900">{conversations.length}</span></div>
              <div className="mt-2 text-sm text-slate-600">Unread replies: <span className="font-semibold text-slate-900">{unreadCoachReplies}</span></div>
              <Link href="/ask-coach" className="btn-primary mt-4 inline-flex">Open Ask Coach</Link>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)] xl:col-span-2">
          <SectionTitle icon={CheckCircle2} title="Completed Sessions" subtitle="Open past class summaries, attendance, and quiz records" />
          <div className="space-y-3">
            {completedSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 lg:col-span-2">
                Completed classes will appear here once a session is closed.
              </div>
            ) : completedSessions.slice(0, 4).map(({ classroom, session }) => {
              const status = deriveScheduledSessionStatus(session, now);
              return (
                <div key={`completed-${classroom._id}-${session._id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-black text-slate-950">{sessionTopic(session, classroom)}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {classroom.courseName || "General"} • {classroom.levelName || "Not set"} • Coach {(classroom.coach as any)?.name || "Assigned coach"}
                      </div>
                    </div>
                    <span className={statusChipClass(status)}>{formatJoinWindowLabel(session, now)}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <InfoTile label="Date" value={formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} />
                    <InfoTile label="Time" value={session.startTime || classroom.startTime || "--"} />
                    <InfoTile label="Duration" value={formatDuration(session.durationMinutes || classroom.durationMinutes || 60)} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/classrooms/${objectId(classroom._id)}/summary?session=${String(session._id)}`} className="btn-primary">
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <SectionTitle icon={Gamepad2} title="Training Tools" subtitle="Student practice only" />
          <div className="grid gap-3">
            <QuickLinkCard href="/square-trainer" title="Square Trainer" subtitle="Build board vision and earn XP" icon={Zap} />
            <QuickLinkCard href="/play/computer" title="Play vs Computer" subtitle="Practice with a guided engine opponent" icon={PlayCircle} />
            <QuickLinkCard href="/leaderboard" title="Leaderboards" subtitle="Track academy and batch rank" icon={Trophy} />
          </div>
        </section>

        <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <SectionTitle icon={Trophy} title="Tournaments" subtitle="Assigned events only" />
          <div className="space-y-3">
            {tournaments.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No tournaments available right now.</div> : tournaments.slice(0, 3).map((tournament: any) => (
              <div key={objectId(tournament._id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-black text-slate-950">{tournament.name}</div>
                <div className="mt-1 text-sm text-slate-600">{tournament.type === "arena" ? "Arena" : "Swiss"} • {formatDateTimeLabel(tournament.startAt)}</div>
                <div className="mt-3"><Link href={`/tournaments/${tournament._id}`} className="btn-outline">View Details</Link></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <SectionTitle icon={Flame} title="Progress Snapshot" subtitle="A quick read on your momentum" />
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label="Homework" value={`${homeworkCompletion}%`} />
            <InfoTile label="Accuracy" value={`${quizAccuracy}%`} />
            <InfoTile label="Attendance" value={`${attendancePct}%`} />
            <InfoTile label="Streak" value={`${currentStreak} days`} />
            <InfoTile label="Classes Attended" value={attendancePresent.length} />
            <InfoTile label="Badges" value={totalBadges} />
          </div>
        </section>
      </div>
    </div>
  );
}

async function CoachDashboard({ userId, searchParams }: { userId: string; searchParams: DashboardSearchParams }) {
  const now = new Date();
  const summaryRange = getTeachingSummaryRange(searchParams);
  const [classrooms, homework, tournaments] = await Promise.all([
    Classroom.find({
      $or: [{ coach: userId }, { instructor: userId }],
      isActive: { $ne: false },
      isSessionInstance: { $ne: true },
    })
      .populate("students", "name")
      .populate("batches", "name")
      .lean(),
    Homework.find({ instructor: userId }).sort({ dueAt: 1, createdAt: -1 }).limit(6).lean(),
    Tournament.find({ status: { $in: ["upcoming", "live"] } }).sort({ startAt: 1 }).limit(4).lean(),
  ]);

  const sessions = buildCoachUpcomingSessions(classrooms, now);
  const completedSessions = flattenScheduledSessions(classrooms)
    .filter((row) => row.start && isHistoricalSessionStatus(deriveScheduledSessionStatus(row.session, now)))
    .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0));
  const teaching = summarizeCoachSessions(classrooms, { from: summaryRange.from, to: summaryRange.to });
  const sessionsByDay = sessions.reduce((groups, row) => {
    const label = coachSessionDayLabel(row.start as Date, now);
    const bucket = groups.get(label) || [];
    bucket.push(row);
    groups.set(label, bucket);
    return groups;
  }, new Map<string, any[]>());
  const sessionGroups = Array.from(sessionsByDay.entries()) as [string, any[]][];
  const summaryLinks = [
    { mode: "current", label: "Current Month" },
    { mode: "last", label: "Last Month" },
  ];

  return (
    <div className="space-y-5 text-slate-950">
      <section className="rounded-[28px] border border-brand/10 bg-white px-5 py-5 shadow-[0_24px_60px_rgba(90,19,114,0.12)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/70">Coach Workspace</div>
            <h1 className="mt-1 text-3xl font-black text-brand">Teaching Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Your scheduled classes, assigned students, classroom entry points, and teaching hours in one place.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Next Sessions" value={sessions.length} note="Today, tomorrow, and upcoming" icon={Calendar} tone="purple" />
            <StatCard label="Teaching Hours" value={teaching.totalHoursConducted} note={summaryRange.label} icon={BookOpen} tone="blue" />
            <StatCard label="Classes Conducted" value={teaching.classesConducted} note={`${teaching.classesCancelled} cancelled`} icon={ClipboardList} tone="amber" />
            <StatCard label="Students" value={teaching.totalStudentsTaught || new Set(classrooms.flatMap((item: any) => (item.students || []).map((student: any) => objectId(student)))).size} note={`${teaching.attendancePercentage}% completion`} icon={Users} tone="green" />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-50 text-purple-700 shadow-md shadow-purple-900/10">
                <BarChart3 size={16} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Teaching Summary</h2>
                <p className="text-xs text-slate-500">Automatic coaching-hour tracking from completed sessions</p>
                <p className="mt-1 text-xs font-semibold text-brand/70">{summaryRange.label}</p>
              </div>
            </div>
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {summaryLinks.map((link) => {
                const active = summaryRange.mode === link.mode;
                return (
                  <Link
                    key={link.mode}
                    href={`/dashboard?summaryMonth=${link.mode}`}
                    className={active ? "rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white shadow-sm" : "rounded-xl px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-brand"}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label="Total Hours" value={teaching.totalHoursConducted} />
            <InfoTile label="Avg Duration" value={formatDuration(teaching.averageClassDuration || 0)} />
            <InfoTile label="Rescheduled" value={teaching.classesRescheduled} />
            <InfoTile label="Attendance %" value={`${teaching.attendancePercentage}%`} />
          </div>
        </div>

        <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <SectionTitle icon={Users} title="Batch-Wise Teaching Hours" subtitle="Workload split by assigned batch" />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-3 font-medium">Batch</th>
                  <th className="px-3 py-3 font-medium">Classes</th>
                  <th className="px-3 py-3 font-medium">Hours</th>
                  <th className="px-3 py-3 font-medium">Students</th>
                </tr>
              </thead>
              <tbody>
                {teaching.batchRows.length ? teaching.batchRows.map((row) => (
                  <tr key={row.batchName} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-950">{row.batchName}</td>
                    <td className="px-3 py-3">{row.classesConducted}</td>
                    <td className="px-3 py-3">{row.hoursConducted.toFixed(1)}</td>
                    <td className="px-3 py-3">{row.students}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">Teaching hours will appear here once scheduled classes are completed.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
          <SectionTitle icon={Calendar} title="Upcoming Sessions" subtitle="Join the right session at the right time" />
          <div className="space-y-3">
            {sessions.length === 0 ? <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No upcoming classes scheduled.</div> : sessionGroups.slice(0, 4).map(([dayLabel, rows]) => (
              <div key={dayLabel} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm shadow-brand/5">
                  <div>
                    <div className="text-sm font-black text-slate-950">{dayLabel}</div>
                    <div className="text-xs text-slate-500">{rows.length} session{rows.length === 1 ? "" : "s"}</div>
                  </div>
                  <span className="chip bg-brand/10 text-brand">{dayLabel === "Today" ? "Priority" : "Scheduled"}</span>
                </div>
                <div className="space-y-3">
                  {rows.slice(0, 3).map(({ classroom, session }) => {
                    const canJoin = isJoinWindowOpen(session, now);
                    const targetNames = (classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} students`;
                    return (
                      <div key={`${classroom._id}-${session._id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-black text-slate-950">{classroom.title}</div>
                            <div className="mt-1 text-sm text-slate-600">{sessionTopic(session, classroom)} • {targetNames}</div>
                          </div>
                          <span className={canJoin ? "chip bg-emerald-50 text-emerald-700" : "chip"}>{formatJoinWindowLabel(session, now)}</span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <InfoTile label="Date" value={formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} />
                          <InfoTile label="Time" value={session.startTime || classroom.startTime || "--"} />
                          <InfoTile label="Duration" value={formatDuration(session.durationMinutes || classroom.durationMinutes || 60)} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <JoinScheduledSessionButton
                            classroomId={objectId(classroom._id)}
                            sessionId={String(session._id)}
                            meetingUrl={classroom.meetingUrl}
                            className={canJoin ? "btn-primary" : "btn-outline"}
                            label="Join Classroom"
                            disabled={!canJoin}
                          />
                          {classroom.meetingUrl ? (
                            <a href={classroom.meetingUrl} target="_blank" rel="noreferrer" className="btn-outline">
                              Join Google Meet
                            </a>
                          ) : null}
                          <Link href={`/classrooms/${objectId(classroom._id)}/summary?session=${String(session._id)}`} className="btn-outline">
                            View Details
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
            <SectionTitle icon={ClipboardList} title="Homework Queue" subtitle="Published work under your classes" />
            <div className="space-y-3">
              {homework.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No homework assigned yet.</div> : homework.slice(0, 4).map((item: any) => (
                <div key={objectId(item._id)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="font-black text-slate-950">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-600">Due {item.dueAt ? formatDate(new Date(item.dueAt)) : "Any time"}</div>
                  <div className="mt-3"><Link href="/homework" className="btn-outline">Open Homework</Link></div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
            <SectionTitle icon={MessageSquare} title="Coach Tools" subtitle="Quick teaching actions" />
            <div className="grid gap-3">
              <QuickLinkCard href="/ask-coach" title="Ask Coach Inbox" subtitle="Reply to students and batches" icon={MessageSquare} />
              <QuickLinkCard href="/classrooms" title="Teaching Schedule" subtitle="See all scheduled class entries" icon={Calendar} />
              <QuickLinkCard href="/homework" title="Homework" subtitle="Check assignments and submissions" icon={ClipboardList} />
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <SectionTitle icon={CheckCircle2} title="Completed Sessions" subtitle="Review finished classes, attendance, and teaching records" />
        <div className="space-y-3">
          {completedSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 lg:col-span-2">
              Completed teaching sessions will appear here after class ends.
            </div>
          ) : completedSessions.slice(0, 6).map(({ classroom, session }) => {
            const status = deriveScheduledSessionStatus(session, now);
            const targetNames = (classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} students`;
            return (
              <div key={`coach-completed-${classroom._id}-${session._id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-black text-slate-950">{classroom.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{sessionTopic(session, classroom)} • {targetNames}</div>
                  </div>
                  <span className={statusChipClass(status)}>{formatJoinWindowLabel(session, now)}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <InfoTile label="Date" value={formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} />
                  <InfoTile label="Time" value={session.startTime || classroom.startTime || "--"} />
                  <InfoTile label="Duration" value={formatDuration(session.durationMinutes || classroom.durationMinutes || 60)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/classrooms/${objectId(classroom._id)}/summary?session=${String(session._id)}`} className="btn-primary">
                    View Details
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | undefined;

  await dbConnect();

  if (role === "student") return <StudentDashboard userId={userId} />;
  if (role === "instructor") return <CoachDashboard userId={userId} searchParams={searchParams} />;

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
    const teaching = summarizeCoachSessions(coachClasses, { from, to });
    return {
      id: cid,
      name: coach.name,
      students: studentIds.size,
      classes: coachClasses.length,
      homework: coachHomework.length,
      sessions: coachAttendance.length,
      hours: teaching.totalHoursConducted,
      attendancePercentage: teaching.attendancePercentage,
      activeBatches: new Set(coachClasses.flatMap((classroom: any) => (classroom.batches || []).map((batch: any) => batch.name || objectId(batch)))).size,
    };
  });
  const topCoach = coachRows.slice().sort((a, b) => b.hours - a.hours)[0];
  const batchTeachingRows = Array.from(
    classrooms.reduce((map, classroom: any) => {
      const completedSessions = (classroom.generatedSessions || []).filter((session: any) => session.status === "completed" && new Date(session.actualEndedAt || session.scheduledFor) >= from && new Date(session.actualEndedAt || session.scheduledFor) <= to);
      const sessionHours = completedSessions.reduce((sum: number, session: any) => sum + Number(session.teachingMinutes || session.durationMinutes || 0) / 60, 0);
      (classroom.batches || []).forEach((batchId: any) => {
        const batch = batches.find((item: any) => objectId(item._id) === objectId(batchId));
        const key = batch?.name || "Unassigned";
        const current = map.get(key) || { batchName: key, coachName: "", classesConducted: 0, hoursConducted: 0, students: 0 };
        current.coachName = coachRows.find((row) => row.id === objectId(classroom.coach || classroom.instructor))?.name || current.coachName;
        current.classesConducted += completedSessions.length;
        current.hoursConducted += sessionHours;
        current.students = Math.max(current.students, (batch?.students || classroom.students || []).length || 0);
        map.set(key, current);
      });
      return map;
    }, new Map<string, { batchName: string; coachName: string; classesConducted: number; hoursConducted: number; students: number }>())
  ).map(([, value]) => value).sort((a, b) => b.hoursConducted - a.hoursConducted);
  const topBatch = batchTeachingRows[0];
  const totalTeachingHours = coachRows.reduce((sum, row) => sum + row.hours, 0);
  const averageTeachingHours = coachRows.length ? (totalTeachingHours / coachRows.length) : 0;

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
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Teaching Hours" value={totalTeachingHours.toFixed(1)} note="Selected date range" icon={BookOpen} tone="blue" />
          <StatCard label="Top Coach" value={topCoach?.name || "-"} note={`${topCoach?.hours?.toFixed?.(1) || 0} hours`} icon={GraduationCap} tone="purple" />
          <StatCard label="Top Batch" value={topBatch?.batchName || "-"} note={`${topBatch?.hoursConducted?.toFixed?.(1) || 0} hours`} icon={Users} tone="green" />
          <StatCard label="Avg / Coach" value={averageTeachingHours.toFixed(1)} note="Average teaching hours" icon={BarChart3} tone="amber" />
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
          <SectionTitle icon={ActivityIcon} title="Activity Tracker" subtitle="Open the full monitoring center for account, learning, attendance, payment, and PGN activity" />
          <div className="grid gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-950">Recent activity in range</div>
              <div className="mt-1 text-3xl font-black text-brand">{activities.length}</div>
              <div className="mt-1 text-xs text-slate-500">Showing the latest academy activity across the selected filters.</div>
            </div>
            <QuickLinkCard
              href="/admin/activity-tracker"
              title="Open Activity Tracker"
              subtitle="Review logins, classroom actions, homework, payments, PGNs, and admin changes in one place."
              icon={ActivityIcon}
            />
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
                <th className="px-3 py-3 font-medium">Hours</th>
                <th className="px-3 py-3 font-medium">Batches</th>
                <th className="px-3 py-3 font-medium">Attendance %</th>
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
                  <td className="px-3 py-3">{row.hours.toFixed(1)}</td>
                  <td className="px-3 py-3">{compactNumber(row.activeBatches)}</td>
                  <td className="px-3 py-3">{row.attendancePercentage}%</td>
                  <td className="px-3 py-3">{compactNumber(row.homework)}</td>
                  <td className="px-3 py-3">{compactNumber(row.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(90,19,114,0.12)]">
        <SectionTitle icon={Users} title="Batch-Wise Teaching Hours" subtitle="Completed teaching workload per batch" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3 font-medium">Batch</th>
                <th className="px-3 py-3 font-medium">Coach</th>
                <th className="px-3 py-3 font-medium">Classes</th>
                <th className="px-3 py-3 font-medium">Hours</th>
                <th className="px-3 py-3 font-medium">Students</th>
              </tr>
            </thead>
            <tbody>
              {batchTeachingRows.length ? batchTeachingRows.map((row) => (
                <tr key={row.batchName} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 font-medium text-slate-950">{row.batchName}</td>
                  <td className="px-3 py-3">{row.coachName || "-"}</td>
                  <td className="px-3 py-3">{row.classesConducted}</td>
                  <td className="px-3 py-3">{row.hoursConducted.toFixed(1)}</td>
                  <td className="px-3 py-3">{row.students}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No completed scheduled classes in this range yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
