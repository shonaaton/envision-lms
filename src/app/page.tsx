import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Crown,
  Gamepad2,
  Globe2,
  MapPin,
  Menu,
  MessageSquare,
  MonitorSmartphone,
  PlayCircle,
  Receipt,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  WalletCards,
} from "lucide-react";
import AnimatedImpactCounters from "@/components/marketing/AnimatedImpactCounters";
import DynamicLandingShowcase from "@/components/marketing/DynamicLandingShowcase";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL } from "@/lib/branding";
import { courseTierLabel } from "@/lib/courseTiers";
import { CURRICULUM_TIERS, curriculumLevels } from "@/lib/demoCurriculum";
import { MARKETING_BASE_URL, OFFLINE_ACADEMY_URL } from "@/lib/publicLinks";
import { academyBranches, anishStory, impactCounters, publicAchievementList, studentSlug } from "@/lib/achievementData";
import { getLandingAchievements } from "@/lib/achievements";
import { portalTutorials, youtubeEmbedUrl } from "@/lib/portalTutorials";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_BASE_URL),
  title: "Envision Chess Academy | Premium Chess Coaching and Student LMS",
  description:
    "Premium online and offline chess coaching with verified student achievements, structured mentorship, tournaments, practice tools, progress tracking, and payments in one student portal.",
  alternates: { canonical: `${MARKETING_BASE_URL}/` },
  openGraph: {
    title: "Envision Chess Academy",
    description: "Structured chess coaching, verified student achievements, and an all-in-one learning portal.",
    url: `${MARKETING_BASE_URL}/`,
    siteName: "Envision Chess Academy",
    type: "website",
    images: [{ url: "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg", width: 1200, height: 900, alt: "Envision Chess Academy student achievement" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Envision Chess Academy",
    description: "Practise, compete, and improve in one chess-learning platform.",
    images: ["/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg"],
  },
};

const demoHref = "/register";
const cloudinaryCollectionUrl = "https://collection.cloudinary.com/dlafr6yu3/3ddc9e2d8d7656087c4a52336a2e1df4";
const offlineSourceUrl = OFFLINE_ACADEMY_URL;

const navItems = [
  ["Home", "#home"],
  ["Programs", "#programs"],
  ["Portal", "#platform"],
  ["Reviews", "#reviews"],
  ["Anish", "#anish"],
  ["Achievements", "#achievements"],
  ["Centres", "#centres"],
];

const portalTabs = [
  { title: "Student Dashboard", icon: MonitorSmartphone, points: ["Upcoming classes", "Homework status", "Attendance", "Notifications", "Credit balance"] },
  { title: "Live Classrooms", icon: CalendarDays, points: ["Scheduled join button", "Live board", "Class chat", "Questions", "Shared study material"] },
  { title: "Assignments", icon: ClipboardList, points: ["Pending work", "PGN study", "Move submission", "Coach feedback", "Scores"] },
  { title: "Practice Tools", icon: Gamepad2, points: ["Tactics Trainer", "Square Trainer", "King Hunt", "Computer bots", "XP rewards"] },
  { title: "Tournaments", icon: Trophy, points: ["Tournament lobby", "Pairings", "Live games", "Results", "Academy leaderboards"] },
  { title: "Progress and Certificates", icon: ShieldCheck, points: ["Attendance", "Reports", "Milestones", "Certificates", "Learning history"] },
  { title: "Fees and Invoices", icon: WalletCards, points: ["Class credits", "Usage history", "Monthly dues", "Invoice PDF", "Online payments"] },
];

const practiceTools = [
  { title: "Tactics Trainer", detail: "Focused puzzle solving for calculation habits and tactical alertness.", icon: Target },
  { title: "King Hunt", detail: "Direct attacking patterns, forcing moves, and checkmate vision.", icon: Crown },
  { title: "Square Trainer", detail: "Board coordinates and chessboard fluency for younger learners.", icon: Sparkles },
  { title: "Play vs Computer", detail: "Guided practice games against a friendly engine opponent.", icon: Gamepad2 },
];

const groupClassHighlights = [
  { label: "2 classes per week", detail: "Steady learning rhythm" },
  { label: "16 sessions per level", detail: "Structured progression" },
  { label: "2 months per level", detail: "Clear completion timeline" },
  { label: "Weekly tournaments", detail: "Regular competitive exposure" },
];

/**
 * Marketing copy for each stage of the ladder. The ladder itself - which stages
 * exist, how many levels sit in each, and how many sessions sit in a level - is
 * read from the taught syllabus in `demoCurriculum`, so this section cannot
 * drift from what coaches actually teach the way the old hardcoded three-track
 * list did.
 */
const groupClassCopy: Record<string, { accent: string; subtitle: string; detail: string }> = {
  beginner: {
    accent: "Foundation",
    subtitle: "Building strong foundations",
    detail: "Board vision, piece movement, notation, good and bad trades, checkmate and stalemate - everything a first real game needs.",
  },
  intermediate: {
    accent: "Tactics",
    subtitle: "Seeing the board sharply",
    detail: "Forks, pins, skewers, back rank and discovered attacks, worked up to mates in two and three moves.",
  },
  semi_pro: {
    accent: "Endgames",
    subtitle: "Converting winning positions",
    detail: "Opposition and key squares, the named mating patterns, a first opening repertoire, and Lucena and Philidor rook endings.",
  },
  pro: {
    accent: "Combinations",
    subtitle: "Calculating under pressure",
    detail: "X-ray, clearance, deflection, decoy and the Greek gift sacrifice, plus zugzwang and hard mates at tournament standard.",
  },
  masters: {
    accent: "Mastery",
    subtitle: "Playing like a champion",
    detail: "Pawn structure, outposts, fortresses, queen sacrifices, attacking schemes and theoretical endgames.",
  },
};

const groupClassTracks = CURRICULUM_TIERS.filter((tier) => groupClassCopy[tier]).map((tier, index) => {
  const levels = curriculumLevels(tier);
  return {
    tier,
    stage: `Stage ${index + 1}`,
    title: courseTierLabel(tier),
    levels: levels.map((level) => ({ name: level.name, sessions: level.sessions.length })),
    totalSessions: levels.reduce((total, level) => total + level.sessions.length, 0),
    ...groupClassCopy[tier],
  };
});

const totalCurriculumSessions = groupClassTracks.reduce((total, track) => total + track.totalSessions, 0);
const totalCurriculumLevels = groupClassTracks.reduce((total, track) => total + track.levels.length, 0);

const learningSteps = [
  "Book a free assessment",
  "Get placed in the correct level",
  "Attend structured live classes",
  "Practise through assignments and tournaments",
  "Track progress through feedback and reports",
];

const supportTools = [
  { title: "Ask Coach", detail: "Students can send questions, positions, and doubts directly to their coach between classes.", icon: MessageSquare },
  { title: "Invoices and Fee Payments", detail: "Parents can review credits, download invoices, and complete secure online payments.", icon: Receipt },
  { title: "Class Bookings", detail: "Students can request classes, track approval, and see upcoming sessions in the portal.", icon: CalendarDays },
  { title: "Progress Checks", detail: "Attendance, assignments, tournament results, and leaderboard performance stay visible.", icon: Trophy },
];

function randomizeAchievementOrder<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export default async function Home() {
  const achievements = publicAchievementList(await getLandingAchievements());
  const featuredAchievements = randomizeAchievementOrder(achievements);

  const schema = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Envision Chess Academy",
    url: `${MARKETING_BASE_URL}/`,
    description:
      "Chess academy offering structured online and offline coaching, student learning tools, tournament preparation, and progress tracking.",
    address: academyBranches.map((centre) => ({
      "@type": "PostalAddress",
      streetAddress: centre.address,
      addressLocality: "Kolkata",
      addressRegion: "West Bengal",
      addressCountry: "IN",
    })),
    email: ACADEMY_DEFAULTS.email,
    telephone: ACADEMY_DEFAULTS.phone,
  };

  return (
    <main id="home" className="landing-compact min-h-screen bg-[#ffffff] text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <header className="sticky top-0 z-50 border-b border-brand-700 bg-brand/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* The logo artwork is yellow-on-transparent, so it sits directly on the brand purple bar. */}
          <Link href="/" className="flex shrink-0 items-center" aria-label="Envision Chess Academy home">
            <Image
              src={ACADEMY_LOGO_URL}
              alt="Envision Chess Academy"
              width={190}
              height={64}
              priority
              unoptimized
              className="h-12 w-auto max-w-[150px] object-contain sm:h-14 sm:max-w-[190px]"
            />
          </Link>
          <nav className="hidden items-center gap-5 xl:flex" aria-label="Main navigation">
            {navItems.map(([label, href]) => (
              <Link key={href} href={href} className="text-sm font-semibold text-white/80 hover:text-accent">
                {label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/login" className="btn border border-white/30 bg-white/10 text-white hover:bg-white/20">
              Login
            </Link>
            <Link href={demoHref} className="btn-accent">
              Book Free Demo Class
            </Link>
          </div>
          <details className="relative xl:hidden">
            <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-lg border border-white/30 bg-white/10 text-accent">
              <Menu size={20} />
            </summary>
            <div className="absolute right-0 mt-3 w-[min(88vw,340px)] rounded-xl border border-brand-700 bg-brand-900 p-3 shadow-lg shadow-brand-900/30">
              {navItems.map(([label, href]) => (
                <Link key={href} href={href} className="block rounded-lg px-3 py-3 text-sm font-bold text-white/85 hover:bg-white/10">
                  {label}
                </Link>
              ))}
              <div className="mt-3 grid gap-2 border-t border-white/15 pt-3">
                <Link href="/login" className="btn border border-white/30 bg-white/10 text-white">Login</Link>
                <Link href={demoHref} className="btn-accent">Book Free Demo Class</Link>
              </div>
            </div>
          </details>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#f5edf8] text-brand-900">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_52%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#f5edf8] to-transparent" />
        <div className="relative mx-auto grid min-h-[calc(100dvh-82px)] max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
          <div className="motion-rise max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white shadow-sm shadow-brand-900/20">
              <ShieldCheck size={15} /> Premium Chess Mentorship
            </p>
            <h1 className="mt-4 max-w-xl text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.7rem]">
              Chess coaching that feels organised from day one.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-brand-900/70 sm:text-[0.95rem]">
              Live classes, homework, tournaments, coach feedback, payments, and progress tracking in one clear academy portal.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-11 px-5 shadow-lg shadow-accent/10">
                Book Free Demo Class <ArrowRight size={18} />
              </Link>
              <Link href="#platform" className="btn min-h-11 border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                See Portal
              </Link>
            </div>
            <div className="mt-6 grid max-w-lg grid-cols-3 gap-2">
              {["Live batches", "Homework", "Progress"].map((label, index) => (
                <div key={label} className="rounded-xl border border-brand/10 bg-white px-3 py-2.5 shadow-sm shadow-brand-900/5">
                  <div className="text-lg font-extrabold text-brand">{["6", "42", "92%"][index]}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-brand-900/60">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <DynamicLandingShowcase achievements={featuredAchievements} />
        </div>
      </section>

      <AnimatedImpactCounters counters={impactCounters} />

      <section id="programs" className="relative overflow-hidden bg-[#ffffff] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(253,231,90,0.55),transparent_32%),radial-gradient(circle_at_86%_22%,rgba(90,19,114,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Group Chess Classes</p>
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">A complete path from beginner to champion.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-900/70">
                Students learn in a structured batch environment with regular practice, guided feedback, and continuous competitive exposure.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {groupClassHighlights.map((item) => (
                <div key={item.label} className="rounded-xl border border-brand/10 bg-white px-4 py-3 shadow-xl shadow-brand-900/5">
                  <div className="flex items-center gap-2 text-sm font-black text-brand-900">
                    <CheckCircle2 size={17} className="shrink-0 text-brand" />
                    {item.label}
                  </div>
                  <div className="mt-1 pl-6 text-xs font-semibold text-brand-900/70">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-brand/15 bg-brand-50 px-4 py-3 text-sm font-bold leading-6 text-brand-900">
            {groupClassTracks.length} stages, {totalCurriculumLevels} levels, {totalCurriculumSessions} sessions from the first move to Masters.{" "}
            <strong className="font-black text-brand">Every level is 16 sessions across 2 months, at 2 classes per week.</strong>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {groupClassTracks.map((track) => (
              <article key={track.tier} className="group flex min-h-full flex-col rounded-xl border border-brand/10 bg-white p-5 shadow-xl shadow-brand-900/5 transition duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand/70">{track.stage} &middot; {track.accent}</p>
                    <h3 className="mt-2 text-xl font-black text-brand-900">{track.title}</h3>
                    <p className="mt-1 text-sm font-bold text-brand-900/70">{track.subtitle}</p>
                  </div>
                  <Trophy size={22} className="shrink-0 text-brand" />
                </div>
                <p className="mt-4 text-sm leading-6 text-brand-900/70">{track.detail}</p>
                <div className="mt-5 space-y-1.5">
                  {track.levels.map((level) => (
                    <div key={level.name} className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2">
                      <span className="text-sm font-black text-brand">{level.name}</span>
                      <span className="text-[10px] font-semibold text-brand/70">{level.sessions} sessions</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-brand-900/60">{track.totalSessions} sessions in this stage</p>
                <div className="mt-auto pt-5">
                  <Link href={demoHref} className="inline-flex items-center gap-1 text-sm font-black text-brand">
                    Book Free Demo Class <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-3 border-t border-brand/10 pt-6 sm:grid-cols-3">
            {["Learn", "Practice", "Compete and grow"].map((step) => (
              <div key={step} className="rounded-xl border border-brand/10 bg-white px-4 py-3 text-sm font-black text-brand-900/80">
                <Sparkles size={16} className="mb-2 text-brand" />
                {step}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="relative overflow-hidden bg-[#ffffff] py-12 text-brand-900 lg:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(90,19,114,0.10),transparent_30%),radial-gradient(circle_at_84%_12%,rgba(253,231,90,0.45),transparent_28%),linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm shadow-brand-900/20">Learning Portal</p>
              <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900">Simple weekly workflow.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-brand-900/70">
              Students see what to attend, what to practise, what to submit, and how they are progressing.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {portalTabs.slice(0, 4).map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="group rounded-xl border border-brand/10 bg-white p-4 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                    <Icon size={19} className="text-brand" />
                    <h3 className="mt-3 text-sm font-black text-brand-900">{item.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-brand-900/70">{item.points.slice(0, 2).join(" · ")}</p>
                  </article>
                );
              })}
          </div>
          <div className="mt-10 border-t border-brand/10 pt-8">
            <div className="mb-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm shadow-brand-900/20">Platform Tutorials</p>
                <h3 className="mt-4 text-2xl font-black leading-tight text-brand-900">See how the learning platform works.</h3>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-brand-900/70">
                New students can watch these quick walkthroughs before their first class and understand the main tools available in the portal.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {portalTutorials.map((tutorial) => (
                <article key={tutorial.videoId} className="overflow-hidden rounded-xl border border-brand/10 bg-white shadow-xl shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                  <div className="aspect-video bg-brand-900">
                    <iframe
                      title={`${tutorial.title} tutorial`}
                      src={youtubeEmbedUrl(tutorial.videoId)}
                      className="h-full w-full border-0"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-brand-900">
                      <PlayCircle size={18} className="shrink-0 text-brand" />
                      {tutorial.title}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-brand-900/70">{tutorial.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Practice Tools</p>
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">Focused training between live classes.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-900/70">Students can solve tactics, learn coordinates, hunt kings, play computer bots, complete assignments, and climb academy leaderboards from the same portal.</p>
            </div>
            <Link href={demoHref} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">Explore Learning Portal</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {practiceTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <article key={tool.title} className="group relative overflow-hidden rounded-xl border border-brand/10 bg-white p-5 shadow-xl shadow-brand-900/5 transition duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20 transition group-hover:bg-brand group-hover:text-accent">
                    <Icon size={21} />
                  </span>
                  <h3 className="mt-4 font-black text-brand-900">{tool.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-brand-900/70">{tool.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="reviews" className="relative overflow-hidden bg-[#ffffff] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_16%,rgba(253,231,90,0.5),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Google Reviews</p>
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">Reviews from parents and students.</h2>
            </div>
            <Link href={offlineSourceUrl} target="_blank" rel="noreferrer" className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
              Review Source <ArrowRight size={16} />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white p-3 shadow-lg shadow-brand-900/5">
            <div className="sk-ww-google-reviews" data-embed-id="25710479" />
          </div>
          <Script src="https://widgets.sociablekit.com/google-reviews/widget.js" strategy="afterInteractive" />
        </div>
      </section>

      <section id="anish" className="relative overflow-hidden bg-[#ffffff] py-12 text-brand-900 lg:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_28%,rgba(253,231,90,0.5),transparent_30%),radial-gradient(circle_at_76%_14%,rgba(90,19,114,0.13),transparent_32%),linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.58fr_1.42fr] lg:px-8">
          <div className="group overflow-hidden border border-brand/10 bg-white shadow-xl shadow-brand-900/5">
            <div className="relative aspect-[0.92] rounded-xl bg-brand-50">
              <Image src="/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg" alt="" fill sizes="(min-width: 1024px) 38vw, 100vw" className="scale-110 object-cover opacity-15 blur-2xl" />
              <Image src="/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg" alt="Anish qualified for the World Cadets Chess Championship" fill sizes="(min-width: 1024px) 28vw, 100vw" className="object-contain p-4 transition duration-700 group-hover:scale-[1.015]" />
            </div>
          </div>
          <div className="self-center">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm shadow-brand-900/20">Student Journey</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900">Anish: beginner to World Cadets qualifier.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-brand-900/70">
              {anishStory.achievement}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <JourneyStat label="Starting Level" value={anishStory.startingLevel} />
              <JourneyStat label="Current Level" value={anishStory.currentLevel} />
              <JourneyStat label="Coaching Duration" value={anishStory.coachingDuration} />
            </div>
            <Link href="/success-stories/anish" className="mt-5 inline-flex items-center gap-1 text-sm font-black text-brand">
              Read the full story <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section id="achievements" className="relative overflow-hidden bg-[#ffffff] py-12 text-brand-900 lg:py-16">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-x-0 top-24 h-px bg-gradient-to-r from-transparent via-brand/20 to-transparent" />
        <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(115deg,rgba(90,19,114,0.06)_1px,transparent_1px)] [background-size:74px_74px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-sm shadow-brand-900/20">Achiever Gallery</p>
              <h2 className="mt-4 text-2xl font-black text-brand-900">Recent achievers.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">A quick proof wall from the academy&apos;s student results.</p>
            </div>
            <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
              Achievement Collection <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredAchievements.slice(0, 8).map((item, index) => (
              <article
                key={`${item.studentName}-${item.displayOrder}`}
                className="group relative rounded-xl border border-brand/10 bg-white p-2 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50"
              >
                <div className="relative aspect-[1.08] overflow-hidden rounded-xl bg-brand-50 shadow-inner shadow-brand-900/10">
                  <Image src={item.achievementImageUrl} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="scale-110 object-cover opacity-12 blur-2xl transition duration-700" />
                  <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-contain p-3 transition duration-700 group-hover:scale-[1.02]" />
                  <div className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-black text-accent shadow-sm">#{index + 1}</div>
                  {item.studentPhotoUrl && (
                    <div className="absolute bottom-3 right-3 h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-white">
                      <Image src={item.studentPhotoUrl} alt={`${item.studentName} profile`} fill sizes="48px" className="object-cover" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-1 text-sm font-black text-brand-900">{item.studentName}</h3>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold text-brand-900/70">{item.result}</p>
                  <Link href={`/success-stories/${studentSlug(item.studentName)}`} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-brand">
                    Story <ArrowRight size={13} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#ffffff] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_16%,rgba(90,19,114,0.09),transparent_28%),radial-gradient(circle_at_78%_26%,rgba(253,231,90,0.5),transparent_28%),linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Student Support</p>
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">The practical tools parents and students need every week.</h2>
            </div>
            <p className="text-sm leading-7 text-brand-900/70">After practice and achievements, the portal still keeps the everyday academy work simple: coach questions, bookings, credits, invoices, fee payments, and progress checks.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {supportTools.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-xl border border-brand/10 bg-white p-5 shadow-xl shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                    <Icon size={21} />
                  </span>
                  <h3 className="mt-4 font-black text-brand-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-brand-900/70">{item.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">How it works</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">A clear learning path parents can follow.</h2>
          </div>
          <div className="grid gap-3">
            {learningSteps.map((step, index) => (
              <div key={step} className="group grid grid-cols-[46px_minmax(0,1fr)] gap-3 rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-sm font-black text-accent shadow-sm shadow-brand-900/20">{index + 1}</div>
                <div className="self-center font-bold text-brand-900">{step}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="centres" className="relative overflow-hidden bg-[#ffffff] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(90,19,114,0.09),transparent_28%),radial-gradient(circle_at_80%_28%,rgba(253,231,90,0.45),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
          <div>
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Centres and Global Reach</p>
            <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">Four Kolkata centres. Online for global students.</h2>
            <p className="mt-4 text-sm leading-7 text-brand-900/70">Branch information now reflects the active four-centre setup.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`tel:${ACADEMY_DEFAULTS.phone}`} className="btn-accent">Call Academy</Link>
              <Link href={`mailto:${ACADEMY_DEFAULTS.email}`} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">Email Academy</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {academyBranches.map((centre) => (
              <div key={centre.name} className="overflow-hidden rounded-xl border border-brand/10 bg-white shadow-xl shadow-brand-900/5 transition hover:border-brand/30 hover:bg-brand-50">
                <div className="p-4">
                <MapPin size={18} className="text-brand" />
                <div className="mt-3 font-black text-brand-900">{centre.name}</div>
                <div className="mt-1 text-sm leading-5 text-brand-900/70">{centre.address}</div>
                <Link href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centre.address)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-black text-brand">
                  Open directions
                </Link>
                </div>
                <iframe
                  title={`${centre.name} map`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(centre.address)}&output=embed`}
                  className="h-32 w-full border-0 grayscale contrast-125"
                  loading="lazy"
                />
              </div>
            ))}
            <div className="rounded-xl border border-brand/15 bg-brand-50 p-4 text-brand-900 sm:col-span-2">
              <Globe2 size={18} className="text-brand" />
              <div className="mt-3 font-black">Online Classes</div>
              <div className="mt-1 text-sm text-brand-900/70">Structured programs, personal mentorship, and proven methods from home.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#f5edf8] px-4 py-16 text-brand-900 sm:px-6 lg:px-8 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="relative mx-auto max-w-7xl rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Start with a free assessment</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Your child&apos;s next great move starts here.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              No obligation. Level recommendation included. Online and offline options available.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">Book Free Demo Class</Link>
            <Link href={demoHref} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">Start Your Chess Journey</Link>
            <Link href="#platform" className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">Explore Learning Portal</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-brand/10 bg-white py-6 text-sm text-brand-900/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>Copyright {new Date().getFullYear()} Envision Chess Academy</div>
          <div className="flex flex-wrap gap-4">
            <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Achievement images</Link>
            <Link href={offlineSourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Offline academy source</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function JourneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-brand/10 bg-white p-3 shadow-sm shadow-brand-900/5">
      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-brand/70">{label}</div>
      <div className="mt-1 text-sm font-black text-brand-900">{value}</div>
    </div>
  );
}
