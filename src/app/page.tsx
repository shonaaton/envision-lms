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
import HeroStudentCluster from "@/components/marketing/HeroStudentCluster";
import WhyEnvision from "@/components/marketing/WhyEnvision";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL } from "@/lib/branding";
import { centreHub } from "@/lib/centrePages";
import { courseTierLabel } from "@/lib/courseTiers";
import { courseHub, coursePages } from "@/lib/coursePages";
import { CURRICULUM_TIERS, curriculumLevels } from "@/lib/demoCurriculum";
import { MARKETING_BASE_URL, OFFLINE_ACADEMY_URL } from "@/lib/publicLinks";
import { academyBranches, anishStory, impactCounters, publicAchievementList, studentSlug } from "@/lib/achievementData";
import { achievementAlt, achievementCaption } from "@/lib/achievementCopy";
import { getLandingAchievements } from "@/lib/achievements";
import { portalTutorials, youtubeEmbedUrl } from "@/lib/portalTutorials";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_BASE_URL),
  title: "Best Chess Coaching in India | Envision Chess Academy",
  description:
    "Best chess coaching in India for kids and beginners: live online chess classes across India, four Kolkata centres, a 240-session curriculum and weekly tournaments.",
  keywords: [
    "best chess coaching in India",
    "chess coaching in India",
    "online chess classes in India",
    "best chess academy in India",
    "chess classes for kids in India",
    "chess coaching in Kolkata",
    "online chess coaching for beginners",
    "chess tournament training India",
  ],
  alternates: { canonical: `${MARKETING_BASE_URL}/` },
  openGraph: {
    title: "Best Chess Coaching in India | Envision Chess Academy",
    description:
      "Structured chess coaching in India - live online across the country and offline at four Kolkata centres - with verified student achievements, weekly tournaments and an all-in-one learning portal.",
    url: `${MARKETING_BASE_URL}/`,
    siteName: "Envision Chess Academy",
    type: "website",
    images: [{ url: "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg", width: 1200, height: 900, alt: "Envision Chess Academy student with a tournament trophy, best chess coaching in India" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Chess Coaching in India | Envision Chess Academy",
    description: "Learn, practise and compete with structured chess coaching in India. Free demo class for every new student.",
    images: ["/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg"],
  },
};

const demoHref = "/register";
const cloudinaryCollectionUrl = "https://collection.cloudinary.com/dlafr6yu3/3ddc9e2d8d7656087c4a52336a2e1df4";
const offlineSourceUrl = OFFLINE_ACADEMY_URL;

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
    coursePath: coursePages.find((page) => page.tier === tier)?.slug,
    ...groupClassCopy[tier],
  };
});

const totalCurriculumSessions = groupClassTracks.reduce((total, track) => total + track.totalSessions, 0);
const totalCurriculumLevels = groupClassTracks.reduce((total, track) => total + track.levels.length, 0);

/**
 * The five steps carry a line of detail each now. They are the page's answer to
 * "how do I actually start chess coaching", so a bare five-word label was
 * leaving the most asked question on the page half answered.
 */
const learningSteps = [
  {
    title: "Book a free chess assessment",
    detail: "A coach meets your child online or at a Kolkata centre, plays through a few positions, and reads where they actually are.",
  },
  {
    title: "Get placed at the right level",
    detail: "The assessment points to the exact session to begin from on the fifteen-level ladder, instead of a generic beginner slot.",
  },
  {
    title: "Attend structured live classes",
    detail: "Two live classes a week, sixteen sessions to a level, about two months from one level to the next.",
  },
  {
    title: "Practise with homework and tournaments",
    detail: "Assignments, tactics trainers and weekly academy tournaments keep the work going between classes.",
  },
  {
    title: "Track progress in the parent portal",
    detail: "Attendance, assignment scores, tournament results, coach feedback and invoices stay visible to parents throughout.",
  },
];

const supportTools = [
  { title: "Ask Coach", detail: "Students can send questions, positions, and doubts directly to their coach between classes.", icon: MessageSquare },
  { title: "Invoices and Fee Payments", detail: "Parents can review credits, download invoices, and complete secure online payments.", icon: Receipt },
  { title: "Class Bookings", detail: "Students can request classes, track approval, and see upcoming sessions in the portal.", icon: CalendarDays },
  { title: "Progress Checks", detail: "Attendance, assignments, tournament results, and leaderboard performance stay visible.", icon: Trophy },
];

