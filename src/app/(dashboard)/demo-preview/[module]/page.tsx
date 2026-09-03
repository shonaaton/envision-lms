import { auth } from "@/lib/auth";
import { demoStudentExperience } from "@/lib/demoStudentExperience";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  MessageSquare,
  Trophy,
  WalletCards,
} from "lucide-react";

export const dynamic = "force-dynamic";

type DemoModule = (typeof demoStudentExperience.modules)[number];

const iconMap = {
  calendar: Calendar,
  homework: ClipboardList,
  attendance: CheckCircle2,
  progress: BarChart3,
  leaderboard: Trophy,
  trophy: Trophy,
  wallet: WalletCards,
  message: MessageSquare,
  history: BookOpen,
  certificate: GraduationCap,
};

export default async function DemoPreviewPage({ params }: { params: { module: string } }) {
  const session = await auth();
  if ((session?.user as any)?.accountStatus !== "demo") redirect("/dashboard");

  const previewModule = demoStudentExperience.modules.find((item) => item.slug === params.module);
  if (!previewModule) redirect("/dashboard");

  const Icon = iconMap[previewModule.icon as keyof typeof iconMap] || BookOpen;

  return (
    <div className="space-y-5 text-slate-950">
      <section className="rounded-lg border border-amber-200 bg-[linear-gradient(135deg,#fff8d8_0%,#ffffff_58%,#f8f5ff_100%)] p-5 shadow-[0_22px_60px_rgba(90,19,114,0.10)]">
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 text-sm font-black text-brand">
          <ArrowLeft size={16} /> Back to Demo Dashboard
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-brand">
              <Icon size={15} /> Demo Preview
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950">{previewModule.title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{previewModule.summary}</p>
          </div>
          <div className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-500">Sample Snapshot</div>
            <div className="mt-1 text-3xl font-black text-brand">{previewModule.metric}</div>
            <div className="mt-2 text-xs font-semibold text-slate-500">Demo data only</div>
          </div>
        </div>
      </section>

      <ModuleBody previewModule={previewModule} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-black text-slate-950">This is a guided preview</div>
            <p className="mt-1 text-sm text-slate-500">The real portal fills this page with your actual class, homework, attendance, report, and payment records after enrollment.</p>
          </div>
          <Link href="/booking" className="btn-accent">Book Demo Class</Link>
        </div>
      </section>
    </div>
  );
}

function ModuleBody({ previewModule }: { previewModule: DemoModule }) {
  if (previewModule.slug === "upcoming-schedule") return <UpcomingSchedule />;
  if (previewModule.slug === "homework-view") return <HomeworkView />;
  if (previewModule.slug === "attendance-view") return <AttendanceView />;
  if (previewModule.slug === "calendar-view") return <CalendarView />;
  if (previewModule.slug === "progress-report") return <ProgressReport />;
  if (previewModule.slug === "leader-board") return <LeaderBoard />;
  if (previewModule.slug === "tournaments") return <Tournaments />;
  if (previewModule.slug === "credits-and-payments") return <CreditsAndPayments />;
  if (previewModule.slug === "ask-coach") return <AskCoach />;
  if (previewModule.slug === "class-history") return <ClassHistory />;
  if (previewModule.slug === "certificates") return <Certificates />;
  return null;
}

function UpcomingSchedule() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {demoStudentExperience.upcomingClasses.map((item) => (
        <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-black text-slate-950">{item.title}</div>
              <div className="mt-1 text-sm text-slate-500">{item.coach}</div>
            </div>
            <span className="chip bg-brand/10 text-brand">{item.status}</span>
          </div>
          <div className="mt-4 grid gap-3">
            <InfoTile label="Date" value={item.dateLabel} />
            <InfoTile label="Time" value={item.timeLabel} />
            <InfoTile label="Format" value={item.format} />
            <InfoTile label="Join Status" value={item.joinLabel} />
          </div>
        </article>
      ))}
    </div>
  );
}

