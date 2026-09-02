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
import { ClassroomSession, StudentReward } from "@/models/ClassroomLive";
import {
  deriveScheduledSessionStatus,
  flattenScheduledSessions,
  formatJoinWindowLabel,
  isJoinWindowOpen,
  isSessionUpcomingLike,
} from "@/lib/classroomSessions";
import { effectiveSessionCoachId, summarizeCoachSessions } from "@/lib/teachingStats";
import JoinScheduledSessionButton from "@/components/classroom/JoinScheduledSessionButton";
import FutureClassDetailsButton from "@/components/classroom/FutureClassDetailsButton";
import { DataPanel, EmptyState as CommonEmptyState, FilterBar } from "@/components/common/PageHeader";
import { bookingFeatureNameForAccount } from "@/lib/bookingLabels";
import { demoStudentExperience } from "@/lib/demoStudentExperience";
import { inactiveStudentMessage } from "@/lib/studentAccess";
import { coachClassroomQuery, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { unstable_noStore as noStore } from "next/cache";
import {
  Activity as ActivityIcon,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
  ClipboardList,
  Coins,
  Cpu,
  Crosshair,
  Crown,
  Flame,
  Gamepad2,
  GraduationCap,
  MessageSquare,
  PlayCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Trophy,
  WalletCards,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

type DashboardSearchParams = {
  tab?: string;
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

  if ((preset === "custom" || searchParams.from || searchParams.to) && customFrom && customTo) {
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
    height: Math.max(8, Math.round((point.value / max) * 100)),
  }));
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-700 shadow-sm shadow-purple-900/10">
        <Icon size={15} />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, note, icon: Icon, tone = "purple" }: { label: string; value: string | number; note: string; icon: any; tone?: "purple" | "green" | "amber" | "blue" | "rose" }) {
  const tones = {
    purple: "bg-brand/10 text-brand",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="min-h-[86px] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-brand/10 sm:p-4">
      <div className="flex h-full items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold text-slate-500 sm:text-xs">{label}</div>
          <div className="mt-1 truncate text-xl font-black text-slate-950 sm:text-2xl">{value}</div>
          <div className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">{note}</div>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tones[tone]} sm:h-11 sm:w-11`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function MiniBarChart({ points, barClassName }: { points: Array<{ label: string; value: number; height: number }>; barClassName: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl bg-slate-50 px-3 py-3 shadow-inner shadow-slate-200/60">
      <div className="flex h-24 max-h-24 items-end gap-1 overflow-hidden sm:h-28 sm:max-h-28">
        {points.map((point) => (
          <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <div
              className={`w-full max-w-4 rounded-t ${barClassName}`}
              style={{ height: `${point.height}%`, maxHeight: "100%" }}
              title={`${point.label}: ${point.value}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 hidden min-w-0 grid-cols-[repeat(auto-fit,minmax(16px,1fr))] gap-1 sm:grid">
        {points.map((point) => (
          <span key={point.label} className="truncate text-center text-[10px] text-slate-500" title={point.label}>
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/75 px-3 py-2 shadow-sm shadow-slate-950/5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-slate-950" title={String(value)}>{value}</div>
    </div>
  );
}

function QuickLinkCard({ href, title, subtitle, icon: Icon }: { href: string; title: string; subtitle: string; icon: any }) {
  return (
    <Link href={href} className="group flex min-h-[116px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-3 text-center shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-brand/10">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
        <Icon size={18} />
      </span>
      <div className="mt-2 text-xs font-black leading-tight text-slate-950 sm:text-sm">{title}</div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500 sm:text-xs">{subtitle}</div>
    </Link>
  );
}

function StudentCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.07)] transition sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

function StudentSectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: any;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand ring-1 ring-brand/10">
          <Icon size={16} aria-hidden="true" />
        </span>
        <h2 className="truncate text-sm font-black text-slate-950 sm:text-base">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function StudentTextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand transition hover:text-brand-700 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {children}
      <ArrowRight size={13} aria-hidden="true" />
    </Link>
  );
}

function StudentStatLink({
  href,
  label,
  value,
  note,
  icon: Icon,
}: {
  href: string;
  label: string;
  value: string | number;
  note: string;
  icon: any;
}) {
  return (
    <Link href={href} className="group flex min-h-[76px] items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg hover:shadow-brand-900/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-black leading-none text-slate-950">{value}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">{note}</p>
      </div>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand ring-1 ring-brand/10 transition group-hover:bg-brand group-hover:text-white">
        <Icon size={17} aria-hidden="true" />
      </span>
    </Link>
  );
}

function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "brand" }) {
  const styles = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    brand: "bg-brand-50 text-brand ring-brand/15",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ring-1 ${styles[tone]}`}>{children}</span>;
}

function StudentProgressBar({ label, value }: { label: string; value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{normalized}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={normalized} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
}

function homeworkStatus(item: any, submission: any, now: Date) {
  if (submission) return { label: "Completed", tone: "success" as const };
  if (!item.dueAt) return { label: "Pending", tone: "warning" as const };
  const due = new Date(item.dueAt);
  if (due.getTime() < now.getTime()) return { label: "Late", tone: "danger" as const };
  if (due.getTime() - now.getTime() <= DAY) return { label: "Due Soon", tone: "warning" as const };
  return { label: "Pending", tone: "brand" as const };
}

function DashboardHero({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: React.ReactNode;
  icon: any;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-brand via-purple-800 to-brand-900 p-4 text-white shadow-[0_18px_44px_rgba(90,19,114,0.22)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-accent">
              <Icon size={14} />
              {eyebrow}
            </div>
            <h1 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">{title}</h1>
            <div className="mt-2 max-w-3xl text-sm leading-6 text-white/80">{subtitle}</div>
          </div>
          <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-accent sm:grid">
            <Icon size={22} />
          </span>
        </div>
      </section>
      {children && (
        <section className="rounded-2xl border border-brand/10 bg-white p-3 text-slate-950 shadow-[0_12px_32px_rgba(90,19,114,0.08)]">
          {children}
        </section>
      )}
    </div>
  );
}

function DashboardPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <DataPanel className={className}>{children}</DataPanel>;
}

function DemoPreviewBadge() {
  return <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">Demo Preview</span>;
}

function DemoPreviewPanel({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Icon size={18} />
          </span>
          <div>
            <div className="font-black text-slate-950">{title}</div>
            <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
          </div>
        </div>
        <DemoPreviewBadge />
      </div>
      {children}
    </section>
  );
}

function DemoStudentDashboard({
  studentName,
  bookingFeatureName,
  demoUsage,
  demoLimits,
}: {
  studentName?: string;
  bookingFeatureName: string;
  demoUsage: Record<string, number>;
  demoLimits: Record<string, number>;
}) {
  return (
    <div className="space-y-5 text-slate-950">
      <section className="rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,#fff8d8_0%,#fff4c1_45%,#ffffff_100%)] px-5 py-5 shadow-[0_24px_60px_rgba(196,151,0,0.16)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-brand shadow-sm">
              <GraduationCap size={14} /> Demo Student Experience
            </div>
            <h1 className="mt-3 text-3xl font-black text-slate-950">Explore how the LMS works after enrollment</h1>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Welcome{studentName ? `, ${studentName}` : ""}. This account shows a guided walkthrough of the full student journey using clearly marked sample data. Nothing in these preview sections affects live classes, homework, attendance, reports, or academy records.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/booking" className="btn-primary">Open {bookingFeatureName}</Link>
              <Link href="/play/computer" className="btn-outline bg-white">Try Computer Practice</Link>
              <Link href="/play/tactics-trainer" className="btn-outline bg-white">Try Tactics Trainer</Link>
              <Link href="/play/king-hunt" className="btn-outline bg-white">Try King Hunt</Link>
              <Link href="/play/square-trainer" className="btn-outline bg-white">Try Square Trainer</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[520px]">
            <StatCard label="Upcoming Classes" value={demoStudentExperience.stats.upcomingClasses} note="Sample schedule" icon={Calendar} tone="purple" />
            <StatCard label="Homework" value={demoStudentExperience.stats.homework} note="Sample assignments" icon={ClipboardList} tone="amber" />
            <StatCard label="Attendance" value={demoStudentExperience.stats.attendance} note="Demo report" icon={CheckCircle2} tone="green" />
            <StatCard label="Credits" value={demoStudentExperience.stats.credits} note="Sample balance" icon={WalletCards} tone="blue" />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionTitle icon={BellRing} title="Guided Walkthrough" subtitle="A simple tour of what enrolled students and parents will experience" />
          <DemoPreviewBadge />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {demoStudentExperience.steps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-sm font-black text-white">{index + 1}</div>
              <div className="mt-3 font-black text-slate-950">{step.title}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-brand/10 bg-white p-5 shadow-[0_20px_50px_rgba(90,19,114,0.10)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionTitle icon={Gamepad2} title="Practice Access" subtitle="These live tools are available in the demo account right now" />
          <DemoPreviewBadge />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-black text-slate-950">Play vs Computer</div>
            <div className="mt-1 text-xs text-slate-500">Hands-on practice with the guided engine</div>
            <div className="mt-3 text-sm font-semibold text-slate-800">{demoUsage.playComputer || 0}/{demoLimits.playComputer || 0} used</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-black text-slate-950">Square Trainer</div>
            <div className="mt-1 text-xs text-slate-500">Board vision drills with XP</div>
            <div className="mt-3 text-sm font-semibold text-slate-800">{demoUsage.squareTrainer || 0}/{demoLimits.squareTrainer || 0} used</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-black text-slate-950">Tactics Trainer</div>
            <div className="mt-1 text-xs text-slate-500">Puzzle solving flow and rewards</div>
            <div className="mt-3 text-sm font-semibold text-slate-800">{demoUsage.tacticsTrainer || 0}/{demoLimits.tacticsTrainer || 0} used</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-black text-slate-950">King Hunt</div>
            <div className="mt-1 text-xs text-slate-500">Checkmate practice challenges</div>
            <div className="mt-3 text-sm font-semibold text-slate-800">{demoUsage.kingHunt || 0}/{demoLimits.kingHunt || 3} used</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-black text-slate-950">Demo Booking</div>
            <div className="mt-1 text-xs text-slate-500">Request a live trial class with the academy</div>
            <div className="mt-3 text-sm font-semibold text-slate-800">Ready any time</div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <DemoPreviewPanel title="Upcoming Classes" subtitle="How a student's live schedule appears after enrollment" icon={Calendar}>
          <div className="space-y-3">
            {demoStudentExperience.upcomingClasses.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.coach} - {item.format}</div>
                  </div>
                  <span className="chip bg-brand/10 text-brand">{item.status}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <InfoTile label="Date" value={item.dateLabel} />
                  <InfoTile label="Time" value={item.timeLabel} />
                  <InfoTile label="Format" value="Join Classroom" />
                </div>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Homework" subtitle="Assigned work, due dates, and coach follow-up" icon={ClipboardList}>
          <div className="space-y-3">
            {demoStudentExperience.homework.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.dueLabel}</div>
                  </div>
                  <span className="chip">{item.status}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <InfoTile label="Activity Items" value={item.items} />
                  <InfoTile label="Sample Outcome" value={item.score} />
                </div>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Attendance" subtitle="Parents and students can track consistency and punctuality" icon={CheckCircle2}>
          <div className="grid gap-3 sm:grid-cols-3">
            {demoStudentExperience.attendance.map((item) => (
              <InfoTile key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Calendar" subtitle="Classes, homework, and tournament reminders in one view" icon={Calendar}>
          <div className="grid gap-3 sm:grid-cols-2">
            {demoStudentExperience.calendar.map((item) => (
              <div key={`${item.day}-${item.title}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand">{item.day}</div>
                <div className="mt-1 font-semibold text-slate-950">{item.title}</div>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Progress Reports" subtitle="The kind of summary parents receive after steady learning" icon={BarChart3}>
          <div className="grid gap-3 sm:grid-cols-2">
            {demoStudentExperience.progress.map((item) => (
              <InfoTile key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Leaderboards" subtitle="Friendly competition through XP, coins, and badges" icon={Trophy}>
          <div className="space-y-3">
            {demoStudentExperience.leaderboard.map((item) => (
              <div key={`${item.rank}-${item.name}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-black text-slate-950">{item.name}</div>
                  <div className="text-sm text-slate-500">{item.detail}</div>
                </div>
                <span className="chip bg-amber-50 text-amber-700">{item.rank}</span>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Tournaments" subtitle="Students can discover upcoming academy events and formats" icon={Trophy}>
          <div className="space-y-3">
            {demoStudentExperience.tournaments.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-black text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.detail}</div>
                <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-brand">{item.status}</div>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Credits & Payments" subtitle="A preview of how students track credits, plans, and invoices" icon={WalletCards}>
          <div className="grid gap-3 sm:grid-cols-3">
            {demoStudentExperience.credits.map((item) => (
              <InfoTile key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Ask Coach" subtitle="Private guidance threads remain visible in the full student experience" icon={MessageSquare}>
          <div className="space-y-3">
            {demoStudentExperience.askCoach.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-black text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.reply}</div>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Class History" subtitle="Completed sessions, summaries, and follow-up records" icon={BookOpen}>
          <div className="space-y-3">
            {demoStudentExperience.classHistory.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-black text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.detail}</div>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>

        <DemoPreviewPanel title="Certificates" subtitle="Milestones and achievement badges students may unlock" icon={GraduationCap}>
          <div className="space-y-3">
            {demoStudentExperience.certificates.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-black text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.detail}</div>
              </div>
            ))}
          </div>
        </DemoPreviewPanel>
      </div>
    </div>
  );
}

function InactiveAccountDashboard({ userName, role }: { userName?: string | null; role?: string }) {
  const roleLabel = role === "instructor" ? "Coach" : role === "student" ? "Student" : "Account";
  const message = role === "student"
    ? inactiveStudentMessage
    : "Your account is currently inactive. You can log in and view your profile, but class-related features are paused until the academy reactivates your account.";
  return (
    <div className="space-y-5 text-slate-950">
      <DashboardHero
        eyebrow={`${roleLabel} Status`}
        title={`Account inactive${userName ? `, ${userName}` : ""}`}
        subtitle={message}
        icon={ShieldCheck}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Portal Login" value="Allowed" note="You can still sign in" icon={UserCheck} tone="green" />
          <StatCard label="Classes & Booking" value="Paused" note="No class access or booking" icon={Calendar} tone="rose" />
          <StatCard label="Class tools" value="Paused" note="Class-related access is disabled" icon={Trophy} tone="amber" />
        </div>
      </DashboardHero>
      <DashboardPanel>
        <SectionTitle icon={BellRing} title="What this means" subtitle="Academy access is paused, but your account remains available." />
        <div className="grid gap-3 md:grid-cols-3">
          <InfoTile label="Can login" value="Yes" />
          <InfoTile label="Can book classes" value="No" />
          <InfoTile label="Can join tournaments" value="No" />
        </div>
      </DashboardPanel>
    </div>
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

function canJoinScheduledSession(session: any, now = new Date()) {
  const status = deriveScheduledSessionStatus(session, now);
  return status === "join_available" || status === "ongoing" || isJoinWindowOpen(session, now);
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

async function StudentDashboard({ userId, joinAllowed }: { userId: string; joinAllowed: boolean }) {
  const now = new Date();
  const [student, classrooms, homework, submissions, tournaments, rewards, attendance, conversations, messages, studentInvoices] = await Promise.all([
    User.findById(userId).populate("batches", "name level").lean(),
    Classroom.find({ students: userId, isActive: { $ne: false }, isSessionInstance: { $ne: true } })
      .populate("coach instructor", "name username")
      .populate("generatedSessions.substituteCoach", "name username")
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
    Invoice.find({ student: userId, status: { $in: ["draft", "unpaid", "overdue"] } }).sort({ dueDate: 1 }).limit(6).lean(),
  ]);

  if ((student as any)?.isActive === false) {
    return <InactiveAccountDashboard userName={(student as any)?.name || "Student"} role="student" />;
  }

  const batchIds = ((student as any)?.batches || []).map((batch: any) => objectId(batch));
  const classroomIds = classrooms.map((classroom: any) => objectId(classroom._id));
  const visibleHomework = homework.filter((item: any) =>
    (item.assignedStudents || []).some((studentId: any) => objectId(studentId) === userId) ||
    (item.assignedBatches || []).some((batchId: any) => batchIds.includes(objectId(batchId))) ||
    classroomIds.includes(objectId(item.classroom))
  );
  const upcomingSessions = buildCoachUpcomingSessions(classrooms, now);
  const completedSessions = flattenScheduledSessions(classrooms)
    .filter((row) => row.start && isHistoricalSessionStatus(deriveScheduledSessionStatus(row.session, now)))
    .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0));
  const nextSession = upcomingSessions[0];
  const activeHomework = visibleHomework.slice(0, 4);
  const pendingHomework = visibleHomework.filter((item: any) => !submissions.some((submission: any) => objectId(submission.homework) === objectId(item._id)));
  const feesDue = studentInvoices.reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
  const totalXp = rewards.reduce((sum: number, reward: any) => sum + (reward.xp || 0), 0);
  const totalCoins = rewards.reduce((sum: number, reward: any) => sum + (reward.coins || 0), 0);
  const totalBadges = rewards.filter((reward: any) => reward.badge).length;
  const totalHomeworkScore = submissions.reduce((sum: number, submission: any) => sum + (submission.totalScore || 0), 0);
  const homeworkCompleted = submissions.length;
  const homeworkCompletion = percent(homeworkCompleted, Math.max(visibleHomework.length, 1));
  const quizAccuracy = Math.round(submissions.reduce((sum: number, submission: any) => sum + (submission.accuracy || 0), 0) / Math.max(submissions.length, 1));
  const validAttendance = attendance.filter((item: any) => classroomIds.includes(objectId(item.classroom)));
  const attendanceRecords = validAttendance.flatMap((item: any) => item.records || []).filter((record: any) => objectId(record.student) === userId);
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
  const heroSessionOpen = nextSession ? joinAllowed && canJoinScheduledSession(nextSession.session, now) : false;
  const studentRank = await computeStudentRank(userId);
  const isDemoAccount = (student as any)?.accountStatus === "demo";
  const bookingFeatureName = bookingFeatureNameForAccount((student as any)?.accountStatus);
  const demoUsage = (student as any)?.demoUsage || {};
  const demoLimits = (student as any)?.demoLimits || {};
  if (isDemoAccount) {
    return (
      <DemoStudentDashboard
        studentName={(student as any)?.name || "Student"}
        bookingFeatureName={bookingFeatureName}
        demoUsage={demoUsage}
        demoLimits={demoLimits}
      />
    );
  }

  const studentName = (student as any)?.name || "Student";
  const primaryBatch = (student as any)?.batches?.[0];
  const currentCourse = nextSession?.classroom?.courseName || classrooms[0]?.courseName || "Chess Foundations";
  const currentLevel = primaryBatch?.level || nextSession?.classroom?.levelName || "Level not set";
  const batchName = primaryBatch?.name || nextSession?.classroom?.batches?.[0]?.name || "Batch not assigned";
  const classroomById = new Map(classrooms.map((classroom: any) => [objectId(classroom._id), classroom]));
  const homeworkItems = visibleHomework.slice(0, 3);
  const nextTournament = tournaments[0];
  const classSoon = nextSession?.start ? nextSession.start.getTime() - now.getTime() <= 30 * 60 * 1000 : false;
  const pendingDueSoon = pendingHomework.find((item: any) => item.dueAt && new Date(item.dueAt).getTime() - now.getTime() <= DAY);
  const tournamentSoon = nextTournament?.startAt ? new Date(nextTournament.startAt).getTime() - now.getTime() <= 3 * DAY : false;
  const levelProgress = Math.min(100, Math.max(18, totalXp % 1000 ? Math.round((totalXp % 1000) / 10) : totalXp ? 100 : 18));
  const continueLearning =
    nextSession && (heroSessionOpen || classSoon)
      ? {
          tone: "Class soon",
          title: sessionTopic(nextSession.session, nextSession.classroom),
          text: `${nextSession.classroom.courseName || "Class"} with coach ${nextSession.session?.substituteCoach?.name || (nextSession.classroom.coach as any)?.name || "Assigned coach"}`,
          meta: formatJoinWindowLabel(nextSession.session, now),
          kind: "class" as const,
        }
      : pendingDueSoon || pendingHomework[0]
        ? {
            tone: pendingDueSoon ? "Due soon" : "Homework pending",
            title: (pendingDueSoon || pendingHomework[0]).title,
            text: "Finish the assignment while the lesson is still fresh.",
            meta: (pendingDueSoon || pendingHomework[0]).dueAt ? `Due ${formatDate(new Date((pendingDueSoon || pendingHomework[0]).dueAt))}` : "No due date",
            kind: "homework" as const,
            href: `/homework/${objectId((pendingDueSoon || pendingHomework[0])._id)}`,
          }
        : tournamentSoon
          ? {
              tone: "Tournament",
              title: nextTournament.name,
              text: "Review the format and be ready before pairings open.",
              meta: formatDateTimeLabel(nextTournament.startAt),
              kind: "tournament" as const,
              href: `/tournaments/${objectId(nextTournament._id)}`,
            }
          : {
              tone: "Practice",
              title: "Practice Tactics",
              text: "Build calculation speed with a short focused puzzle session.",
              meta: currentStreak ? `${currentStreak} day streak` : "Ready when you are",
              kind: "practice" as const,
              href: "/play/tactics-trainer",
            };
  const nextMilestone = totalXp ? Math.ceil(totalXp / 1000) * 1000 : 1000;
  const xpToNext = Math.max(0, nextMilestone - totalXp);
  const engagementScore = Math.round((homeworkCompletion + quizAccuracy + attendancePct) / 3);
  const coachName = nextSession?.session?.substituteCoach?.name || (nextSession?.classroom?.coach as any)?.name || "Assigned coach";

  return (
    <div className="space-y-5 text-slate-950">
      <section className="overflow-hidden rounded-lg border border-brand/10 bg-[linear-gradient(135deg,#ffffff_0%,#faf8ff_48%,#f5f1ff_100%)] shadow-[0_24px_70px_rgba(37,24,73,0.10)]">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5 xl:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand">
              <span className="rounded-lg bg-white px-3 py-1 shadow-sm ring-1 ring-brand/10">Student Dashboard</span>
              <span className="rounded-lg bg-accent/30 px-3 py-1 text-brand-900 ring-1 ring-accent/40">{currentCourse}</span>
            </div>
            <h1 className="mt-4 max-w-3xl text-2xl font-black leading-tight tracking-normal text-slate-950 sm:text-3xl">
              Welcome back, {studentName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{currentLevel} • {batchName} • Coach {coachName}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <StudentStatLink href="/classrooms" label="Classes" value={upcomingSessions.length} note={nextSession ? formatJoinWindowLabel(nextSession.session, now) : "Calendar clear"} icon={Calendar} />
              <StudentStatLink href="/homework" label="Pending" value={pendingHomework.length} note={`${homeworkCompletion}% homework done`} icon={ClipboardList} />
              <StudentStatLink href="/leaderboard" label="Rewards" value={totalXp} note={`${totalCoins} coins • ${totalBadges} badges`} icon={Zap} />
            </div>
          </div>

          <div className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-[0_18px_46px_rgba(37,24,73,0.10)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Level progress</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{levelProgress}%</p>
              </div>
              <Link href="/ask-coach" className="btn-outline bg-white">
                <MessageSquare size={15} aria-hidden="true" />
                Ask Coach{unreadCoachReplies ? ` (${unreadCoachReplies})` : ""}
              </Link>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${levelProgress}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <InfoTile label="Rank" value={`#${studentRank.academyRank}`} />
              <InfoTile label="Streak" value={`${currentStreak}d`} />
              <InfoTile label="Next" value={`${xpToNext} XP`} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-lg border border-brand/15 bg-[linear-gradient(135deg,#3b0c53_0%,#651587_58%,#2b0a3f_100%)] p-5 text-white shadow-[0_24px_64px_rgba(90,19,114,0.24)] sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-black text-accent ring-1 ring-white/10">
                  <BellRing size={13} aria-hidden="true" />
                  {continueLearning.tone}
                </span>
                <h2 className="mt-3 max-w-2xl text-2xl font-black leading-tight text-white sm:text-3xl">{continueLearning.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">{continueLearning.text}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/10">
                    <Clock3 size={14} aria-hidden="true" />
                    {continueLearning.meta}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/10">
                    <Flame size={14} aria-hidden="true" />
                    {engagementScore}% training pulse
                  </span>
                </div>
              </div>
              <div className="shrink-0">
                {continueLearning.kind === "class" && nextSession ? (
                  <JoinScheduledSessionButton
                    classroomId={objectId(nextSession.classroom._id)}
                    sessionId={String(nextSession.session._id)}
                    meetingUrl={nextSession.classroom.meetingUrl}
                    className="btn-outline w-full justify-center border-white/20 bg-white/10 text-white hover:bg-white/15 sm:w-auto"
                    availableClassName="btn-accent w-full justify-center sm:w-auto"
                    unavailableClassName="btn-outline w-full justify-center border-white/20 bg-white/10 text-white hover:bg-white/15 sm:w-auto"
                    label="Join Classroom"
                    unavailableLabel="View Class"
                    disabled={!joinAllowed}
                    icon={<PlayCircle size={16} />}
                    scheduledFor={nextSession.session.scheduledFor || nextSession.classroom.classDate || nextSession.classroom.startDate}
                    startTime={nextSession.session.startTime || nextSession.classroom.startTime}
                    durationMinutes={nextSession.session.durationMinutes || nextSession.classroom.durationMinutes || 60}
                  />
                ) : (
                  <Link href={continueLearning.href || "/play/tactics-trainer"} className="btn-accent w-full justify-center sm:w-auto">
                    {continueLearning.kind === "homework" ? <ClipboardList size={16} aria-hidden="true" /> : continueLearning.kind === "tournament" ? <Trophy size={16} aria-hidden="true" /> : <Target size={16} aria-hidden="true" />}
                    {continueLearning.kind === "homework" ? "Continue Homework" : continueLearning.kind === "tournament" ? "View Tournament" : "Practice Tactics"}
                  </Link>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <StudentCard className="min-h-[220px]">
              <StudentSectionHeader icon={Calendar} title="Next Class" action={<StudentTextLink href="/calendar">Calendar</StudentTextLink>} />
              {nextSession ? (
                <div className="flex h-full flex-col justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-black text-slate-950">{sessionTopic(nextSession.session, nextSession.classroom)}</h3>
                      <StatusBadge tone={heroSessionOpen ? "success" : "brand"}>{formatJoinWindowLabel(nextSession.session, now)}</StatusBadge>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {nextSession.classroom.courseName || "General"} • {batchName}
                    </p>
                  </div>
                  <dl className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
                    <InfoTile label="Date" value={formatDate(String(nextSession.session.scheduledFor || nextSession.classroom.classDate || nextSession.classroom.startDate || ""))} />
                    <InfoTile label="Time" value={nextSession.session.startTime || nextSession.classroom.startTime || "--"} />
                    <InfoTile label="Duration" value={formatDuration(nextSession.session.durationMinutes || nextSession.classroom.durationMinutes || 60)} />
                  </dl>
                  <JoinScheduledSessionButton
                    classroomId={objectId(nextSession.classroom._id)}
                    sessionId={String(nextSession.session._id)}
                    meetingUrl={nextSession.classroom.meetingUrl}
                    className="btn-outline w-full justify-center"
                    availableClassName="btn-primary w-full justify-center"
                    unavailableClassName="btn-outline w-full justify-center"
                    label="Join Classroom"
                    disabled={!joinAllowed}
                    scheduledFor={nextSession.session.scheduledFor || nextSession.classroom.classDate || nextSession.classroom.startDate}
                    startTime={nextSession.session.startTime || nextSession.classroom.startTime}
                    durationMinutes={nextSession.session.durationMinutes || nextSession.classroom.durationMinutes || 60}
                  />
                </div>
              ) : (
                <div className="flex min-h-32 items-center rounded-lg bg-slate-50 px-4 py-4 text-sm text-slate-600">No upcoming classes scheduled.</div>
              )}
            </StudentCard>

            <StudentCard className="min-h-[220px]">
              <StudentSectionHeader icon={Flame} title="Progress Snapshot" action={<StudentTextLink href="/leaderboard">Details</StudentTextLink>} />
              <div className="grid grid-cols-2 gap-2">
                <InfoTile label="XP" value={totalXp} />
                <InfoTile label="Coins" value={totalCoins} />
                <InfoTile label="Badges" value={totalBadges} />
                <InfoTile label="Score" value={totalHomeworkScore} />
              </div>
              <div className="mt-4 space-y-3">
                <StudentProgressBar label="Homework accuracy" value={quizAccuracy} />
                <StudentProgressBar label="Attendance" value={attendancePct} />
              </div>
            </StudentCard>
          </div>

          <StudentCard>
            <StudentSectionHeader icon={ClipboardList} title="Homework" action={<StudentTextLink href="/homework">View All Homework</StudentTextLink>} />
            <div className="grid gap-2">
              {homeworkItems.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-4 py-4 text-sm text-slate-600">No homework right now. You&apos;re all caught up!</p>
              ) : homeworkItems.map((item: any) => {
                const submission = submissions.find((row: any) => objectId(row.homework) === objectId(item._id));
                const status = homeworkStatus(item, submission, now);
                const classroom = classroomById.get(objectId(item.classroom));
                const itemCount = (item.activities || []).length || (item.puzzles || []).length || 1;
                const progress = submission ? 100 : 0;
                return (
                  <Link key={objectId(item._id)} href={`/homework/${objectId(item._id)}`} className="group grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-md hover:shadow-brand-900/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{item.title}</h3>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{classroom?.courseName || currentCourse} • Due {item.dueAt ? formatDate(new Date(item.dueAt)) : "Any time"}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 sm:block sm:text-center">
                      <span>{submission ? "Submitted" : `${itemCount} tasks`}</span>
                      <div className="mt-0 h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:mx-auto sm:mt-2">
                        <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </StudentCard>
        </div>

        <aside className="space-y-5">
          <StudentCard>
            <StudentSectionHeader icon={BarChart3} title="Training Pulse" action={<StudentTextLink href="/leaderboard">Leaderboard</StudentTextLink>} />
            <div className="rounded-lg bg-brand px-4 py-4 text-white">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-accent">Overall readiness</p>
                  <p className="mt-2 text-3xl font-black">{engagementScore}%</p>
                </div>
                <StatusBadge tone={engagementScore >= 75 ? "success" : engagementScore >= 45 ? "warning" : "brand"}>{engagementScore >= 75 ? "Strong" : engagementScore >= 45 ? "Building" : "Needs focus"}</StatusBadge>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${engagementScore}%` }} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoTile label="Current Level" value={currentLevel} />
              <InfoTile label="Rank" value={`#${studentRank.academyRank}`} />
              <InfoTile label="Streak" value={`${currentStreak} days`} />
              <InfoTile label="Coach Chats" value={conversations.length} />
            </div>
            <div className="mt-4 space-y-3">
              <StudentProgressBar label="Homework completed" value={homeworkCompletion} />
              <StudentProgressBar label="Homework accuracy" value={quizAccuracy} />
              <StudentProgressBar label="Attendance" value={attendancePct} />
            </div>
          </StudentCard>

          <StudentCard>
            <StudentSectionHeader icon={Gamepad2} title="Practice & Improve" />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { href: "/play/tactics-trainer", title: "Tactics", subtitle: "Sharpen your calculation", icon: Target },
                { href: "/play/square-trainer", title: "Square Trainer", subtitle: "Improve board vision", icon: Crosshair },
                { href: "/play/king-hunt", title: "King Hunt", subtitle: "Build pattern recognition", icon: Crown },
                { href: "/play/computer", title: "Play vs Computer", subtitle: "Test your skills", icon: Cpu },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="group flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white hover:shadow-md hover:shadow-brand-900/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand ring-1 ring-slate-200 transition group-hover:bg-brand group-hover:text-white">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-950">{item.title}</span>
                      <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </StudentCard>

          <StudentCard>
            <StudentSectionHeader icon={Trophy} title="Tournaments" action={<StudentTextLink href="/tournaments">View All</StudentTextLink>} />
            {nextTournament ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-950">{nextTournament.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{nextTournament.type === "arena" ? "Arena" : "Swiss"} • {formatDateTimeLabel(nextTournament.startAt)}</p>
                  </div>
                  <StatusBadge tone={nextTournament.status === "live" ? "success" : "brand"}>{nextTournament.status === "live" ? "Live" : "Open"}</StatusBadge>
                </div>
                <Link href={`/tournaments/${objectId(nextTournament._id)}`} className="btn-outline mt-3 w-full">View Tournament</Link>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">No tournaments scheduled. We&apos;ll let you know when registration opens.</p>
            )}
          </StudentCard>

          <StudentCard>
            <StudentSectionHeader icon={CheckCircle2} title="Recent Sessions" action={<StudentTextLink href="/classrooms">View Class History</StudentTextLink>} />
            <div className="space-y-2">
              {completedSessions.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">Completed sessions will appear here after a class is closed.</p>
              ) : completedSessions.slice(0, 3).map(({ classroom, session }) => (
                <Link key={`recent-${classroom._id}-${session._id}`} href={`/classrooms/${objectId(classroom._id)}/summary?session=${String(session._id)}`} className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <div className="truncate text-sm font-semibold text-slate-950">{sessionTopic(session, classroom)}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDate(String(session.scheduledFor || classroom.classDate || classroom.startDate || ""))} • {classroom.courseName || "General"}</div>
                </Link>
              ))}
            </div>
          </StudentCard>
        </aside>
      </div>
    </div>
  );
}

async function CoachDashboard({ userId, searchParams, joinAllowed }: { userId: string; searchParams: DashboardSearchParams; joinAllowed: boolean }) {
  const now = new Date();
  const summaryRange = getTeachingSummaryRange(searchParams);
  const [classroomDocs, homework, tournaments] = await Promise.all([
    Classroom.find({
      ...coachClassroomQuery(userId),
      isActive: { $ne: false },
      isSessionInstance: { $ne: true },
    })
      .populate("coach instructor", "name username email")
      .populate("generatedSessions.substituteCoach", "name username email")
      .populate("students", "name username email")
      .populate("batches", "name")
      .lean(),
    Homework.find({ instructor: userId }).sort({ dueAt: 1, createdAt: -1 }).limit(6).lean(),
    Tournament.find({ status: { $in: ["upcoming", "live"] } }).sort({ startAt: 1 }).limit(4).lean(),
  ]);
  const classrooms = classroomDocs.map((classroom: any) => limitClassroomToCoachSessions(classroom, userId));

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
      <DashboardHero
        eyebrow="Teacher Workspace"
        title="Teaching Dashboard"
        subtitle="Scheduled classes, assigned students, classroom entry points, and teaching hours in one clean view."
        icon={BookOpen}
      >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Next Sessions" value={sessions.length} note="Today, tomorrow, and upcoming" icon={Calendar} tone="purple" />
            <StatCard label="Teaching Hours" value={teaching.totalHoursConducted.toFixed(2)} note={summaryRange.label} icon={BookOpen} tone="blue" />
            <StatCard label="Classes Conducted" value={teaching.classesConducted} note={`${teaching.classesCancelled} cancelled`} icon={ClipboardList} tone="amber" />
            <StatCard label="Students" value={teaching.totalStudentsTaught || new Set(classrooms.flatMap((item: any) => (item.students || []).map((student: any) => objectId(student)))).size} note={`${teaching.attendancePercentage}% completion`} icon={Users} tone="green" />
          </div>
      </DashboardHero>

      <section className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_12px_32px_rgba(90,19,114,0.08)]">
        <SectionTitle icon={Zap} title="Quick Actions" subtitle="Fast coach tasks without digging through menus" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickLinkCard href="/classrooms" title="Classes" subtitle={`${sessions.length} upcoming`} icon={Calendar} />
          <QuickLinkCard href="/classrooms" title="Students" subtitle={`${teaching.totalStudentsTaught || new Set(classrooms.flatMap((item: any) => (item.students || []).map((student: any) => objectId(student)))).size} assigned`} icon={Users} />
          <QuickLinkCard href="/homework" title="Homework" subtitle={`${homework.length} active`} icon={ClipboardList} />
          <QuickLinkCard href="/ask-coach" title="Ask Coach" subtitle="Student messages" icon={MessageSquare} />
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
            <InfoTile label="Total Hours" value={teaching.totalHoursConducted.toFixed(2)} />
            <InfoTile label="Actual Time" value={`${teaching.actualHoursConducted.toFixed(2)}h`} />
            <InfoTile label="Avg Paid Duration" value={formatDuration(teaching.averageClassDuration || 0)} />
            <InfoTile label="Avg Actual Duration" value={formatDuration(teaching.averageActualDuration || 0)} />
            <InfoTile label="Punctuality" value={`${teaching.punctualityScore || 0}%`} />
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
                  <th className="px-3 py-3 font-medium">Paid Hours</th>
                  <th className="px-3 py-3 font-medium">Actual</th>
                  <th className="px-3 py-3 font-medium">Students</th>
                </tr>
              </thead>
              <tbody>
                {teaching.batchRows.length ? teaching.batchRows.map((row) => (
                  <tr key={row.batchName} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-950">{row.batchName}</td>
                    <td className="px-3 py-3">{row.classesConducted}</td>
                    <td className="px-3 py-3">{row.hoursConducted.toFixed(2)}</td>
                    <td className="px-3 py-3">{(row.actualHours || 0).toFixed(2)}</td>
                    <td className="px-3 py-3">{row.students}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">Teaching hours will appear here once scheduled classes are completed.</td>
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
                    const canJoin = joinAllowed && canJoinScheduledSession(session, now);
                    const targetNames = (classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} students`;
                    return (
                      <div key={`${classroom._id}-${session._id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-black text-slate-950">{classroom.title}</div>
                            <div className="mt-1 text-sm text-slate-600">{sessionTopic(session, classroom)} - {targetNames}</div>
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
                            className="btn-outline"
                            availableClassName="btn-primary"
                            unavailableClassName="btn-outline"
                            label="Join Classroom"
                            disabled={!joinAllowed}
                            scheduledFor={session.scheduledFor || classroom.classDate || classroom.startDate}
                            startTime={session.startTime || classroom.startTime}
                            durationMinutes={session.durationMinutes || classroom.durationMinutes || 60}
                          />
                          <FutureClassDetailsButton
                            details={{
                              title: classroom.title,
                              courseName: classroom.courseName || "",
                              levelName: classroom.levelName || "",
                              topicName: sessionTopic(session, classroom),
                              startDate: String(session.scheduledFor || classroom.classDate || classroom.startDate || ""),
                              startTime: session.startTime || classroom.startTime || "",
                              durationMinutes: Number(session.durationMinutes || classroom.durationMinutes || 60),
                              coachName: session.substituteCoach?.name || classroom.coach?.name || classroom.instructor?.name || "Assigned coach",
                              batchNames: targetNames,
                              students: (classroom.students || []).map((student: any) => ({
                                name: student?.name || "",
                                email: student?.email || "",
                                username: student?.username || "",
                              })),
                            }}
                          />
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
                    <div className="mt-1 text-sm text-slate-600">{sessionTopic(session, classroom)} - {targetNames}</div>
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

async function CoachDashboardV2({ userId, searchParams, joinAllowed }: { userId: string; searchParams: DashboardSearchParams; joinAllowed: boolean }) {
  const now = new Date();
  const summaryRange = getTeachingSummaryRange(searchParams);
  const [classroomDocs, homework, unreadMessages] = await Promise.all([
    Classroom.find({
      ...coachClassroomQuery(userId),
      isActive: { $ne: false },
      isSessionInstance: { $ne: true },
    })
      .populate("coach instructor", "name username email")
      .populate("generatedSessions.substituteCoach", "name username email")
      .populate("students", "name username email")
      .populate("batches", "name")
      .lean(),
    Homework.find({ instructor: userId }).sort({ dueAt: 1, createdAt: -1 }).limit(6).lean(),
    AskCoachMessage.countDocuments({ receiver: userId, status: { $ne: "deleted" }, "readBy.user": { $ne: userId } }),
  ]);
  const classrooms = classroomDocs.map((classroom: any) => limitClassroomToCoachSessions(classroom, userId));
  const sessions = buildCoachUpcomingSessions(classrooms, now);
  const completedSessions = flattenScheduledSessions(classrooms)
    .filter((row) => row.start && isHistoricalSessionStatus(deriveScheduledSessionStatus(row.session, now)))
    .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0));
  const teaching = summarizeCoachSessions(classrooms, { from: summaryRange.from, to: summaryRange.to });
  const nextSession = sessions[0] || null;
  const todayRows = sessions.filter((row) => row.start && startOfDay(row.start).getTime() === startOfDay(now).getTime());
  const scheduleRows = (todayRows.length ? todayRows : sessions).slice(0, 5);
  const assignedStudentCount = new Set(classrooms.flatMap((item: any) => (item.students || []).map((student: any) => objectId(student)))).size;
  const attendanceDueToday = todayRows.length;
  const weekCounts = Array.from({ length: 7 }).map((_, index) => {
    const date = startOfDay(new Date(now.getTime() + index * DAY));
    const count = sessions.filter((row) => row.start && startOfDay(row.start).getTime() === date.getTime()).length;
    return {
      label: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date),
      count,
    };
  }).filter((item) => item.count > 0).slice(0, 4);
  const nextCanJoin = nextSession ? joinAllowed && canJoinScheduledSession(nextSession.session, now) : false;

  function targetNames(classroom: any) {
    return (classroom.batches || []).map((batch: any) => batch.name).join(", ") || `${classroom.students?.length || 0} students`;
  }

  function coachName(classroom: any, session: any) {
    return session?.substituteCoach?.name || classroom?.coach?.name || classroom?.instructor?.name || "Assigned coach";
  }

  function detailsFor(classroom: any, session: any) {
    return {
      title: classroom.title,
      courseName: classroom.courseName || "",
      levelName: classroom.levelName || "",
      topicName: sessionTopic(session, classroom),
      startDate: String(session.scheduledFor || classroom.classDate || classroom.startDate || ""),
      startTime: session.startTime || classroom.startTime || "",
      durationMinutes: Number(session.durationMinutes || classroom.durationMinutes || 60),
      coachName: coachName(classroom, session),
      batchNames: targetNames(classroom),
      students: (classroom.students || []).map((student: any) => ({
        name: student?.name || "",
        email: student?.email || "",
        username: student?.username || "",
      })),
    };
  }

  return (
    <div className="space-y-6 text-slate-950">
      <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-brand via-purple-800 to-brand-900 px-5 py-6 text-white shadow-[0_24px_60px_rgba(90,19,114,0.24)] sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-accent">
              <BookOpen size={14} />
              Envision Chess Academy
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-normal text-white sm:text-4xl">Teaching Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">Track classes, homework, student activity, and upcoming sessions at a glance.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <CoachHeaderMetric label="Upcoming" value={sessions.length} />
            <CoachHeaderMetric label="Hours" value={teaching.totalHoursConducted.toFixed(2)} />
            <CoachHeaderMetric label="Students" value={teaching.totalStudentsTaught || assignedStudentCount} />
          </div>
        </div>
      </section>

      {nextSession ? (
        <section className="overflow-hidden rounded-[24px] border border-brand/25 bg-white shadow-[0_20px_50px_rgba(90,19,114,0.14)]">
          <div className="grid lg:grid-cols-[140px_1fr_260px]">
            <div className="grid min-h-32 place-items-center bg-gradient-to-br from-purple-700 to-brand-900 text-white">
              <Calendar size={42} />
            </div>
            <div className="px-5 py-5">
              <div className="text-sm font-black text-slate-700">Next Class</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-black text-brand">
                <span>{formatTimeLabel(nextSession.start)}</span>
                <span className="text-base text-slate-300">•</span>
                <span className="text-sm font-black">{nextCanJoin ? "Join now" : formatJoinWindowLabel(nextSession.session, now)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                <span className="font-black text-slate-950">{nextSession.classroom.title}</span>
                <span>{targetNames(nextSession.classroom)}</span>
                <span>Topic: {sessionTopic(nextSession.session, nextSession.classroom)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <Users size={15} />
                <span>{nextSession.classroom.students?.length || 0} students</span>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 border-t border-slate-100 px-5 py-5 lg:border-l lg:border-t-0">
              <JoinScheduledSessionButton
                classroomId={objectId(nextSession.classroom._id)}
                sessionId={String(nextSession.session._id)}
                meetingUrl={nextSession.classroom.meetingUrl}
                className="btn-outline justify-center"
                availableClassName="btn-primary justify-center"
                unavailableClassName="btn-outline justify-center"
                label="Join Classroom"
                disabled={!joinAllowed}
                scheduledFor={nextSession.session.scheduledFor || nextSession.classroom.classDate || nextSession.classroom.startDate}
                startTime={nextSession.session.startTime || nextSession.classroom.startTime}
                durationMinutes={nextSession.session.durationMinutes || nextSession.classroom.durationMinutes || 60}
              />
              <FutureClassDetailsButton details={detailsFor(nextSession.classroom, nextSession.session)} className="btn-outline justify-center" />
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <SectionTitle icon={Calendar} title={todayRows.length ? "Today's Schedule" : "Upcoming Schedule"} subtitle="Clean timeline of your next teaching sessions" />
            <Link href="/classrooms" className="text-sm font-black text-brand">View full day</Link>
          </div>
          <div className="space-y-1">
            {scheduleRows.length ? scheduleRows.map(({ classroom, session, start }, index) => {
              const joinReady = joinAllowed && canJoinScheduledSession(session, now);
              return (
                <div key={`coach-v2-${classroom._id}-${session._id}`} className={`grid gap-3 border-l-2 py-3 pl-4 md:grid-cols-[82px_minmax(0,1fr)_minmax(140px,0.75fr)_auto] md:items-center ${index === 0 ? "border-brand bg-brand/5 pr-3" : "border-slate-200"}`}>
                  <div className="flex items-center gap-3 md:block">
                    <span className={`inline-block h-3 w-3 rounded-full ${index === 0 ? "bg-brand" : "bg-slate-400"}`} />
                    <div className="text-sm font-black text-slate-950 md:mt-1">{formatTimeLabel(start)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-black text-slate-950">{classroom.title}</div>
                    <div className="mt-1 truncate text-sm text-slate-500">{targetNames(classroom)}</div>
                  </div>
                  <div className="min-w-0 text-sm text-slate-700">
                    <div className="truncate">{sessionTopic(session, classroom)}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Users size={13} /> {classroom.students?.length || 0} students</div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <JoinScheduledSessionButton
                      classroomId={objectId(classroom._id)}
                      sessionId={String(session._id)}
                      meetingUrl={classroom.meetingUrl}
                      className="btn-outline"
                      availableClassName="btn-primary"
                      unavailableClassName="btn-outline"
                      label="Join"
                      disabled={!joinAllowed}
                      scheduledFor={session.scheduledFor || classroom.classDate || classroom.startDate}
                      startTime={session.startTime || classroom.startTime}
                      durationMinutes={session.durationMinutes || classroom.durationMinutes || 60}
                    />
                    <FutureClassDetailsButton details={detailsFor(classroom, session)} className="btn-outline" />
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No upcoming classes scheduled.</div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <CoachPanel icon={Zap} title="Action Center">
            <CoachActionItem href="/attendance/pending" icon={Users} label="Attendance pending" value={attendanceDueToday} tone="yellow" />
            <CoachActionItem href="/homework" icon={ClipboardList} label="Homework to review" value={homework.length} tone="yellow" />
            <CoachActionItem href="/ask-coach" icon={MessageSquare} label="Coach messages unread" value={unreadMessages} tone="yellow" />
            <CoachActionItem href="/classrooms" icon={RotateCcw} label="Reschedule follow-up" value={teaching.classesRescheduled} tone="yellow" />
          </CoachPanel>

          <CoachPanel icon={Zap} title="Quick Actions">
            <CoachActionItem href="/attendance/pending" icon={UserCheck} label="Mark Attendance" />
            <CoachActionItem href="/homework" icon={ClipboardList} label="Review Homework" />
            <CoachActionItem href="/ask-coach" icon={MessageSquare} label="Ask Coach" />
          </CoachPanel>
        </aside>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <SectionTitle icon={Calendar} title="This Week" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(weekCounts.length ? weekCounts : [{ label: "This week", count: 0 }]).map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center">
                <div className="text-sm font-semibold text-slate-700">{item.label}</div>
                <div className="mt-2 text-3xl font-black text-slate-950">{item.count}</div>
                <div className="mt-1 text-sm text-slate-500">class{item.count === 1 ? "" : "es"}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <SectionTitle icon={CheckCircle2} title="Recent Completed" />
            <Link href="/classrooms" className="text-sm font-black text-brand">View all</Link>
          </div>
          <div className="space-y-3">
            {completedSessions.length ? completedSessions.slice(0, 3).map(({ classroom, session }) => (
              <Link key={`completed-v2-${classroom._id}-${session._id}`} href={`/classrooms/${objectId(classroom._id)}/summary?session=${String(session._id)}`} className="grid gap-3 border-b border-slate-100 pb-3 last:border-0 md:grid-cols-[32px_1fr_auto] md:items-center">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 size={18} /></span>
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">{formatDateTimeLabel(session.actualEndedAt || session.scheduledFor)}</span>
                  <span className="block truncate text-sm font-black text-slate-950">{classroom.title} <span className="font-medium text-slate-400">|</span> {sessionTopic(session, classroom)}</span>
                </span>
                <span className="text-sm font-semibold text-slate-600">{classroom.students?.length || 0} students</span>
              </Link>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Completed sessions will appear here after class ends.</div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand/10 text-brand"><BarChart3 size={24} /></span>
            <div>
              <h2 className="text-lg font-black text-slate-950">Teaching Hours Insight</h2>
              <p className="mt-1 text-sm text-slate-500">{teaching.classesConducted ? `${teaching.totalHoursConducted.toFixed(2)} hours conducted in ${summaryRange.label}.` : "No teaching-hours insights available yet."}</p>
            </div>
          </div>
          <Link href={`/dashboard?summaryMonth=${summaryRange.mode === "current" ? "last" : "current"}`} className="hidden text-sm font-black text-brand sm:inline-flex">
            {summaryRange.mode === "current" ? "Last month" : "Current month"}
          </Link>
        </div>
      </section>
    </div>
  );
}

function CoachHeaderMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-3 text-center ring-1 ring-white/10">
      <div className="text-[11px] font-semibold text-white/70">{label}</div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}

function CoachPanel({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><Icon size={20} /></span>
        <h2 className="text-xl font-black text-slate-950">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function CoachActionItem({ href, icon: Icon, label, value, tone }: { href: string; icon: any; label: string; value?: number; tone?: "yellow" }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-brand/30 hover:bg-brand/5">
      <Icon size={20} className="text-brand" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{label}</span>
      {typeof value === "number" ? <span className={tone === "yellow" ? "grid h-8 min-w-8 place-items-center rounded-full bg-amber-100 px-2 text-sm font-black text-amber-800" : "text-sm font-black text-brand"}>{value}</span> : null}
      <ArrowRight size={17} className="text-slate-400" />
    </Link>
  );
}

function AdminMetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: string | number; note: string; icon: any; tone: "purple" | "blue" | "green" | "amber" | "rose" }) {
  const tones = {
    purple: "from-violet-600 to-purple-700 text-white",
    blue: "from-blue-500 to-indigo-600 text-white",
    green: "from-emerald-500 to-green-600 text-white",
    amber: "from-amber-400 to-orange-500 text-white",
    rose: "from-pink-500 to-rose-500 text-white",
  };
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tones[tone]}`}>
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-black text-slate-950">{value}</p>
        </div>
      </div>
      <p className="mt-3 truncate text-xs font-semibold text-slate-500">{note}</p>
    </div>
  );
}

function AdminPanel({ icon: Icon, title, action, children, className = "" }: { icon: any; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.07)] ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Icon size={20} />
          </span>
          <h2 className="truncate text-lg font-black text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AdminActionItem({ href, icon: Icon, label, note, value, tone }: { href: string; icon: any; label: string; note: string; value: number; tone: "purple" | "blue" | "amber" | "rose" | "green" }) {
  const tones = {
    purple: "bg-violet-50 text-violet-700 border-violet-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-brand/30 hover:bg-brand/5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-slate-950">{label}</span>
        <span className="block truncate text-xs font-semibold text-slate-500">{note}</span>
      </span>
      <span className={`grid h-8 min-w-10 place-items-center rounded-lg border px-2 text-sm font-black ${tones[tone]}`}>{value}</span>
      <ArrowRight size={16} className="text-slate-400" />
    </Link>
  );
}

function AdminQuickAction({ href, icon: Icon, label, tone }: { href: string; icon: any; label: string; tone: "purple" | "blue" | "green" | "amber" | "rose" }) {
  const tones = {
    purple: "bg-violet-600",
    blue: "bg-blue-600",
    green: "bg-emerald-600",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <Link href={href} className="flex min-h-16 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:border-brand/30 hover:bg-brand/5">
      <span className={`grid h-9 w-9 place-items-center rounded-lg text-white ${tones[tone]}`}>
        <Icon size={18} />
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function readableStatus(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimeLabel(value?: Date | string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function attendanceHrefForDashboard(classroom: any, session: any, start: Date) {
  const params = new URLSearchParams();
  params.set("date", dateKey(start));
  params.set("session", `${objectId(classroom._id)}:${String(session?._id || "")}`);
  return `/attendance?${params.toString()}`;
}

function classroomGroupHref(classroom: any) {
  const batch = classroom?.batches?.[0];
  const batchId = objectId(batch?._id ?? batch);
  return batchId ? `/classrooms/groups/${batchId}` : "/classrooms";
}

export default async function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  noStore();
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | undefined;

  if ((session?.user as any)?.isActive === false) {
    return <InactiveAccountDashboard userName={session?.user?.name} role={role} />;
  }

  await dbConnect();
  const joinAllowed = await canAccessFeature("classrooms", session?.user as any, "join");

  if (role === "student") return <StudentDashboard userId={userId} joinAllowed={joinAllowed} />;
  if (role === "instructor") return <CoachDashboardV2 userId={userId} searchParams={searchParams} joinAllowed={joinAllowed} />;

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

  const adminTabs = [
    { id: "today", label: "Today", icon: Calendar },
    { id: "students", label: "Students", icon: Users },
    { id: "fees", label: "Fees", icon: CircleDollarSign },
    { id: "coaches", label: "Coaches", icon: GraduationCap },
    { id: "activity", label: "Activity", icon: ActivityIcon },
  ];
  const adminTabIds = adminTabs.map((tab) => tab.id);
  const activeTab = adminTabIds.includes(searchParams.tab || "") ? searchParams.tab || "today" : "today";
  const needsPeople = activeTab === "today" || activeTab === "students";
  const needsCoaches = activeTab === "today" || activeTab === "coaches";
  const needsClassrooms = activeTab === "today" || activeTab === "students" || activeTab === "coaches";
  const needsClassroomActivity = activeTab === "today" || activeTab === "students" || activeTab === "coaches" || activeTab === "activity";
  const needsFees = activeTab === "today" || activeTab === "fees";
  const needsPayments = needsFees || activeTab === "activity";
  const needsActivityFeed = activeTab === "today" || activeTab === "activity";

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
    collectedFeeInvoices,
    pgns,
    loggedActivities,
  ] = await Promise.all([
    needsPeople
      ? User.find({ role: "student", ...userSearch })
          .select("name username email gender isActive level courseLevel studentLevel createdAt")
          .sort({ createdAt: -1 })
          .lean()
      : [],
    needsCoaches
      ? User.find({ role: "instructor" })
          .select("name username email")
          .sort({ name: 1 })
          .lean()
      : [],
    needsCoaches
      ? Batch.find({})
          .select("name level students coach isActive")
          .populate("coach", "name")
          .lean()
      : [],
    needsClassrooms ? Classroom.find({ isSessionInstance: { $ne: true } })
      .populate("coach instructor", "name username email")
      .populate("generatedSessions.substituteCoach", "name username email")
      .populate("students", "name username email")
      .populate("batches", "name level course")
      .lean() : [],
    needsClassroomActivity ? Homework.find(dateFilter("createdAt", from, to)).select("title classroom instructor isPublished puzzles createdAt").lean() : [],
    needsClassroomActivity ? Submission.find(dateFilter("submittedAt", from, to)).select("student homework totalScore submittedAt reviewedAt feedback").populate("student", "name username").lean() : [],
    needsClassroomActivity ? Attendance.find(dateFilter("sessionDate", from, to)).select("classroom scheduledSessionId sessionDate records").populate("classroom", "title").lean() : [],
    needsActivityFeed ? Booking.find(dateFilter("startAt", from, to)).select("student instructor startAt status approvalStatus").populate("student instructor", "name").lean() : [],
    needsPayments ? Payment.find({ status: "paid", $or: [dateFilter("paidAt", from, to), dateFilter("createdAt", from, to)] }).select("user amount method status paidAt createdAt").populate("user", "name username").lean() : [],
    needsFees ? Payment.find({ status: "paid", $or: [dateFilter("paidAt", academicFrom, academicTo), dateFilter("createdAt", academicFrom, academicTo)] }).select("amount method paidAt createdAt").lean() : [],
    needsFees ? Invoice.find(dateFilter("createdAt", academicFrom, academicTo)).select("status totalAmount dueDate paidAt updatedAt createdAt").lean() : [],
    needsFees ? Invoice.find({ status: "paid", paidAt: { $gte: academicFrom, $lte: academicTo } }).select("totalAmount paidAt").lean() : [],
    needsClassroomActivity ? PGN.find(dateFilter("createdAt", from, to)).select("title uploadedBy createdAt").populate("uploadedBy", "name username").lean() : [],
    needsActivityFeed ? Activity.find(dateFilter("occurredAt", from, to))
      .select("actor targetUser type label occurredAt")
      .populate("actor targetUser", "name username role")
      .sort({ occurredAt: -1 })
      .limit(120)
      .lean() : [],
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
  const collectedFees = collectedFeeInvoices.reduce((sum: number, invoice: any) => sum + (invoice.totalAmount || 0), 0);
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
    const coachClasses = classrooms.filter((classroom: any) =>
      objectId(classroom.coach || classroom.instructor) === cid ||
      (classroom.generatedSessions || []).some((session: any) => effectiveSessionCoachId(session, classroom) === cid)
    );
    const studentIds = new Set(coachClasses.flatMap((classroom: any) => (classroom.students || []).map(objectId)));
    const coachHomework = homework.filter((item: any) => objectId(item.instructor) === cid);
    const coachAttendance = attendance.filter((item: any) => coachClasses.some((classroom: any) => objectId(classroom._id) === objectId(item.classroom?._id ?? item.classroom)));
    const teaching = summarizeCoachSessions(classrooms, { from, to }, { coachId: cid });
    return {
      id: cid,
      name: coach.name,
      students: studentIds.size,
      classes: coachClasses.length,
      homework: coachHomework.length,
      sessions: coachAttendance.length,
      hours: teaching.totalHoursConducted,
      actualHours: teaching.actualHoursConducted,
      punctualityScore: teaching.punctualityScore,
      attendancePercentage: teaching.attendancePercentage,
      activeBatches: new Set(coachClasses.flatMap((classroom: any) => (classroom.batches || []).map((batch: any) => batch.name || objectId(batch)))).size,
    };
  });
  const topCoach = coachRows.slice().sort((a, b) => b.hours - a.hours)[0];
  const batchTeachingRows = Array.from(
    classrooms.reduce((map, classroom: any) => {
      const completedSessions = (classroom.generatedSessions || []).filter((session: any) => session.status === "completed" && new Date(session.actualEndedAt || session.scheduledFor) >= from && new Date(session.actualEndedAt || session.scheduledFor) <= to);
      const sessionHours = completedSessions.reduce((sum: number, session: any) => sum + Number(session.durationMinutes || classroom.durationMinutes || 0) / 60, 0);
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
  const tabHref = (tab: string) => {
    const params = new URLSearchParams();
    if (preset) params.set("preset", preset);
    if (searchParams.from) params.set("from", searchParams.from);
    if (searchParams.to) params.set("to", searchParams.to);
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.date) params.set("date", searchParams.date);
    if (searchParams.academicYear) params.set("academicYear", searchParams.academicYear);
    if (searchParams.summaryMonth) params.set("summaryMonth", searchParams.summaryMonth);
    params.set("tab", tab);
    return `/dashboard?${params.toString()}`;
  };

  const scheduledRows = flattenScheduledSessions(activeClassrooms).sort((a, b) => a.start.getTime() - b.start.getTime());
  const todayRows = scheduledRows.filter((row) => row.start >= focusFrom && row.start <= focusTo);
  const todaySessionQueries = todayRows.map((row) => ({
    classroom: row.classroom._id,
    scheduledSessionId: String(row.session?._id || ""),
  }));
  const [todayAttendance, todayLiveSessions] = todaySessionQueries.length ? await Promise.all([
    Attendance.find({ $or: todaySessionQueries.map((query) => ({ ...query, sessionDate: { $gte: focusFrom, $lte: focusTo } })) }).lean(),
    ClassroomSession.find({ $or: todaySessionQueries }).select("classroom scheduledSessionId status startedAt endedAt participants").lean(),
  ]) : [[], []];
  const todayAttendanceBySession = new Map(
    todayAttendance.map((item: any) => [`${objectId(item.classroom?._id ?? item.classroom)}:${String(item.scheduledSessionId || "")}`, item])
  );
  const todayLiveBySession = new Map(
    todayLiveSessions.map((item: any) => [`${objectId(item.classroom?._id ?? item.classroom)}:${String(item.scheduledSessionId || "")}`, item])
  );
  const completedRows = scheduledRows
    .filter((row) => (row.session.status === "completed" || row.start < new Date()) && row.start <= new Date())
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, 4);
  const weekStart = new Date(focusFrom);
  weekStart.setDate(focusFrom.getDate() - ((focusFrom.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart.getTime() + index * DAY);
    const count = scheduledRows.filter((row) => dateKey(row.start) === dateKey(day)).length;
    return { day, count };
  });
  const attendanceKeys = new Set(
    attendance.map((item: any) => `${objectId(item.classroom?._id ?? item.classroom)}:${String(item.scheduledSessionId || "")}:${dateKey(new Date(item.sessionDate))}`)
  );
  const attendancePending = todayRows.filter((row) => {
    const status = deriveScheduledSessionStatus(row.session, new Date());
    const key = `${objectId(row.classroom._id)}:${String(row.session._id || "")}:${dateKey(row.start)}`;
    return status !== "cancelled" && !attendanceKeys.has(key);
  }).length;
  const homeworkToReview = submissions.filter((item: any) => !item.reviewedAt && !item.feedback).length || submissions.length;
  const unreadAdminMessages = activities.filter((item) => item.type.includes("message") || item.type.includes("ask")).length;
  const rescheduleRequests = bookings.filter((booking: any) => ["pending", "requested", "reschedule_requested"].includes(String(booking.status || booking.approvalStatus || "").toLowerCase())).length;
  const overdueInvoices = invoices.filter((invoice: any) => invoice.status !== "paid" && invoice.status !== "cancelled" && new Date(invoice.dueDate) < new Date()).length;
  const collectionRate = percent(collectedFees, collectedFees + pastDues + futureDues);
  const activeBatches = batches.filter((batch: any) => batch.isActive !== false);
  const beginnerCount = activeStudents.filter((student: any) => String(student.level || student.courseLevel || "").toLowerCase().includes("beginner")).length;
  const intermediateCount = activeStudents.filter((student: any) => String(student.level || student.courseLevel || "").toLowerCase().includes("intermediate")).length;
  const advancedCount = activeStudents.filter((student: any) => String(student.level || student.courseLevel || "").toLowerCase().includes("advanced")).length;
  const uncategorizedCount = Math.max(0, activeStudents.length - beginnerCount - intermediateCount - advancedCount);
  const levelSegments = [
    { label: "Beginner", value: beginnerCount, className: "bg-indigo-500" },
    { label: "Intermediate", value: intermediateCount, className: "bg-emerald-500" },
    { label: "Advanced", value: advancedCount, className: "bg-amber-500" },
    { label: "Other", value: uncategorizedCount, className: "bg-slate-400" },
  ].filter((item) => item.value > 0);
  const levelChart = levelSegments.length
    ? `conic-gradient(#6366f1 0 ${percent(beginnerCount, activeStudents.length)}%, #10b981 ${percent(beginnerCount, activeStudents.length)}% ${percent(beginnerCount + intermediateCount, activeStudents.length)}%, #f59e0b ${percent(beginnerCount + intermediateCount, activeStudents.length)}% ${percent(beginnerCount + intermediateCount + advancedCount, activeStudents.length)}%, #94a3b8 ${percent(beginnerCount + intermediateCount + advancedCount, activeStudents.length)}% 100%)`
    : "conic-gradient(#e2e8f0 0 100%)";

  if (activeTab === "today") {
    return (
      <div className="space-y-5 text-slate-950">
        <section className="rounded-xl border border-purple-900/10 bg-[radial-gradient(circle_at_top_left,rgba(126,34,206,0.18),transparent_34%),linear-gradient(135deg,#170032_0%,#4b0d73_58%,#7a1fb2_100%)] px-5 py-6 text-white shadow-[0_24px_60px_rgba(58,8,86,0.25)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">Envision Chess Academy</p>
              <h1 className="mt-4 text-3xl font-black sm:text-4xl">Welcome back, Admin</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-white/78">Here is what is happening in your academy today.</p>
            </div>
            <FilterBar method="get" className="max-w-xl border-white/10 bg-white/10 shadow-none sm:grid-cols-[1fr_auto]">
              <input type="hidden" name="tab" value="today" />
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-white/70">
                Focus date
                <input name="date" type="date" defaultValue={dateKey(focusDate)} className="h-10 rounded-lg border border-white/15 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40" />
              </label>
              <div className="flex items-end">
                <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-brand shadow-sm transition hover:bg-amber-50">
                  <Calendar size={16} /> Apply
                </button>
              </div>
            </FilterBar>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <AdminMetricCard label="Total Students" value={activeStudents.length} note={`${newStudents.length} added in range`} icon={Users} tone="purple" />
          <AdminMetricCard label="Active Batches" value={activeBatches.length} note={`${activeClassrooms.length} active classrooms`} icon={GraduationCap} tone="blue" />
          <AdminMetricCard label="Classes Today" value={todayRows.length} note="Across all coaches" icon={Calendar} tone="green" />
          <AdminMetricCard label="Revenue" value={money(collectedFees)} note={`Academic year ${academicYearStart}`} icon={CircleDollarSign} tone="amber" />
          <AdminMetricCard label="Collection Rate" value={`${collectionRate}%`} note={`${money(pastDues)} overdue`} icon={TrendingUp} tone="rose" />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
          <AdminPanel
            icon={Calendar}
            title="Today at a Glance"
            action={
              <form method="get" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="tab" value="today" />
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  Date
                  <input name="date" type="date" defaultValue={dateKey(focusDate)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
                </label>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-black text-white shadow-sm transition hover:bg-brand/90">
                  <Calendar size={14} /> Apply
                </button>
              </form>
            }
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">{formatDate(focusDate)} - {todayRows.length} individual class{todayRows.length === 1 ? "" : "es"}</p>
              <Link href="/classrooms/groups" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-brand transition hover:border-brand/30 hover:bg-brand/5">
                Open all groups <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-3">
              {todayRows.length ? todayRows.map((row, index) => {
                const classroom = row.classroom as any;
                const sessionRow = row.session as any;
                const sessionKey = `${objectId(classroom._id)}:${String(sessionRow._id || "")}`;
                const attendanceRow = todayAttendanceBySession.get(sessionKey) as any;
                const liveRow = todayLiveBySession.get(sessionKey) as any;
                const status = deriveScheduledSessionStatus(sessionRow, new Date());
                const batchName = (classroom.batches || []).map((batch: any) => batch?.name || "").filter(Boolean).join(", ") || classroom.batchName || "Batch";
                const coachName = sessionRow.substituteCoach?.name || classroom.coach?.name || classroom.instructor?.name || "Coach";
                const participants = liveRow?.participants || [];
                const teacherJoined = Boolean(sessionRow.actualStartedAt || liveRow?.startedAt || participants.some((participant: any) => ["instructor", "admin", "sub-admin"].includes(String(participant.role || ""))));
                const joinedStudentCount = new Set(
                  participants
                    .filter((participant: any) => String(participant.role || "") === "student")
                    .map((participant: any) => objectId(participant.user))
                    .filter(Boolean)
                ).size;
                const totalStudents = classroom.students?.length || 0;
                const started = Boolean(sessionRow.actualStartedAt || liveRow?.startedAt);
                const completed = Boolean(sessionRow.actualEndedAt || liveRow?.endedAt || status === "completed");
                const attendanceMarked = Boolean(attendanceRow || sessionRow.attendanceMarkedAt);
                const presentCount = (attendanceRow?.records || []).filter((record: any) => ["present", "late"].includes(String(record.status || ""))).length;
                const detailsHref = `/classrooms/${objectId(classroom._id)}/summary?session=${encodeURIComponent(String(sessionRow._id || ""))}`;
                const attendanceHref = attendanceHrefForDashboard(classroom, sessionRow, row.start);
                return (
                  <div key={`admin-today-${objectId(classroom._id)}-${String(sessionRow._id || index)}`} className={index === 0 ? "rounded-lg border border-amber-200 bg-amber-50/70 p-4" : "rounded-lg border border-slate-200 bg-white p-4"}>
                    <div className="grid gap-3 lg:grid-cols-[78px_minmax(0,1fr)_minmax(170px,auto)] lg:items-start">
                      <div className="text-sm font-black text-slate-950">{formatTimeLabel(row.start)}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-black text-slate-950">{classroom.title}</p>
                          <span className={statusChipClass(status)}>{readableStatus(status)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">Group: {batchName}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">Topic: {sessionTopic(sessionRow, classroom)} | Coach: {coachName}</p>
                      </div>
                      <div className="text-sm font-black text-slate-950">{totalStudents} <span className="block text-xs font-semibold text-slate-500">Students</span></div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                      <InfoTile label="Started" value={started ? "Yes" : "No"} />
                      <InfoTile label="Completed" value={completed ? "Yes" : "No"} />
                      <InfoTile label="Attendance" value={attendanceMarked ? `Marked${presentCount ? ` (${presentCount} present)` : ""}` : "Pending"} />
                      <InfoTile label="Teacher Joined" value={teacherJoined ? "Yes" : "No"} />
                      <InfoTile label="Students Joined" value={`${joinedStudentCount}/${totalStudents}`} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <JoinScheduledSessionButton
                        classroomId={objectId(classroom._id)}
                        sessionId={String(sessionRow._id)}
                        meetingUrl={classroom.meetingUrl}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-brand transition hover:border-brand/30 hover:bg-brand/5"
                        availableClassName="inline-flex h-9 items-center justify-center rounded-lg bg-brand px-3 text-xs font-black text-white shadow-sm transition hover:bg-brand/90"
                        unavailableClassName="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-brand transition hover:border-brand/30 hover:bg-brand/5"
                        label="Join"
                        disabled={!joinAllowed}
                        scheduledFor={sessionRow.scheduledFor || classroom.classDate || classroom.startDate}
                        startTime={sessionRow.startTime || classroom.startTime}
                        durationMinutes={sessionRow.durationMinutes || classroom.durationMinutes || 60}
                      />
                      <FutureClassDetailsButton
                        details={{
                          title: classroom.title,
                          batchNames: batchName,
                          courseName: classroom.courseName || classroom.course || "Course",
                          levelName: classroom.levelName || classroom.level || classroom.batches?.[0]?.level || "Level",
                          topicName: sessionTopic(sessionRow, classroom),
                          startDate: sessionRow.scheduledFor || classroom.classDate || row.start.toISOString(),
                          startTime: sessionRow.startTime || classroom.startTime || "",
                          durationMinutes: sessionRow.durationMinutes || classroom.durationMinutes || 60,
                          coachName,
                          students: (classroom.students || []).map((student: any) => ({ name: student.name || student.username || "Student", email: student.email, username: student.username })),
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-brand transition hover:border-brand/30 hover:bg-brand/5"
                      />
                      <Link href={detailsHref} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-brand transition hover:border-brand/30 hover:bg-brand/5">
                        View Details
                      </Link>
                      <Link href={attendanceHref} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-brand transition hover:border-brand/30 hover:bg-brand/5">
                        Attendance
                      </Link>
                      <Link href={classroomGroupHref(classroom)} className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-950 px-3 text-xs font-black text-white shadow-sm transition hover:bg-slate-800">
                        Open Group
                      </Link>
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">No classes scheduled for this date.</div>
              )}
            </div>
          </AdminPanel>

          <AdminPanel icon={Zap} title="Action Center" action={<Link href="/dashboard?tab=activity" className="text-sm font-black text-brand">View all</Link>}>
            <div className="space-y-3">
              <AdminActionItem href="/attendance/pending" icon={ClipboardList} label="Attendance pending" note="Classes need attendance" value={attendancePending} tone="purple" />
              <AdminActionItem href="/homework" icon={ClipboardList} label="Homework to review" note="Submissions awaiting review" value={homeworkToReview} tone="amber" />
              <AdminActionItem href="/ask-coach" icon={MessageSquare} label="Unread messages" note="Students and parents" value={unreadAdminMessages} tone="blue" />
              <AdminActionItem href="/booking" icon={RotateCcw} label="Reschedule requests" note="Requests needing approval" value={rescheduleRequests} tone="rose" />
              <AdminActionItem href="/fees" icon={WalletCards} label="Fee reminders overdue" note="Students with pending dues" value={overdueInvoices} tone="green" />
            </div>
          </AdminPanel>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1fr_1.2fr]">
          <AdminPanel icon={Calendar} title="This Week's Schedule">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {weekDays.map((item) => (
                <div key={dateKey(item.day)} className={dateKey(item.day) === dateKey(focusDate) ? "flex items-center justify-between bg-brand/10 px-4 py-3 text-sm font-black text-brand" : "flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 last:border-b-0"}>
                  <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short" }).format(item.day)}</span>
                  <span>{item.count} class{item.count === 1 ? "" : "es"}</span>
                </div>
              ))}
            </div>
            <Link href="/classrooms" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-brand transition hover:bg-brand/5">
              View weekly calendar <ArrowRight size={16} />
            </Link>
          </AdminPanel>

          <AdminPanel icon={CheckCircle2} title="Recent Completed Classes" action={<Link href="/classrooms" className="text-sm font-black text-brand">View All</Link>}>
            <div className="space-y-3">
              {completedRows.length ? completedRows.map((row, index) => {
                const classroom = row.classroom as any;
                const sessionRow = row.session as any;
                return (
                  <Link key={`admin-completed-${objectId(classroom._id)}-${String(sessionRow._id || index)}`} href={`/classrooms/${objectId(classroom._id)}/summary?session=${String(sessionRow._id)}`} className="grid gap-3 border-b border-slate-100 pb-3 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-950">{classroom.title} <span className="font-medium text-slate-400">|</span> {classroom.batches?.[0]?.name || "Batch"}</span>
                      <span className="mt-1 block truncate text-xs font-semibold text-slate-500">{formatDate(row.start)}, {formatTimeLabel(row.start)} | Coach: {classroom.coach?.name || classroom.instructor?.name || "Coach"}</span>
                    </span>
                    <span className="text-sm font-black text-slate-950">{classroom.students?.length || 0} / {classroom.students?.length || 0}<span className="block text-xs font-semibold text-slate-500">Present</span></span>
                  </Link>
                );
              }) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">Completed classes will appear here.</div>
              )}
            </div>
          </AdminPanel>

          <AdminPanel icon={BarChart3} title="Academy Overview">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-black text-slate-950">Students by Level</h3>
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-24 w-24 rounded-full p-5" style={{ background: levelChart }}>
                    <div className="h-full w-full rounded-full bg-white" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {(levelSegments.length ? levelSegments : [{ label: "No level data", value: activeStudents.length, className: "bg-slate-400" }]).map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                        <span className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.className}`} /> <span className="truncate">{item.label}</span></span>
                        <span className="font-black text-slate-950">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-black text-slate-950">Top Performing Coaches</h3>
                <div className="mt-4 space-y-2">
                  {coachRows.slice().sort((a, b) => b.hours - a.hours).slice(0, 5).map((coach) => (
                    <div key={coach.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-semibold text-slate-700">{coach.name}</span>
                      <span className="font-black text-slate-950">{coach.hours.toFixed(2)}h</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-black text-slate-950">Attendance Overview</span>
                <span className="font-black text-emerald-700">{attendanceRate}%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${attendanceRate}%` }} />
              </div>
            </div>
          </AdminPanel>
        </div>

        <AdminPanel icon={Zap} title="Quick Actions">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <AdminQuickAction href="/admin/users" icon={Users} label="Add Student" tone="purple" />
            <AdminQuickAction href="/admin/users" icon={GraduationCap} label="Create Batch" tone="blue" />
            <AdminQuickAction href="/instructor/classrooms/new" icon={Calendar} label="Schedule Class" tone="green" />
            <AdminQuickAction href="/admin/announcements" icon={BellRing} label="Send Announcement" tone="amber" />
            <AdminQuickAction href="/dashboard?tab=activity" icon={BarChart3} label="Generate Report" tone="rose" />
            <AdminQuickAction href="/admin/users" icon={UserCheck} label="Add Coach" tone="blue" />
          </div>
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-slate-950">
      <DashboardHero
        eyebrow="Admin Workspace"
        title="Welcome to Admin Dashboard"
        subtitle={`Manage academy operations from one central view. Showing ${formatDate(from)} to ${formatDate(to)}.`}
        icon={SlidersHorizontal}
      >
        <FilterBar method="get" className="sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-[110px_140px_130px_140px_140px_minmax(160px,1fr)_auto_auto]">
          <input type="hidden" name="tab" value={activeTab} />
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
            Academic Year
            <input name="academicYear" type="number" defaultValue={academicYearStart} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
            Focus Date
            <input name="date" type="date" defaultValue={dateKey(focusDate)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
            Range
            <select name="preset" defaultValue={preset} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
            From
            <input name="from" type="date" defaultValue={dateKey(from)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500">
            To
            <input name="to" type="date" defaultValue={dateKey(to)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500 sm:col-span-2 lg:col-span-1">
            Search
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input name="q" defaultValue={searchParams.q} placeholder="Student name, email, username" className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
            </span>
          </label>
          <div className="flex items-end">
            <button className="inline-flex h-8 items-center gap-2 rounded-md bg-purple-700 px-3 text-xs font-semibold text-white shadow-sm shadow-purple-900/20 transition hover:bg-purple-800">
              <SlidersHorizontal size={14} /> Apply
            </button>
          </div>
          <div className="flex items-end">
            <Link href="/dashboard" className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand/30 hover:text-brand">
              <RotateCcw size={14} /> Reset
            </Link>
          </div>
        </FilterBar>
      </DashboardHero>

      <section className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_12px_32px_rgba(90,19,114,0.08)]">
        <SectionTitle icon={Zap} title="Quick Actions" subtitle="Common admin tasks made thumb-friendly" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickLinkCard href="/admin/users" title="Add Student" subtitle="Students and users" icon={Users} />
          <QuickLinkCard href="/instructor/classrooms/new" title="Schedule Class" subtitle="Create a session" icon={Calendar} />
          <QuickLinkCard href="/admin/users" title="Create Batch" subtitle="Batches and roles" icon={UserCheck} />
          <QuickLinkCard href="/attendance" title="Attendance" subtitle="Check records" icon={CheckCircle2} />
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm shadow-brand/5" aria-label="Admin dashboard sections">
        {adminTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tabHref(tab.id)}
              scroll={false}
              className={selected ? "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white shadow-sm" : "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-bold text-slate-600 transition hover:bg-brand-50 hover:text-brand"}
              aria-current={selected ? "page" : undefined}
            >
              <Icon size={16} />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "today" && (
      <>
      <DashboardPanel>
        <SectionTitle icon={Users} title="Academy Snapshot" subtitle={`Academic year ${academicYearStart}-${String(academicYearStart + 1).slice(-2)} and selected date ${formatDate(focusDate)}`} />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Student Strength" value={students.length} note="All student profiles" icon={Users} tone="purple" />
          <StatCard label="Total Active Students" value={activeStudents.length} note="Active student profiles" icon={CheckCircle2} tone="green" />
          <StatCard label="Students Added Today" value={studentsAddedToday.length} note={formatDate(focusDate)} icon={GraduationCap} tone="blue" />
          <StatCard label="Today's Fee Collection" value={money(todayCollection)} note="Paid invoices on selected date" icon={CircleDollarSign} tone="green" />
          <StatCard label="Today's Due Amount" value={money(todayDue)} note="Invoices due on selected date" icon={Calendar} tone="amber" />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Teaching Hours" value={totalTeachingHours.toFixed(2)} note="Selected date range" icon={BookOpen} tone="blue" />
          <StatCard label="Top Coach" value={topCoach?.name || "-"} note={`${topCoach?.hours?.toFixed?.(2) || "0.00"} hours`} icon={GraduationCap} tone="purple" />
          <StatCard label="Top Batch" value={topBatch?.batchName || "-"} note={`${topBatch?.hoursConducted?.toFixed?.(2) || "0.00"} hours`} icon={Users} tone="green" />
          <StatCard label="Avg / Coach" value={averageTeachingHours.toFixed(2)} note="Average teaching hours" icon={BarChart3} tone="amber" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3 shadow-inner shadow-slate-200/70">
            <h3 className="text-sm font-semibold text-slate-950">Gender-wise Student Count</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>Male <b className="float-right">{genderCounts.male}</b></div>
              <div>Female <b className="float-right">{genderCounts.female}</b></div>
              <div>Others <b className="float-right">{genderCounts.other}</b></div>
              <div>Not Available <b className="float-right">{genderCounts.notAvailable}</b></div>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 shadow-inner shadow-slate-200/70">
            <h3 className="text-sm font-semibold text-slate-950">Overall Fee Statistics</h3>
            <div className="mt-2 space-y-1.5 text-sm">
              <div>Collected Fees <b className="float-right">{money(collectedFees)}</b></div>
              <div>Past Dues <b className="float-right text-rose-700">{money(pastDues)}</b></div>
              <div>Future Dues <b className="float-right text-amber-700">{money(futureDues)}</b></div>
              <div>Bad Debt <b className="float-right text-slate-700">{money(badDebt)}</b></div>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 shadow-inner shadow-slate-200/70">
            <h3 className="text-sm font-semibold text-slate-950">Mode of Transaction Summary</h3>
            <div className="mt-2 space-y-1.5 text-sm">
              {transactionModes.map((item) => (
                <div key={item.mode}>{item.mode === "cheque" ? "Cheque / PDC / DD" : item.mode.toUpperCase()} <b className="float-right">{money(item.amount)}</b></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardPanel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <DashboardPanel className="xl:col-span-2">
          <SectionTitle icon={BarChart3} title="Classroom & Engagement" subtitle="Attendance, homework submissions, sessions, and platform usage" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <StatCard label="Sessions Held" value={attendance.length} note="Attendance sheets" icon={Calendar} tone="blue" />
            <StatCard label="Homework Published" value={publishedHomework.length} note="Assignments in range" icon={ClipboardList} tone="purple" />
            <StatCard label="Gameplay Activity" value={pgns.length} note="PGNs uploaded/reviewed" icon={Gamepad2} tone="amber" />
            <StatCard label="Assessments" value={submissions.length} note={`${scoreRate}% score rate`} icon={CheckCircle2} tone="green" />
          </div>
          <MiniBarChart points={homeworkByDay} barClassName="bg-emerald-500" />
        </DashboardPanel>

        <DashboardPanel>
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
        </DashboardPanel>
      </div>
      </>
      )}

      {activeTab === "students" && (
      <>
      <DashboardPanel>
        <SectionTitle icon={TrendingUp} title="Student Growth Analytics" subtitle="New student registrations inside the selected calendar range" />
        <MiniBarChart points={growthPoints} barClassName="bg-purple-600" />
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
      </DashboardPanel>

      <DashboardPanel>
        <SectionTitle icon={Users} title="Student Progress & Performance" subtitle="Homework, classes, attendance, PGN activity, and latest engagement" />
        <div className="grid gap-3 md:hidden">
          {studentRows.length ? studentRows.map((row) => (
            <article key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{row.name}</h3>
                  <p className="text-xs text-slate-500">{row.username || "No username"}</p>
                </div>
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{row.attendance}% attendance</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <InfoTile label="Classes" value={row.classes} />
                <InfoTile label="Homework" value={row.homework} />
                <InfoTile label="PGNs" value={row.pgns} />
              </div>
              <div className="mt-3 text-xs text-slate-500">Last activity: {row.lastActivity ? formatTimeAgo(row.lastActivity) : "No activity"}</div>
            </article>
          )) : (
            <CommonEmptyState title="No students match these filters" description="Try clearing the search or widening the date range." />
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
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
      </DashboardPanel>
      </>
      )}

      {activeTab === "fees" && (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardPanel>
          <SectionTitle icon={CircleDollarSign} title="Fee Overview" subtitle={`Academic year ${academicYearStart}-${String(academicYearStart + 1).slice(-2)}`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Today's Collection" value={money(todayCollection)} note={formatDate(focusDate)} icon={CircleDollarSign} tone="green" />
            <StatCard label="Today's Due" value={money(todayDue)} note="Due on selected date" icon={Calendar} tone="amber" />
            <StatCard label="Collected Fees" value={money(collectedFees)} note="Paid invoices" icon={CheckCircle2} tone="green" />
            <StatCard label="Past Dues" value={money(pastDues)} note="Needs follow-up" icon={BellRing} tone="rose" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-950">Due Pipeline</h3>
              <div className="mt-2 space-y-2 text-sm">
                <div>Future Dues <b className="float-right text-amber-700">{money(futureDues)}</b></div>
                <div>Bad Debt <b className="float-right text-slate-700">{money(badDebt)}</b></div>
                <div>Revenue in Range <b className="float-right text-emerald-700">{money(paidRevenue)}</b></div>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
              <h3 className="text-sm font-semibold text-slate-950">Mode of Transaction Summary</h3>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                {transactionModes.map((item) => (
                  <div key={item.mode} className="rounded-md bg-white px-3 py-2 shadow-sm">
                    {item.mode === "cheque" ? "Cheque / PDC / DD" : item.mode.toUpperCase()} <b className="float-right">{money(item.amount)}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DashboardPanel>
        <DashboardPanel>
          <SectionTitle icon={WalletCards} title="Fee Actions" subtitle="Open focused fee workspaces" />
          <div className="grid gap-3">
            <QuickLinkCard href="/fees" title="Fee Dashboard" subtitle="Review credits, balances, and payment status." icon={WalletCards} />
            <QuickLinkCard href="/fees/invoices" title="Invoices" subtitle="Create, update, and send fee invoices." icon={CircleDollarSign} />
            <QuickLinkCard href="/fees/reports" title="Reports" subtitle="Export collection and due reports." icon={BarChart3} />
          </div>
        </DashboardPanel>
      </div>
      )}

      {activeTab === "coaches" && (
      <>
      <DashboardPanel>
        <SectionTitle icon={GraduationCap} title="Coach Performance" subtitle="Assigned students, active classes, homework, and attendance sessions" />
        <div className="grid gap-3 md:hidden">
          {coachRows.length ? coachRows.map((row) => (
            <article key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-950">{row.name}</h3>
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{row.hours.toFixed(2)} hrs</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <InfoTile label="Students" value={compactNumber(row.students)} />
                <InfoTile label="Classes" value={compactNumber(row.classes)} />
                <InfoTile label="Attendance" value={`${row.attendancePercentage}%`} />
                <InfoTile label="Sessions" value={compactNumber(row.sessions)} />
              </div>
              <Link href="/classrooms" className="btn-outline mt-3 w-full">View Classes</Link>
            </article>
          )) : (
            <CommonEmptyState title="No coaches found" description="Add coaches from the Users area to begin tracking teaching workload." action={<Link href="/admin/users" className="btn-primary">Add Coach</Link>} />
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-3 font-medium">Coach</th>
                <th className="px-3 py-3 font-medium">Students</th>
                <th className="px-3 py-3 font-medium">Classes</th>
                <th className="px-3 py-3 font-medium">Paid Hours</th>
                <th className="px-3 py-3 font-medium">Actual</th>
                <th className="px-3 py-3 font-medium">Punctuality</th>
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
                  <td className="px-3 py-3">{row.hours.toFixed(2)}</td>
                  <td className="px-3 py-3">{row.actualHours.toFixed(2)}</td>
                  <td className="px-3 py-3">{row.punctualityScore}%</td>
                  <td className="px-3 py-3">{compactNumber(row.activeBatches)}</td>
                  <td className="px-3 py-3">{row.attendancePercentage}%</td>
                  <td className="px-3 py-3">{compactNumber(row.homework)}</td>
                  <td className="px-3 py-3">{compactNumber(row.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <SectionTitle icon={Users} title="Batch-Wise Teaching Hours" subtitle="Completed teaching workload per batch" />
        <div className="grid gap-3 md:hidden">
          {batchTeachingRows.length ? batchTeachingRows.map((row) => (
            <article key={row.batchName} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{row.batchName}</h3>
                  <p className="text-xs text-slate-500">Coach: {row.coachName || "-"}</p>
                </div>
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{row.hoursConducted.toFixed(2)} hrs</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <InfoTile label="Classes" value={row.classesConducted} />
                <InfoTile label="Students" value={row.students} />
              </div>
            </article>
          )) : (
            <CommonEmptyState title="No completed scheduled classes yet" description="Batch teaching hours will appear after coaches complete scheduled classes in this range." />
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
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
                  <td className="px-3 py-3">{row.hoursConducted.toFixed(2)}</td>
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
      </DashboardPanel>
      </>
      )}

      {activeTab === "activity" && (
      <DashboardPanel>
        <SectionTitle icon={ActivityIcon} title="Activity Tracker" subtitle="Recent account, learning, attendance, payment, and PGN activity" />
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-950">Recent activity in range</div>
            <div className="mt-1 text-3xl font-black text-brand">{activities.length}</div>
            <div className="mt-1 text-xs text-slate-500">Showing the latest academy activity across the selected filters.</div>
            <Link href="/admin/activity-tracker" className="btn-primary mt-4 w-full">Open Activity Tracker</Link>
          </div>
          <div className="space-y-3">
            {activities.length ? activities.slice(0, 12).map((activity) => (
              <article key={activity.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">{activity.label}</h3>
                    <p className="mt-1 text-xs text-slate-500">{activity.actor} - {activity.type}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">{formatTimeAgo(activity.when)}</span>
                </div>
              </article>
            )) : (
              <CommonEmptyState title="No activity in this range" description="Try a wider date range or clear the search filter to see more academy activity." action={<Link href="/admin/activity-tracker" className="btn-primary">Open Activity Tracker</Link>} />
            )}
          </div>
        </div>
      </DashboardPanel>
      )}
    </div>
  );
}
