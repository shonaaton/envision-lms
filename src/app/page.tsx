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
import AchievementShowcase from "@/components/marketing/AchievementShowcase";
import TestimonialCarousel from "@/components/marketing/TestimonialCarousel";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { academyBranches, anishStory, impactCounters, publicAchievementList, studentSlug, verifiedReviews } from "@/lib/achievementData";
import { getLandingAchievements } from "@/lib/achievements";

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
  ["Achievements", "#achievements"],
  ["Anish", "#anish"],
  ["Portal", "#platform"],
  ["Programs", "#programs"],
  ["Reviews", "#reviews"],
  ["Centres", "#centres"],
];

const portalTabs = [
  { title: "Dashboard", icon: MonitorSmartphone, points: ["Upcoming classes", "Homework status", "Attendance", "Credit balance", "Notifications"] },
  { title: "Live Classes", icon: CalendarDays, points: ["Assigned classrooms", "Scheduled join button", "Live chessboard", "Chat and questions", "Shared notes"] },
  { title: "Homework", icon: ClipboardList, points: ["Pending work", "Late work", "Move submission", "Score after submission", "Coach feedback"] },
  { title: "Competition", icon: Trophy, points: ["Tournament lobby", "Pairings", "Live games", "Results", "Leaderboards"] },
  { title: "Payments", icon: WalletCards, points: ["Credit balance", "Usage history", "Monthly dues", "Invoice PDF", "Razorpay payments"] },
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

export default async function Home() {
  const achievements = publicAchievementList(await getLandingAchievements());
  const featured = achievements.filter((item) => item.isFeatured).slice(0, 12);
  const heroCards = featured.slice(0, 5);

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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(253,231,90,0.17),transparent_30%),linear-gradient(125deg,#17051f_0%,#45105a_52%,#0c1017_100%)]" />
        <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(45deg,#fde75a_25%,transparent_25%),linear-gradient(-45deg,#fde75a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#fde75a_75%),linear-gradient(-45deg,transparent_75%,#fde75a_75%)] [background-position:0_0,0_20px,20px_-20px,-20px_0] [background-size:40px_40px]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:min-h-[calc(100dvh-74px)] lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:px-8 lg:py-16">
          <div className="motion-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-accent">
              <ShieldCheck size={15} /> Empower Your Chess Vision
            </p>
            <h1 className="mt-5 text-4xl font-black leading-[1.04] text-white sm:text-6xl">
              Structured Chess Coaching. Proven Champions. One Powerful Platform.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg">
              Envision Chess Academy combines certified coaching, tournament preparation, regular feedback, structured learning, and an all-in-one student portal for measurable chess improvement.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-12 px-5">
                Book Free Demo Class <ArrowRight size={18} />
              </Link>
              <Link href="#platform" className="btn min-h-12 border border-white/18 bg-white/10 px-5 text-white hover:bg-white/15">
                Explore Learning Portal
              </Link>
              <Link href="/success-stories" className="btn min-h-12 border border-white/18 bg-white/10 px-5 text-white hover:bg-white/15">
                Student Success Stories
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-white/78">
              {["Free assessment", "Level recommendation", "Online and offline options"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-2">
                  <CheckCircle2 size={16} className="text-accent" /> {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <HeroSpotlight achievements={heroCards} />
            <PortalMockup />
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-8 grid max-w-7xl gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        {impactCounters.map((item, index) => (
          <article key={item.label} className="counter-card motion-rise rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-brand-900/10" style={{ animationDelay: `${index * 80}ms` }}>
            <div className="text-3xl font-black text-brand">{item.value}</div>
            <div className="mt-2 text-sm font-semibold leading-5 text-slate-600">{item.label}</div>
          </article>
        ))}
      </section>

      <AchievementShowcase achievements={featured.length ? featured : achievements} />

      <section id="anish" className="bg-[#fffdf0] py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div className="group overflow-hidden rounded-lg border border-brand/10 bg-white shadow-2xl shadow-brand-900/12">
            <div className="relative aspect-[0.92]">
              <Image src="/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg" alt="Anish qualified for the World Cadets Chess Championship" fill sizes="(min-width: 1024px) 38vw, 100vw" className="object-cover object-center transition duration-700 group-hover:scale-[1.035]" />
            </div>
          </div>
          <div className="self-center">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Dedicated Student Spotlight</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">Meet Anish: A Journey Built Move by Move</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              {anishStory.achievement}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <JourneyStat label="Starting Level" value={anishStory.startingLevel} />
              <JourneyStat label="Current Level" value={anishStory.currentLevel} />
              <JourneyStat label="Coaching Duration" value={anishStory.coachingDuration} />
            </div>
            <div className="mt-5 rounded-lg border border-brand/10 bg-white p-5 shadow-xl shadow-brand-900/8">
              <Quote className="text-brand" size={24} />
              <p className="mt-3 text-base leading-8 text-slate-700">{anishStory.fatherTestimonial}</p>
              <div className="mt-4 font-black text-slate-950">Anish&apos;s Father</div>
            </div>
            <Link href={demoHref} className="btn-primary mt-6 min-h-12 px-5">
              Start Your Chess Journey <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Achievement Gallery</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">A visible record of tournament progress.</h2>
            </div>
            <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="btn-outline">
              Cloudinary Collection <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {achievements.slice(0, 8).map((item, index) => (
              <article key={`${item.studentName}-${item.displayOrder}`} className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/12">
                <div className="relative aspect-[1.08] overflow-hidden bg-slate-100">
                  <Image src={item.achievementImageUrl} alt={`${item.studentName} achievement`} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition duration-700 group-hover:scale-110" />
                  <div className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-xs font-black text-brand">#{index + 1}</div>
                  {item.studentPhotoUrl && (
                    <div className="absolute bottom-3 right-3 h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-white">
                      <Image src={item.studentPhotoUrl} alt={`${item.studentName} profile`} fill sizes="48px" className="object-cover" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-brand">{item.achievementLevel}</div>
                  <h3 className="mt-2 line-clamp-1 font-black text-slate-950">{item.studentName}</h3>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.tournamentName}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-700">{item.result}</p>
                  <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} /> {item.tournamentLocation}</p>
                  <Link href={`/success-stories/${studentSlug(item.studentName)}`} className="mt-4 inline-flex items-center gap-1 text-sm font-black text-brand">
                    Student Profile <ArrowRight size={15} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="bg-[#eef6f1] py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Student Learning Portal</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">Everything a Chess Student Needs Inside One Platform</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Live classes, homework, attendance, tournaments, practice tools, coach messaging, billing, and notifications work together in one learning system.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <PortalMockup light />
            <div className="grid gap-3">
              {portalTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm shadow-emerald-900/5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                        <Icon size={20} />
                      </span>
                      <div>
                        <h3 className="font-black text-slate-950">{item.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.points.map((point) => (
                            <span key={point} className="chip bg-white">{point}</span>
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

      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Practice Tools</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Practise between classes with focused chess tools.</h2>
            </div>
            <Link href={demoHref} className="btn-outline">Explore Learning Portal</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {practiceTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <article key={tool.title} className="rounded-lg border border-slate-200 bg-[#f8fafc] p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-700/25 hover:shadow-xl hover:shadow-emerald-900/10">
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                    <Icon size={21} />
                  </span>
                  <h3 className="mt-4 font-black text-slate-950">{tool.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{tool.detail}</p>
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

      <section id="programs" className="bg-[#fffdf0] py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Coaching Advantages</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Structured coaching with visible support.</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {advantages.map((advantage) => (
                <div key={advantage} className="rounded-lg border border-brand/10 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
                  <CheckCircle2 size={17} className="mb-2 text-brand" />
                  {advantage}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {programs.map((program) => (
              <article key={program.title} className="rounded-lg border border-brand/10 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/10">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-black text-slate-950">{program.title}</h3>
                  <span className="chip-accent">{program.mode}</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{program.detail}</p>
                <Link href={demoHref} className="mt-5 inline-flex items-center gap-1 text-sm font-black text-brand">Book Free Demo Class <ArrowRight size={16} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="reviews" className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Parent Trust</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Reviews grounded in real academy feedback.</h2>
            </div>
            <Link href={offlineSourceUrl} target="_blank" rel="noreferrer" className="btn-outline">
              Review Source <ArrowRight size={16} />
            </Link>
          </div>
          <TestimonialCarousel reviews={verifiedReviews} />
        </div>
      </section>

      <section id="centres" className="bg-[#edf3ff] py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Centres and Global Reach</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Offline in Kolkata. Online for global students.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">Branch information is sourced from the academy&apos;s Kolkata coaching page.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`tel:${ACADEMY_DEFAULTS.phone}`} className="btn-primary">Call Academy</Link>
              <Link href={`mailto:${ACADEMY_DEFAULTS.email}`} className="btn-outline">Email Academy</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {academyBranches.map((centre) => (
              <div key={centre.name} className="overflow-hidden rounded-lg border border-blue-900/10 bg-white shadow-sm">
                <div className="p-4">
                <MapPin size={18} className="text-blue-700" />
                <div className="mt-3 font-black text-slate-950">{centre.name}</div>
                <div className="mt-1 text-sm leading-5 text-slate-500">{centre.address}</div>
                <Link href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centre.address)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-black text-blue-700">
                  Open directions
                </Link>
                </div>
                <iframe
                  title={`${centre.name} map`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(centre.address)}&output=embed`}
                  className="h-32 w-full border-0"
                  loading="lazy"
                />
              </div>
            ))}
            <div className="rounded-lg border border-brand/10 bg-brand p-4 text-white shadow-xl shadow-brand-900/15">
              <Globe2 size={18} className="text-accent" />
              <div className="mt-3 font-black">Online Classes</div>
              <div className="mt-1 text-sm text-white/72">Structured programs, personal mentorship, and proven methods from home.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl rounded-lg bg-[#17051f] p-6 text-white shadow-2xl shadow-brand-900/20 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
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

      <footer className="border-t border-slate-200 bg-white py-6 text-sm text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>Copyright {new Date().getFullYear()} Envision Chess Academy</div>
          <div className="flex flex-wrap gap-4">
            <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">Achievement images</Link>
            <Link href={offlineSourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">Offline academy source</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function HeroSpotlight({ achievements }: { achievements: ReturnType<typeof publicAchievementList> }) {
  const [primary, ...secondary] = achievements;
  if (!primary) return null;
  return (
    <div className="motion-float space-y-4">
      <article className="group overflow-hidden rounded-lg border border-accent/25 bg-white/[0.08] shadow-2xl shadow-black/30">
        <div className="relative aspect-[0.86]">
          <Image src={primary.achievementImageUrl} alt={`${primary.studentName} achievement`} fill priority sizes="(min-width: 1024px) 28vw, 100vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" />
        </div>
        <div className="p-4">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-accent">Student Spotlight</div>
          <div className="mt-1 font-black">{primary.studentName}</div>
          <p className="mt-1 text-sm leading-5 text-white/70">{primary.result}</p>
        </div>
      </article>
      <div className="grid grid-cols-2 gap-3">
        {secondary.slice(0, 4).map((item) => (
          <div key={`${item.studentName}-${item.displayOrder}`} className="relative aspect-[1.08] overflow-hidden rounded-lg border border-white/10 bg-white/[0.07]">
            <Image src={item.achievementImageUrl} alt="" fill sizes="140px" className="object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

function JourneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-brand/65">{label}</div>
      <div className="mt-2 text-lg font-black text-slate-950">{value}</div>
    </div>
  );
}

function PortalMockup({ light = false }: { light?: boolean }) {
  const shell = light ? "border-slate-200 bg-white text-slate-950 shadow-xl shadow-brand-900/8" : "border-white/12 bg-white/[0.09] text-white shadow-2xl shadow-black/25";
  const soft = light ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-white/[0.08] border-white/12 text-white/68";
  const heading = light ? "text-slate-950" : "text-white";

  return (
    <div className={`motion-rise rounded-lg border p-4 ${shell}`}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-current/10 pb-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-brand">Student Portal Preview</div>
          <div className={`mt-1 text-lg font-black ${heading}`}>Aarav&apos;s Dashboard</div>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-brand-900">
          <Trophy size={18} />
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Next Class", "Today 6:30 PM", CalendarDays],
          ["Homework", "2 pending", ClipboardList],
          ["Attendance", "92% this month", CheckCircle2],
          ["Credits", "8 classes left", CreditCard],
        ].map(([label, value, Icon]) => (
          <div key={String(label)} className={`rounded-lg border p-3 ${soft}`}>
            <Icon size={17} className="text-brand" />
            <div className={`mt-2 text-sm font-black ${heading}`}>{value as string}</div>
            <div className="mt-1 text-xs">{label as string}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[0.78fr_1.22fr]">
        <div className={`rounded-lg border p-3 ${soft}`}>
          <div className={`text-sm font-black ${heading}`}>Live Classroom</div>
          <div className="mt-3 grid aspect-square grid-cols-8 overflow-hidden rounded-md border border-current/10">
            {Array.from({ length: 64 }).map((_, index) => {
              const dark = (Math.floor(index / 8) + index) % 2 === 1;
              const pieces: Record<number, string> = { 4: "k", 27: "P", 28: "P", 35: "n", 60: "K" };
              return (
                <div key={index} className={`grid place-items-center text-xs font-black ${dark ? "bg-[#7b5a3b] text-white" : "bg-[#f2dfbf] text-brand"}`}>
                  {pieces[index] || ""}
                </div>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3">
          {[
            [MessageSquare, "Ask Coach", "1 unread reply"],
            [BellRing, "Notifications", "Tournament reminder"],
            [Receipt, "Invoices", "PDF ready"],
            [BookOpen, "Practice", "Tactics, King Hunt, Computer"],
          ].map(([Icon, title, note]) => (
            <div key={String(title)} className={`flex items-center gap-3 rounded-lg border p-3 ${soft}`}>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand">
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
