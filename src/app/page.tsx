import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  MonitorSmartphone,
  Trophy,
} from "lucide-react";
import Logo from "@/components/layout/Logo";

const highlights = [
  { title: "Classrooms", detail: "Live sessions, batches, and class summaries", icon: BookOpen },
  { title: "Homework", detail: "Chess positions, submissions, and review flow", icon: ClipboardList },
  { title: "Scheduling", detail: "Calendar, self-booking, and attendance in sync", icon: CalendarDays },
  { title: "Progress", detail: "Reports, tournaments, PGNs, and practice tools", icon: BarChart3 },
];

const previewRows = [
  { label: "Today", value: "4 live classes", tone: "bg-brand text-white" },
  { label: "Homework", value: "12 active tasks", tone: "bg-slate-100 text-slate-900" },
  { label: "Tournaments", value: "Swiss event ready", tone: "bg-accent text-brand" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Logo tone="purple" className="max-w-[190px] sm:max-w-[230px]" />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn-outline">
              Login
            </Link>
            <Link href="/register" className="btn-accent hidden sm:inline-flex">
              Join Academy
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#f8fafc_0%,#f2eef7_48%,#fff9d7_120%)]" />
        <div className="absolute inset-x-0 bottom-0 top-32 opacity-55 lg:top-14" aria-hidden="true">
          <div className="mx-auto grid h-full max-w-7xl grid-cols-1 gap-4 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div className="hidden lg:block" />
            <div className="self-end rounded-lg border border-white/80 bg-white/80 p-4 shadow-2xl shadow-brand-900/10 backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand/70">Academy Workspace</div>
                  <div className="mt-1 text-lg font-black text-slate-950">Operations overview</div>
                </div>
                <div className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white">Live</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {previewRows.map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-500">{item.label}</div>
                    <div className="mt-2 text-sm font-black text-slate-950">{item.value}</div>
                    <div className={`mt-3 h-1.5 rounded-full ${item.tone}`} />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">Student progress</span>
                    <Trophy size={18} className="text-brand" />
                  </div>
                  <div className="space-y-3">
                    {[78, 64, 88].map((width, index) => (
                      <div key={width} className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Batch {index + 1}</span>
                          <span>{width}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <CheckCircle2 size={17} className="text-emerald-600" />
                    Ready for every screen
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600">
                    <div className="rounded-lg bg-slate-50 p-3">Desktop</div>
                    <div className="rounded-lg bg-slate-50 p-3">Tablet</div>
                    <div className="rounded-lg bg-slate-50 p-3">Mobile</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-120px)] max-w-7xl items-center px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <span className="chip-accent px-3 py-1.5">Premium Chess LMS</span>
            <h1 className="mt-5 text-4xl font-black leading-[1.05] text-brand sm:text-5xl lg:text-6xl">
              Envision Chess Academy
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              A polished academy workspace for classes, homework, PGNs, practice, attendance, bookings, tournaments, and payments.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="btn-accent">
                Start Learning <ArrowRight size={17} />
              </Link>
              <Link href="/login" className="btn-outline">
                I already have an account
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2">
                <MonitorSmartphone size={17} className="text-brand" />
                Smooth on computer, tablet, and phone
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-3 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {highlights.map((feature) => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className="card-hover">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon size={19} />
              </div>
              <h2 className="text-base font-black text-slate-950">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.detail}</p>
            </article>
          );
        })}
      </section>

      <footer className="border-t border-slate-200 bg-white/80 py-5 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} Envision Chess Academy
      </footer>
    </main>
  );
}