/**
 * Homepage FAQs. These double as the FAQPage schema below, so every answer has
 * to be true of the academy as it runs today - the numbers here are the same
 * ones the curriculum, the branch list and the impact counters put on the page.
 */
const homeFaqs = [
  {
    q: "What makes Envision one of the best chess coaching academies in India?",
    a: "Envision Chess Academy has trained over 2,000 students across India and 15+ countries, and produced 100+ rated players and 1,000+ tournament winners. Coaching follows a fixed 240-session curriculum rather than ad-hoc lessons, and every class, homework task, tournament and progress report sits in one portal that parents can see.",
  },
  {
    q: "Do you offer online chess classes across India, or only in Kolkata?",
    a: "Both. Live online chess classes run for students anywhere in India and abroad, and offline coaching runs at four Kolkata centres: Bowbazar, Haridevpur, Jodhpur Park and New Alipore. The curriculum, homework and tournaments are identical either way.",
  },
  {
    q: "Can a complete beginner join the chess coaching programme?",
    a: "Yes. The Beginner stage starts from board vision, piece movement, notation and basic checkmates, so a child who has never played a full game can start there. A free assessment with a coach decides the exact session to begin from.",
  },
  {
    q: "How are the chess classes structured each week?",
    a: "Students attend two live classes a week. Every level runs sixteen sessions across roughly two months, and the full ladder is five stages, fifteen levels and 240 taught sessions from the first move through to Masters.",
  },
  {
    q: "Do students play in chess tournaments?",
    a: "Weekly academy tournaments run inside the portal with real pairings, live games, results and academy leaderboards. Students are also prepared for external rated tournaments, which is where the academy's state, national and international results come from.",
  },
  {
    q: "How can parents track their child's chess progress?",
    a: "Parents use the same portal and can see attendance, homework status and scores, coach feedback, tournament results, progress reports, certificates, class credits and invoices.",
  },
  {
    q: "How do I book a free demo chess class?",
    a: "Register on the site and pick a slot. The demo is a real assessment class with a coach, it carries no obligation, and it ends with a level recommendation for your child. Online and offline options are both available.",
  },
];

