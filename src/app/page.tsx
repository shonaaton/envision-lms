import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Globe2,
  GraduationCap,
  MapPin,
  MonitorSmartphone,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import Logo from "@/components/layout/Logo";

const stats = [
  { value: "1000+", label: "students trained" },
  { value: "30+", label: "countries reached" },
  { value: "25k+", label: "coaching hours" },
  { value: "4.9", label: "parent rating" },
];

const programs = [
  {
    title: "Beginner",
    price: "INR 2,200",
    detail: "Build legal moves, board vision, tactics, and confidence.",
    points: ["4 classes/week", "PDF notes", "Level certificate"],
  },
  {
    title: "Intermediate",
    price: "INR 2,400",
    detail: "Sharpen calculation, openings, endgames, and tournament habits.",
    points: ["Lichess practice", "Tournament support", "Progress reviews"],
  },
  {
    title: "Advanced",
    price: "INR 2,600",
    detail: "Prepare for rated events with deeper strategy and analysis.",
    points: ["Competitive prep", "Special batches", "Coach feedback"],
  },
];

const advantages = [
  { title: "FIDE-led curriculum", detail: "Structured levels created for steady progress from first moves to tournament play.", icon: GraduationCap },
  { title: "Small batches", detail: "Students are grouped by level so each class feels focused, practical, and personal.", icon: UsersRound },
  { title: "Practice built in", detail: "Homework, PGN review, tests, and practice games keep learning active between classes.", icon: ClipboardList },
  { title: "Parent visibility", detail: "Monthly PTMs, progress notes, and clear next steps keep families in the loop.", icon: ShieldCheck },
];

const lmsFeatures = [
  { title: "Next class", detail: "Class links, batch notes, attendance, and coach updates in one place.", icon: CalendarDays },
  { title: "Homework", detail: "Assignments, positions, submissions, and feedback stay organized.", icon: BookOpen },
  { title: "Practice", detail: "Students continue puzzles, PGNs, and curated chess tasks after class.", icon: MonitorSmartphone },
];

const branches = ["Bowbazar", "Haridevpur", "Silpara", "Jodhpur Park", "New Alipore"];

