import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Crown,
  CreditCard,
  Gamepad2,
  Globe2,
  MapPin,
  Menu,
  MessageSquare,
  MonitorSmartphone,
  Quote,
  Receipt,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  WalletCards,
} from "lucide-react";
import Logo from "@/components/layout/Logo";
import AnimatedImpactCounters from "@/components/marketing/AnimatedImpactCounters";
import TestimonialCarousel from "@/components/marketing/TestimonialCarousel";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { academyBranches, anishStory, impactCounters, publicAchievementList, studentSlug } from "@/lib/achievementData";
import { getLandingAchievements } from "@/lib/achievements";
import { getLandingReviews } from "@/lib/googleReviews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.envisionchessacademy.com"),
  title: "Envision Chess Academy | Premium Chess Coaching and Student LMS",
  description:
    "Premium online and offline chess coaching with verified student achievements, structured mentorship, tournaments, practice tools, progress tracking, and payments in one student portal.",
  alternates: { canonical: "https://www.envisionchessacademy.com/" },
  openGraph: {
    title: "Envision Chess Academy",
    description: "Structured chess coaching, verified student achievements, and an all-in-one learning portal.",
    url: "https://www.envisionchessacademy.com/",
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
const offlineSourceUrl = "https://www.envisionchessacademy.com/chess-academy-in-kolkata";

const navItems = [
  ["Home", "#home"],
  ["Portal", "#platform"],
  ["Reviews", "#reviews"],
  ["Anish", "#anish"],
  ["Achievements", "#achievements"],
  ["Programs", "#programs"],
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

const programs = [
  { title: "Group Classes", detail: "Level-based batches for structured progress and healthy competition.", mode: "Beginner to advanced" },
  { title: "Individual Coaching", detail: "Personal mentoring for students who need deeper attention and tournament planning.", mode: "Custom plan" },
  { title: "Rated-Player Training", detail: "Opening preparation, game analysis, calculation routines, and event readiness.", mode: "Advanced track" },
];

const advantages = [
  "FIDE-certified and FIDE-rated coaches",
  "Structured level-based pedagogy",
  "Small group sizes",
  "Monthly feedback and PTMs",
  "Regular practice tournaments",
  "Personalised assignments",
  "Online and offline learning",
  "Dedicated mentorship",
];

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

export default async function Home() {
  const achievements = publicAchievementList(await getLandingAchievements());
  const reviews = await getLandingReviews();

  const schema = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Envision Chess Academy",
    url: "https://www.envisionchessacademy.com/",
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
    <main id="home" className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#17051f]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="#home" aria-label="Envision Chess Academy home">
            <Logo tone="yellow" className="max-w-[178px] sm:max-w-[230px]" />
          </Link>
          <nav className="hidden items-center gap-5 xl:flex" aria-label="Main navigation">
            {navItems.map(([label, href]) => (
              <Link key={href} href={href} className="text-sm font-semibold text-white/72 hover:text-accent">
                {label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/login" className="btn border border-white/15 bg-white/10 text-white hover:bg-white/15">
              Login
            </Link>
            <Link href={demoHref} className="btn-accent">
              Book Free Demo Class
            </Link>
          </div>
          <details className="relative xl:hidden">
            <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-lg border border-white/15 bg-white/10 text-accent">
              <Menu size={20} />
            </summary>
            <div className="absolute right-0 mt-3 w-[min(88vw,340px)] rounded-lg border border-white/12 bg-[#21082c] p-3 shadow-2xl shadow-black/35">
              {navItems.map(([label, href]) => (
                <Link key={href} href={href} className="block rounded-lg px-3 py-3 text-sm font-bold text-white/80 hover:bg-white/10">
                  {label}
                </Link>
              ))}
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
                <Link href="/login" className="btn border border-white/15 bg-white/10 text-white">Login</Link>
                <Link href={demoHref} className="btn-accent">Book Free Demo Class</Link>
              </div>
            </div>
          </details>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#17051f] text-white">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,#0d1018_0%,#1a0a22_42%,#32103f_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(253,231,90,0.12),transparent_24%),radial-gradient(circle_at_18%_82%,rgba(93,183,156,0.16),transparent_28%)]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.075)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:min-h-[calc(100dvh-74px)] lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:py-16">
          <div className="motion-rise">
            <p className="inline-flex items-center gap-2 border-l-2 border-accent bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">
              <ShieldCheck size={15} /> Premium Chess Mentorship
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.03] text-white sm:text-6xl lg:text-[4.35rem]">
              Build tournament-ready chess players with structured coaching.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
              Certified mentors, verified student achievements, focused practice systems, and transparent progress tracking inside one premium academy ecosystem.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-12 px-5 shadow-lg shadow-accent/10">
                Book Free Demo Class <ArrowRight size={18} />
              </Link>
              <Link href="#platform" className="btn min-h-12 border border-white/14 bg-white/[0.06] px-5 text-white hover:bg-white/[0.1]">
                Explore Learning Portal
              </Link>
              <Link href="/success-stories" className="btn min-h-12 border border-white/14 bg-white/[0.06] px-5 text-white hover:bg-white/[0.1]">
                Student Success Stories
              </Link>
            </div>
            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ["Assessment", "Clear level mapping"],
                ["Mentorship", "Coach-led progress"],
                ["Tournament Prep", "Practice to performance"],
              ].map(([label, detail]) => (
                <div key={label} className="border border-white/10 bg-white/[0.045] p-3">
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <CheckCircle2 size={16} className="text-accent" /> {label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-white/55">{detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:pl-4">
            <PortalMockup />
          </div>
        </div>
      </section>

      <AnimatedImpactCounters counters={impactCounters} />

      <section id="platform" className="relative overflow-hidden bg-[#10131b] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(93,183,156,0.16),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(253,231,90,0.1),transparent_24%),linear-gradient(180deg,#10131b_0%,#17051f_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Student Learning Portal</p>
              <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-5xl">Everything students use to learn, practise, compete, and improve.</h2>
            </div>
            <p className="text-sm leading-7 text-white/66 sm:text-base">
              The portal brings live classes, assignments, practice tools, tournaments, progress reports, certificates, leaderboards, Ask Coach, and payments into one student-friendly learning platform.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="relative">
              <div className="absolute -inset-4 rounded-lg bg-accent/10 blur-3xl" />
              <PortalMockup />
            </div>
            <div className="grid content-start gap-3 sm:grid-cols-2">
              {portalTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="group rounded-lg border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/10 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-accent/30 hover:bg-white/[0.075]">
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent transition group-hover:bg-accent group-hover:text-brand">
                        <Icon size={20} />
                      </span>
                      <div>
                        <h3 className="font-black text-white">{item.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.points.map((point) => (
                            <span key={point} className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-0.5 text-xs font-semibold text-white/62">{point}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#17051f] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#17051f_0%,#10131b_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Practice Tools</p>
              <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">Focused training between live classes.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64">Students can solve tactics, learn coordinates, hunt kings, play computer bots, complete assignments, and climb academy leaderboards from the same portal.</p>
            </div>
            <Link href={demoHref} className="btn border border-white/14 bg-white/[0.06] text-white hover:bg-white/[0.1]">Explore Learning Portal</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {practiceTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <article key={tool.title} className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/12 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-accent/30 hover:bg-white/[0.075]">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-accent/10 text-accent transition group-hover:bg-accent group-hover:text-brand">
                    <Icon size={21} />
                  </span>
                  <h3 className="mt-4 font-black text-white">{tool.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/62">{tool.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="reviews" className="relative overflow-hidden bg-[#10131b] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(253,231,90,0.1),transparent_24%),linear-gradient(180deg,#10131b_0%,#17051f_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Google Reviews</p>
              <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">Reviews from parents and students.</h2>
            </div>
            <Link href={offlineSourceUrl} target="_blank" rel="noreferrer" className="btn border border-white/14 bg-white/[0.06] text-white hover:bg-white/[0.1]">
              Review Source <ArrowRight size={16} />
            </Link>
          </div>
          <TestimonialCarousel reviews={reviews} />
        </div>
      </section>

      <section id="anish" className="relative overflow-hidden bg-[#10131b] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_30%,rgba(253,231,90,0.1),transparent_25%),radial-gradient(circle_at_74%_16%,rgba(90,19,114,0.42),transparent_30%),linear-gradient(180deg,#10131b_0%,#17051f_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div className="group overflow-hidden rounded-lg border border-white/12 bg-white/[0.055] shadow-2xl shadow-black/35 backdrop-blur">
            <div className="relative aspect-[0.92] bg-[#090b10]">
              <Image src="/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg" alt="" fill sizes="(min-width: 1024px) 38vw, 100vw" className="scale-110 object-cover opacity-25 blur-2xl" />
              <Image src="/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg" alt="Anish qualified for the World Cadets Chess Championship" fill sizes="(min-width: 1024px) 38vw, 100vw" className="object-contain p-4 transition duration-700 group-hover:scale-[1.015] sm:p-6" />
            </div>
          </div>
          <div className="self-center">
            <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Student Journey</p>
            <h2 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">Meet Anish: A Journey Built Move by Move</h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/72">
              {anishStory.achievement}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <JourneyStat label="Starting Level" value={anishStory.startingLevel} />
              <JourneyStat label="Current Level" value={anishStory.currentLevel} />
              <JourneyStat label="Coaching Duration" value={anishStory.coachingDuration} />
            </div>
            <div className="mt-5 rounded-lg border border-white/12 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <Quote className="text-accent" size={24} />
              <p className="mt-3 text-base leading-8 text-white/74">{anishStory.fatherTestimonial}</p>
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="font-black text-white">{anishStory.fatherName}</div>
                <div className="mt-1 text-sm text-white/52">Anish&apos;s father</div>
              </div>
            </div>
            <Link href={demoHref} className="btn-accent mt-6 min-h-12 px-5">
              Start Your Chess Journey <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section id="achievements" className="relative overflow-hidden bg-[#17051f] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(253,231,90,0.1),transparent_26%),radial-gradient(circle_at_82%_12%,rgba(93,183,156,0.13),transparent_25%),linear-gradient(180deg,#17051f_0%,#10131b_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Other Achievers</p>
              <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">A curated proof wall of tournament progress.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64">Real achievement cards from Envision students, shown after the main portal story and Anish journey.</p>
            </div>
            <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="btn border border-white/14 bg-white/[0.06] text-white hover:bg-white/[0.1]">
              Cloudinary Collection <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {achievements.slice(0, 8).map((item, index) => (
              <article key={`${item.studentName}-${item.displayOrder}`} className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/18 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-accent/35 hover:bg-white/[0.075]">
                <div className="relative aspect-[1.08] overflow-hidden bg-[#090b10]">
                  <Image src={item.achievementImageUrl} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="scale-110 object-cover opacity-22 blur-2xl transition duration-700" />
                  <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-contain p-3 transition duration-700 group-hover:scale-[1.02]" />
                  <div className="absolute left-3 top-3 border border-accent/30 bg-accent px-2.5 py-1 text-xs font-black text-brand">#{index + 1}</div>
                  <div className="absolute right-3 top-3 border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/78 backdrop-blur">{item.achievementLevel}</div>
                  {item.studentPhotoUrl && (
                    <div className="absolute bottom-3 right-3 h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-white">
                      <Image src={item.studentPhotoUrl} alt={`${item.studentName} profile`} fill sizes="48px" className="object-cover" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-accent/80">{item.category}</div>
                  <h3 className="mt-2 line-clamp-1 font-black text-white">{item.studentName}</h3>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/48">{item.tournamentName}</p>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white/76">{item.result}</p>
                  <p className="mt-3 flex items-center gap-1 text-xs text-white/46"><MapPin size={13} /> {item.tournamentLocation}</p>
                  <Link href={`/success-stories/${studentSlug(item.studentName)}`} className="mt-4 inline-flex items-center gap-1 text-sm font-black text-accent">
                    Student Profile <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#10131b] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(93,183,156,0.14),transparent_26%),radial-gradient(circle_at_76%_28%,rgba(253,231,90,0.1),transparent_24%),linear-gradient(180deg,#10131b_0%,#17051f_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Student Support</p>
              <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">The practical tools parents and students need every week.</h2>
            </div>
            <p className="text-sm leading-7 text-white/64">After practice and achievements, the portal still keeps the everyday academy work simple: coach questions, bookings, credits, invoices, fee payments, and progress checks.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {supportTools.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-lg border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/12 backdrop-blur transition hover:-translate-y-1 hover:border-accent/30 hover:bg-white/[0.075]">
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-accent/10 text-accent">
                    <Icon size={21} />
                  </span>
                  <h3 className="mt-4 font-black text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#17051f] py-16 text-white lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">How it works</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">A clear learning path parents can follow.</h2>
          </div>
          <div className="grid gap-3">
            {learningSteps.map((step, index) => (
              <div key={step} className="group grid grid-cols-[46px_minmax(0,1fr)] gap-3 rounded-lg border border-white/12 bg-white/[0.07] p-4 transition hover:-translate-y-1 hover:bg-white/[0.1]">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-sm font-black text-brand-900">{index + 1}</div>
                <div className="self-center font-bold text-white">{step}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="programs" className="relative overflow-hidden bg-[#10131b] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_16%,rgba(253,231,90,0.1),transparent_24%),radial-gradient(circle_at_76%_38%,rgba(90,19,114,0.36),transparent_30%),linear-gradient(180deg,#10131b_0%,#17051f_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Coaching Advantages</p>
              <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">Structured coaching with visible support.</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-white/64">Clear levels, mentor attention, feedback loops, and tournament preparation form the operating system behind every student journey.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {advantages.map((advantage) => (
                <div key={advantage} className="rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-bold text-white/74 shadow-2xl shadow-black/10 backdrop-blur transition hover:border-accent/30 hover:bg-white/[0.075]">
                  <CheckCircle2 size={17} className="mb-2 text-accent" />
                  {advantage}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {programs.map((program) => (
              <article key={program.title} className="group rounded-lg border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/12 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-accent/30 hover:bg-white/[0.075]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-black text-white">{program.title}</h3>
                  <span className="rounded-full border border-accent/30 bg-accent/12 px-2.5 py-0.5 text-xs font-semibold text-accent">{program.mode}</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-white/62">{program.detail}</p>
                <Link href={demoHref} className="mt-5 inline-flex items-center gap-1 text-sm font-black text-accent">Book Free Demo Class <ArrowRight size={16} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="centres" className="relative overflow-hidden bg-[#10131b] py-16 text-white lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_24%,rgba(93,183,156,0.14),transparent_26%),radial-gradient(circle_at_78%_30%,rgba(253,231,90,0.09),transparent_25%),linear-gradient(180deg,#10131b_0%,#17051f_100%)]" />
        <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
          <div>
            <p className="inline-flex border-l-2 border-accent bg-white/[0.045] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-accent">Centres and Global Reach</p>
            <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">Four Kolkata centres. Online for global students.</h2>
            <p className="mt-4 text-sm leading-7 text-white/64">Branch information now reflects the active four-centre setup.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`tel:${ACADEMY_DEFAULTS.phone}`} className="btn-accent">Call Academy</Link>
              <Link href={`mailto:${ACADEMY_DEFAULTS.email}`} className="btn border border-white/14 bg-white/[0.06] text-white hover:bg-white/[0.1]">Email Academy</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {academyBranches.map((centre) => (
              <div key={centre.name} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/12 backdrop-blur transition hover:border-accent/30 hover:bg-white/[0.075]">
                <div className="p-4">
                <MapPin size={18} className="text-accent" />
                <div className="mt-3 font-black text-white">{centre.name}</div>
                <div className="mt-1 text-sm leading-5 text-white/56">{centre.address}</div>
                <Link href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centre.address)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-black text-accent">
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
            <div className="rounded-lg border border-accent/20 bg-accent/12 p-4 text-white shadow-2xl shadow-black/12 backdrop-blur sm:col-span-2">
              <Globe2 size={18} className="text-accent" />
              <div className="mt-3 font-black">Online Classes</div>
              <div className="mt-1 text-sm text-white/66">Structured programs, personal mentorship, and proven methods from home.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#17051f] px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#17051f_0%,#0d1018_100%)]" />
        <div className="relative mx-auto max-w-7xl rounded-lg border border-white/12 bg-white/[0.055] p-6 shadow-2xl shadow-black/25 backdrop-blur sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Start with a free assessment</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Your Child&apos;s Next Great Move Starts Here</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
              No obligation. Level recommendation included. Online and offline options available.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">Book Free Demo Class</Link>
            <Link href={demoHref} className="btn border border-white/15 bg-white/10 text-white">Start Your Chess Journey</Link>
            <Link href="#platform" className="btn border border-white/15 bg-white/10 text-white">Explore Learning Portal</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#0d1018] py-6 text-sm text-white/46">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>Copyright {new Date().getFullYear()} Envision Chess Academy</div>
          <div className="flex flex-wrap gap-4">
            <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent">Achievement images</Link>
            <Link href={offlineSourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent">Offline academy source</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function JourneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-4 shadow-lg shadow-black/10 backdrop-blur">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-accent/80">{label}</div>
      <div className="mt-2 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function PortalMockup({ light = false }: { light?: boolean }) {
  const shell = light ? "border-slate-200 bg-white text-slate-950 shadow-xl shadow-brand-900/8" : "border-white/12 bg-[#171820]/78 text-white shadow-2xl shadow-black/35 backdrop-blur-xl";
  const soft = light ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-white/[0.045] border-white/10 text-white/62";
  const heading = light ? "text-slate-950" : "text-white";

  return (
    <div className={`motion-rise rounded-lg border p-4 ${shell}`}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-current/10 pb-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-accent">Learning Portal</div>
          <div className={`mt-1 text-lg font-black ${heading}`}>Progress Command Centre</div>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-brand-900 shadow-lg shadow-accent/10">
          <Trophy size={18} />
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Next Class", "Today 6:30 PM", CalendarDays],
          ["Assignments", "2 pending", ClipboardList],
          ["Attendance", "92% this month", CheckCircle2],
          ["Credits", "8 classes left", CreditCard],
        ].map(([label, value, Icon]) => (
          <div key={String(label)} className={`rounded-lg border p-3 ${soft}`}>
            <Icon size={17} className={light ? "text-brand" : "text-accent"} />
            <div className={`mt-2 text-sm font-black ${heading}`}>{value as string}</div>
            <div className="mt-1 text-xs">{label as string}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-3">
          {[
            [CalendarDays, "Live Classes", "Join scheduled rooms"],
            [ClipboardList, "Assignments", "Submit and review work"],
            [Trophy, "Leaderboards", "Compete with academy students"],
            [ShieldCheck, "Certificates", "Track milestones"],
          ].map(([Icon, title, note]) => (
            <div key={String(title)} className={`flex items-center gap-3 rounded-lg border p-3 ${soft}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${light ? "bg-brand/10 text-brand" : "bg-accent/10 text-accent"}`}>
                <Icon size={17} />
              </span>
              <span>
                <span className={`block text-sm font-black ${heading}`}>{title as string}</span>
                <span className="block text-xs">{note as string}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="grid gap-3">
          {[
            [MessageSquare, "Ask Coach", "1 unread reply"],
            [BellRing, "Notifications", "Tournament reminder"],
            [Receipt, "Invoices", "PDF ready"],
            [BookOpen, "Practice", "Tactics, King Hunt, Computer"],
          ].map(([Icon, title, note]) => (
            <div key={String(title)} className={`flex items-center gap-3 rounded-lg border p-3 ${soft}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${light ? "bg-brand/10 text-brand" : "bg-accent/10 text-accent"}`}>
                <Icon size={17} />
              </span>
              <span>
                <span className={`block text-sm font-black ${heading}`}>{title as string}</span>
                <span className="block text-xs">{note as string}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