function randomizeAchievementOrder<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export default async function Home() {
  const achievements = publicAchievementList(await getLandingAchievements());
  const featuredAchievements = randomizeAchievementOrder(achievements);

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: "Envision Chess Academy",
      legalName: ACADEMY_DEFAULTS.legalName,
      url: `${MARKETING_BASE_URL}/`,
      logo: ACADEMY_LOGO_URL,
      description:
        "Chess coaching academy in India offering structured online chess classes nationwide and offline coaching at four Kolkata centres, with student learning tools, tournament preparation and progress tracking.",
      areaServed: [
        { "@type": "Country", name: "India" },
        { "@type": "City", name: "Kolkata" },
      ],
      knowsAbout: [
        "Chess coaching",
        "Online chess classes",
        "Chess for beginners",
        "Chess tactics and endgame training",
        "Rated chess tournament preparation",
      ],
      address: academyBranches.map((centre) => ({
        "@type": "PostalAddress",
        streetAddress: centre.address,
        addressLocality: "Kolkata",
        addressRegion: "West Bengal",
        addressCountry: "IN",
      })),
      email: ACADEMY_DEFAULTS.email,
      telephone: ACADEMY_DEFAULTS.phone,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: homeFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ];

  return (
    <main id="home" className="landing-compact min-h-screen bg-[#ffffff] text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <MarketingHeader demoHref={demoHref} />

      <section className="relative isolate overflow-hidden bg-[#f5edf8] text-brand-900">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_52%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#f5edf8] to-transparent" />
        <div className="relative mx-auto grid min-h-[calc(100dvh-82px)] max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
          <div className="motion-rise max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white shadow-sm shadow-brand-900/20">
              <ShieldCheck size={15} /> Online &amp; Offline Chess Classes Across India
            </p>
            {/*
              The page's one H1 leads with the phrase parents actually search
              for, and keeps the old promise as the second line so the hero
              still reads like a sentence rather than a keyword.
            */}
            <h1 className="mt-4 max-w-xl text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.7rem]">
              Best Chess Coaching in India
              <span className="mt-2 block text-[1.1rem] font-bold leading-snug text-brand sm:text-[1.3rem] lg:text-[1.55rem]">
                Coaching that feels organised from day one.
              </span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-brand-900/70 sm:text-[0.95rem]">
              Envision Chess Academy runs live online chess classes for students anywhere in India, and offline coaching at four Kolkata centres. Classes, homework, tournaments, coach feedback, payments and progress tracking all sit in one academy portal.
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
          <HeroStudentCluster />
        </div>
      </section>

      <AnimatedImpactCounters
        counters={impactCounters}
        heading="Chess coaching results from across India and beyond."
        intro="Students trained online from every part of India and in person at our Kolkata centres, with the rating gains and tournament results to show for it."
      />

      <WhyEnvision
        demoHref={demoHref}
        secondary={{ href: "#programs", label: "See the full curriculum" }}
        heading="Why parents call Envision the best chess coaching in India."
        intro="Not a set of loose classes. A structured chess curriculum, a coach who knows exactly where your child is, and a portal that shows parents the progress - whether you join online from anywhere in India or walk into one of our Kolkata centres."
      />

      <section id="programs" className="relative overflow-hidden bg-[#ffffff] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(253,231,90,0.55),transparent_32%),radial-gradient(circle_at_86%_22%,rgba(90,19,114,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Group Chess Classes in India</p>
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">A complete chess course, from beginner to champion.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-900/70">
                Students learn in a structured batch with regular practice, guided coach feedback and continuous competitive exposure. The ladder below is the same for online chess classes anywhere in India and for offline batches in Kolkata, so a child never has to restart because they moved city or switched to online.
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
                  {/* Every stage has its own page under the courses hub. */}
                  <Link
                    href={track.coursePath ? `/${track.coursePath}` : demoHref}
                    className="inline-flex items-center gap-1 text-sm font-black text-brand hover:underline"
                  >
                    {track.coursePath ? `See all ${track.totalSessions} sessions` : "Book Free Demo Class"} <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={`/${courseHub.slug}`} className="btn-accent">
              See all online chess coaching courses <ArrowRight size={16} />
            </Link>
            <Link href={demoHref} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
              Book Free Demo Class
            </Link>
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
              <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900">Every chess class, homework task and report in one portal.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-brand-900/70">
              Students see what to attend, what to practise, what to submit and how they are progressing. It is the part most online chess coaching leaves scattered across chat groups and spreadsheets, and it is the part parents ask about most.
            </p>
          </div>
          {/*
            The Student Command Centre lives here rather than in the hero: this
            section is where the portal is actually being explained, so the real
            UI belongs above the feature cards that describe it.
          */}
          <div className="mb-10 xl:mb-28">
            <DynamicLandingShowcase achievements={featuredAchievements} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {portalTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="group rounded-xl border border-brand/10 bg-white p-4 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                    <Icon size={19} className="text-brand" />
                    <h3 className="mt-3 text-sm font-black text-brand-900">{item.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-brand-900/70">{item.points.slice(0, 3).join(" · ")}</p>
                  </article>
                );
              })}
          </div>
          <div className="mt-10 border-t border-brand/10 pt-8">
            <div className="mb-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm shadow-brand-900/20">Platform Tutorials</p>
                <h3 className="mt-4 text-2xl font-black leading-tight text-brand-900">See how the online chess coaching platform works.</h3>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-brand-900/70">
                New students can watch these short walkthroughs before their first chess class and arrive already knowing where the live board, homework and tournament lobby are.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {portalTutorials.map((tutorial) => (
                <article key={tutorial.videoId} className="overflow-hidden rounded-xl border border-brand/10 bg-white shadow-xl shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                  <figure className="m-0">
                    <div className="aspect-video bg-brand-900">
                      <iframe
                        title={`${tutorial.title} - Envision Chess Academy portal tutorial`}
                        src={youtubeEmbedUrl(tutorial.videoId)}
                        className="h-full w-full border-0"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                    <figcaption className="p-4">
                      <h4 className="flex items-center gap-2 text-sm font-black text-brand-900">
                        <PlayCircle size={18} className="shrink-0 text-brand" />
                        {tutorial.title}
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-brand-900/70">{tutorial.detail}</p>
                    </figcaption>
                  </figure>
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
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">Daily chess practice between live classes.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-900/70">Good chess coaching is only half the week. Students anywhere in India can solve tactics, learn coordinates, hunt kings, play computer bots, finish assignments and climb academy leaderboards from the same portal they attend class in.</p>
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
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">Parent and student reviews of our chess coaching.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-900/70">Unedited Google reviews from families at the Kolkata centres and from students taking online chess classes with us.</p>
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
          <figure className="group m-0 overflow-hidden border border-brand/10 bg-white shadow-xl shadow-brand-900/5">
            <div className="relative aspect-[0.92] rounded-xl bg-brand-50">
              <Image src="/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg" alt="" aria-hidden fill sizes="(min-width: 1024px) 38vw, 100vw" className="scale-110 object-cover opacity-15 blur-2xl" />
              <Image src="/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg" alt="Anish Bijibilla, Envision Chess Academy student, after qualifying for the FIDE World Cadets Cup in Batumi" fill sizes="(min-width: 1024px) 28vw, 100vw" className="object-contain p-4 transition duration-700 group-hover:scale-[1.015]" />
            </div>
            <figcaption className="border-t border-brand/10 px-4 py-3 text-xs leading-5 text-brand-900/70">
              Anish Bijibilla went from complete beginner to England&apos;s No. 1 Under-7 in two and a half years of online chess coaching with Envision.
            </figcaption>
          </figure>
          <div className="self-center">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm shadow-brand-900/20">Student Journey</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900">Anish: from first chess lesson to World Cadets qualifier.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-brand-900/70">
              {anishStory.achievement}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-brand-900/70">
              Anish learned entirely through live online classes, the same structured coaching our students across India follow: a placement assessment, two classes a week, homework reviewed by a coach, and tournament preparation before every event.
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
              <h2 className="mt-4 text-2xl font-black text-brand-900">Recent results from our chess students.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">Podium finishes, age-group titles and FIDE ratings won by students coached at Envision - the plainest answer we can give to what good chess coaching in India produces.</p>
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
                {/*
                  Each card is a figure now: the photo gets alt text built from
                  the record, and the caption names the event, year and level
                  instead of leaving the result as a floating line of text.
                */}
                <figure className="m-0">
                  <div className="relative aspect-[1.08] overflow-hidden rounded-xl bg-brand-50 shadow-inner shadow-brand-900/10">
                    <Image src={item.achievementImageUrl} alt="" aria-hidden fill sizes="(min-width: 1024px) 25vw, 50vw" className="scale-110 object-cover opacity-12 blur-2xl transition duration-700" />
                    <Image src={item.achievementImageUrl} alt={achievementAlt(item)} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-contain p-3 transition duration-700 group-hover:scale-[1.02]" />
                    <div className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-black text-accent shadow-sm">#{index + 1}</div>
                    {item.studentPhotoUrl && (
                      <div className="absolute bottom-3 right-3 h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-white">
                        <Image src={item.studentPhotoUrl} alt={`Portrait of ${item.studentName}, chess student at Envision Chess Academy`} fill sizes="48px" className="object-cover" />
                      </div>
                    )}
                  </div>
                  <figcaption className="p-3">
                    <h3 className="line-clamp-1 text-sm font-black text-brand-900">{item.studentName}</h3>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-brand-900/70">{item.result}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-brand-900/55">{achievementCaption(item)}</p>
                    <Link href={`/success-stories/${studentSlug(item.studentName)}`} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-brand">
                      Story <ArrowRight size={13} />
                    </Link>
                  </figcaption>
                </figure>
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
              <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">The weekly tools parents and chess students actually use.</h2>
            </div>
            <p className="text-sm leading-7 text-brand-900/70">Beyond the classes themselves, the portal keeps the everyday running of chess coaching simple for families in any time zone: coach questions between sessions, class bookings, credits, invoices, online fee payments and progress checks.</p>
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
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">How to start chess coaching with us, in five steps.</h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">The path is identical for a family walking into a Kolkata centre and for a student joining online chess classes from anywhere else in India.</p>
          </div>
          <div className="grid gap-3">
            {learningSteps.map((step, index) => (
              <div key={step.title} className="group grid grid-cols-[46px_minmax(0,1fr)] gap-3 rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-sm font-black text-accent shadow-sm shadow-brand-900/20">{index + 1}</div>
                <div className="self-center">
                  <h3 className="font-bold text-brand-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-brand-900/70">{step.detail}</p>
                </div>
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
            <h2 className="mt-4 text-2xl font-black text-brand-900 sm:text-3xl">Chess classes in Kolkata, online chess coaching across India.</h2>
            <p className="mt-4 text-sm leading-7 text-brand-900/70">Four coaching centres in Kolkata run in-person batches, and live online batches take students from every other part of India and from 15+ countries. Same curriculum, same coaches, same portal.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/${centreHub.slug}`} className="btn-accent">{centreHub.navLabel} <ArrowRight size={16} /></Link>
              <Link href={`tel:${ACADEMY_DEFAULTS.phone}`} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">Call Academy</Link>
              <Link href={`mailto:${ACADEMY_DEFAULTS.email}`} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">Email Academy</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {academyBranches.map((centre) => (
              <div key={centre.name} className="overflow-hidden rounded-xl border border-brand/10 bg-white shadow-xl shadow-brand-900/5 transition hover:border-brand/30 hover:bg-brand-50">
                <div className="p-4">
                <MapPin size={18} className="text-brand" />
                <h3 className="mt-3 font-black text-brand-900">
                  <Link href={centre.href} className="hover:text-brand hover:underline">{centre.name} chess coaching centre</Link>
                </h3>
                <address className="mt-1 text-sm not-italic leading-5 text-brand-900/70">{centre.address}</address>
                <Link href={centre.href} className="mt-3 inline-flex text-xs font-black text-brand hover:underline">
                  Timings, coach and directions
                </Link>
                </div>
                <figure className="m-0">
                  <iframe
                    title={`Map to the Envision Chess Academy ${centre.name} chess coaching centre in Kolkata`}
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(centre.address)}&output=embed`}
                    className="h-32 w-full border-0 grayscale contrast-125"
                    loading="lazy"
                  />
                  <figcaption className="border-t border-brand/10 px-4 py-2 text-[11px] leading-4 text-brand-900/60">
                    Offline chess classes at our {centre.name} centre, Kolkata.
                  </figcaption>
                </figure>
              </div>
            ))}
            <div className="rounded-xl border border-brand/15 bg-brand-50 p-4 text-brand-900 sm:col-span-2">
              <Globe2 size={18} className="text-brand" />
              <h3 className="mt-3 font-black">Online chess classes across India</h3>
              <p className="mt-1 text-sm text-brand-900/70">Delhi, Mumbai, Bengaluru, Hyderabad, Chennai, Pune or a small town with a good connection - the structured programme, personal mentorship and weekly tournaments reach students at home, wherever home is.</p>
            </div>
          </div>
        </div>
      </section>

      {/*
        The FAQ answers the questions a parent types into search before they
        ever reach the site, and the same list feeds the FAQPage schema at the
        top of the page, so the two can never drift apart.
      */}
      <section id="faq" className="relative overflow-hidden bg-[#ffffff] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Questions</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Questions parents ask about chess coaching in India.</h2>
          <p className="mt-3 text-sm leading-7 text-brand-900/70">
            Everything below is how the academy runs today - the curriculum length, the class rhythm, the centres and what parents can see.
          </p>
          <div className="mt-8 grid gap-3">
            {homeFaqs.map((faq) => (
              <details key={faq.q} className="group rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:border-brand/30">
                {/* One heading inside <summary> keeps the markup valid while still
                    putting the question in the document outline. */}
                <summary className="cursor-pointer list-none">
                  <h3 className="flex items-center justify-between gap-4 text-sm font-black text-brand-900">
                    {faq.q}
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-accent transition-transform duration-300 group-open:rotate-45" aria-hidden>+</span>
                  </h3>
                </summary>
                <p className="mt-3 text-sm leading-6 text-brand-900/70">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#f5edf8] px-4 py-16 text-brand-900 sm:px-6 lg:px-8 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="relative mx-auto max-w-7xl rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Start with a free assessment</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Start the best chess coaching in India with a free demo class.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              No obligation, and a level recommendation for your child at the end of it. Online chess classes across India and offline coaching in Kolkata are both open for booking.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">Book Free Demo Class</Link>
            <Link href={demoHref} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">Start Your Chess Journey</Link>
            <Link href="#platform" className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">Explore Learning Portal</Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
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