const boardSquares = [
  "R", "N", "B", "Q", "K", "B", "N", "R",
  "P", "P", "P", "", "", "P", "P", "P",
  "", "", "", "", "", "", "", "",
  "", "", "", "P", "P", "", "", "",
  "", "", "b", "", "p", "", "", "",
  "", "", "", "", "", "n", "", "",
  "p", "p", "p", "p", "", "p", "p", "p",
  "r", "n", "b", "q", "k", "", "", "r",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-900/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Logo tone="yellow" className="max-w-[190px] sm:max-w-[230px]" />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn border border-white/15 bg-white/10 text-white hover:bg-white/15">
              Login
            </Link>
            <Link href="/register" className="btn-accent hidden sm:inline-flex">
              Join Academy
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-brand-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(253,231,90,0.22),transparent_32%),linear-gradient(115deg,#24062f_0%,#441156_45%,#13051b_100%)]" />
        <div className="absolute inset-y-0 right-0 hidden w-[58%] lg:block">
          <Image
            src="/images/landing/anish-bijibilla.jpg"
            alt="Anish qualified for the World Cadets Chess Championship"
            fill
            priority
            sizes="58vw"
            className="object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#24062f_0%,rgba(36,6,47,0.70)_24%,rgba(36,6,47,0.12)_72%)]" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-[linear-gradient(180deg,transparent,#f7f8fb)]" />

        <div className="relative z-10 mx-auto grid min-h-[82dvh] max-w-7xl content-center px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-accent">
              FIDE-certified online and offline chess coaching
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
              Envision Chess Academy
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg">
              Premium chess coaching for kids and adults, backed by structured levels, live classes, tournament preparation, and a learning portal built for practice between sessions.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="btn-accent min-h-12 px-5">
                Book Free Demo <ArrowRight size={18} />
              </Link>
              <Link href="/login" className="btn min-h-12 border border-white/18 bg-white/10 px-5 text-white hover:bg-white/15">
                Open Student Portal
              </Link>
            </div>
            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {["Small batches", "Monthly PTMs", "Tournament support"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-semibold text-white/82">
                  <CheckCircle2 size={17} className="text-accent" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto -mt-5 grid max-w-7xl gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {stats.map((item) => (
          <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-lg shadow-brand-900/8">
            <div className="text-3xl font-black text-brand">{item.value}</div>
            <div className="mt-1 text-sm font-semibold text-slate-600">{item.label}</div>
          </article>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-16">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Why parents choose us</p>
          <h2 className="mt-3 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">
            Coaching that feels structured, visible, and competitive.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Families see the full pathway clearly: expert coaching, global reach, student results, practice routines, and tournament preparation.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {advantages.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="card-hover">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon size={20} />
                </div>
                <h3 className="font-black text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-white py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Programs</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Choose a learning path</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">Transparent monthly fees, GST inclusive, with a free demo before families commit.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {programs.map((program, index) => (
              <article key={program.title} className={`rounded-lg border p-5 shadow-sm ${index === 1 ? "border-brand bg-brand text-white shadow-brand-900/15" : "border-slate-200 bg-[#fbfcff] text-slate-950"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black">{program.title}</h3>
                    <p className={`mt-2 text-sm leading-6 ${index === 1 ? "text-white/75" : "text-slate-600"}`}>{program.detail}</p>
                  </div>
                  <Award className={index === 1 ? "text-accent" : "text-brand"} size={24} />
                </div>
                <div className="mt-5 text-3xl font-black">{program.price}</div>
                <div className={`mt-1 text-sm font-semibold ${index === 1 ? "text-white/70" : "text-slate-500"}`}>per month</div>
                <div className="mt-5 grid gap-2">
                  {program.points.map((point) => (
                    <div key={point} className={`flex items-center gap-2 text-sm font-semibold ${index === 1 ? "text-white/85" : "text-slate-700"}`}>
                      <CheckCircle2 size={16} className={index === 1 ? "text-accent" : "text-emerald-600"} />
                      {point}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-16">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-brand-900/5">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand/70">Student portal preview</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Everything after class stays connected</h2>
            </div>
            <Trophy className="text-brand" size={24} />
          </div>
          <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-brand/15 bg-brand p-2 shadow-inner shadow-black/10">
              <div className="grid aspect-square grid-cols-8 overflow-hidden rounded-md">
                {boardSquares.map((piece, index) => {
                  const dark = (Math.floor(index / 8) + index) % 2 === 1;
                  return (
                    <div key={`${piece}-${index}`} className={`grid place-items-center text-sm font-black ${dark ? "bg-[#855d37] text-white" : "bg-[#f1d9b8] text-brand"}`}>
                      {piece}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3">
              {lmsFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand">
                        <Icon size={18} />
                      </span>
                      <div>
                        <h3 className="font-black text-slate-950">{feature.title}</h3>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{feature.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-brand-900/5">
          <div className="relative aspect-[1.15]">
            <Image src="/images/landing/anish-bijibilla.jpg" alt="Student achievement spotlight" fill sizes="(min-width: 1024px) 38vw, 100vw" className="object-cover" />
          </div>
          <div className="p-5">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Student spotlight</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Anish Bijibilla qualified for World Cadets</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">A proud academy milestone that shows how disciplined training can lead students to international competition.</p>
          </div>
        </article>
      </section>

      <section className="border-y border-slate-200 bg-[#fffdf0] py-10">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Kolkata and online</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">Learn from anywhere, or visit a local center.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <div key={branch} className="flex items-center gap-3 rounded-lg border border-brand/10 bg-white p-4 text-sm font-bold text-slate-800">
                <MapPin size={18} className="text-brand" />
                {branch}
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-lg border border-brand/10 bg-brand p-4 text-sm font-bold text-white">
              <Globe2 size={18} className="text-accent" />
              Online worldwide
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="rounded-lg bg-brand p-6 text-white shadow-2xl shadow-brand-900/20 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent">Start with a free demo</p>
            <h2 className="mt-2 text-3xl font-black">Find the right batch before enrolling.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Students get an assessment, level recommendation, and a clear next step after the demo class.</p>
          </div>
          <Link href="/register" className="btn-accent mt-6 min-h-12 px-5 lg:mt-0">
            Join Academy <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-5 text-center text-sm text-slate-500">
        Copyright {new Date().getFullYear()} Envision Chess Academy
      </footer>
    </main>
  );
}