function HomeworkView() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-5 border-b border-slate-200 px-4 py-3 text-xs font-black uppercase text-slate-500">
        <div className="col-span-2">Homework</div>
        <div>Status</div>
        <div>Accuracy</div>
        <div>Outcome</div>
      </div>
      {demoStudentExperience.homework.map((item) => (
        <div key={item.title} className="grid grid-cols-1 gap-2 border-b border-slate-100 px-4 py-4 last:border-0 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <div className="font-black text-slate-950">{item.title}</div>
            <div className="mt-1 text-sm text-slate-500">{item.items} activity items - {item.dueLabel}</div>
          </div>
          <div><StatusChip status={item.status} /></div>
          <div className="font-black text-brand">{item.accuracy}</div>
          <div className="text-sm font-semibold text-slate-600">{item.score}</div>
        </div>
      ))}
    </section>
  );
}

function AttendanceView() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm">
        <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[14px] border-brand bg-brand/5">
          <div>
            <div className="text-3xl font-black text-brand">96%</div>
            <div className="text-xs font-bold text-slate-500">This month</div>
          </div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        {demoStudentExperience.attendance.map((item) => <InfoTile key={item.label} label={item.label} value={item.value} />)}
      </section>
    </div>
  );
}

function CalendarView() {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {demoStudentExperience.calendar.map((item) => (
        <article key={`${item.day}-${item.title}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-brand">{item.day}</div>
            <span className="rounded bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">{item.type}</span>
          </div>
          <div className="mt-3 font-black text-slate-950">{item.title}</div>
          <div className="mt-1 text-sm text-slate-500">{item.time}</div>
        </article>
      ))}
    </section>
  );
}

function ProgressReport() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="grid gap-3 sm:grid-cols-2">
        {demoStudentExperience.progress.map((item) => <InfoTile key={item.label} label={item.label} value={item.value} />)}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="font-black text-slate-950">Learning path</div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-[82%] rounded-full bg-amber-400" />
        </div>
        <div className="mt-2 text-right text-sm font-black text-brand">82%</div>
        <p className="mt-4 text-sm leading-6 text-slate-600">Strong in tactics and opening principles. Next target: build endgame conversion confidence.</p>
      </section>
    </div>
  );
}

function LeaderBoard() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-3">
        {demoStudentExperience.leaderboard.map((item) => (
          <div key={`${item.rank}-${item.name}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{item.rank}</div>
              <div>
                <div className="font-black text-slate-950">{item.name}</div>
                <div className="text-sm text-slate-500">{item.detail}</div>
              </div>
            </div>
            <span className="chip bg-amber-50 text-amber-700">{item.coins} coins</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tournaments() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {demoStudentExperience.tournaments.map((item) => (
        <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="font-black text-slate-950">{item.title}</div>
          <div className="mt-2 text-sm text-slate-500">{item.detail}</div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="chip bg-brand/10 text-brand">{item.format}</span>
            <span className="text-sm font-black text-emerald-700">{item.status}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function CreditsAndPayments() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {demoStudentExperience.credits.map((item) => <InfoTile key={item.label} label={item.label} value={item.value} />)}
    </section>
  );
}

function AskCoach() {
  return (
    <section className="space-y-3">
      {demoStudentExperience.askCoach.map((item) => (
        <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="font-black text-slate-950">{item.title}</div>
          <div className="mt-3 rounded-lg bg-brand/5 p-4 text-sm leading-6 text-slate-600">{item.reply}</div>
        </article>
      ))}
    </section>
  );
}

function ClassHistory() {
  return (
    <section className="space-y-3">
      {demoStudentExperience.classHistory.map((item) => (
        <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="font-black text-slate-950">{item.title}</div>
          <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
        </article>
      ))}
    </section>
  );
}

function Certificates() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {demoStudentExperience.certificates.map((item) => (
        <article key={item.title} className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
          <GraduationCap className="text-brand" size={24} />
          <div className="mt-3 font-black text-slate-950">{item.title}</div>
          <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
          <button className="btn-outline mt-4" type="button">View Certificate</button>
        </article>
      ))}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black text-slate-950">{value}</div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = status === "Submitted" ? "bg-emerald-50 text-emerald-700" : status === "Not started" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-black ${tone}`}>{status}</span>;
}
