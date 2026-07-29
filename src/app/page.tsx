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
  GraduationCap,
  MapPin,
  MessageSquare,
  Menu,
  MonitorSmartphone,
  Receipt,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Logo from "@/components/layout/Logo";
import AchievementShowcase, { type AchievementSlide } from "@/components/marketing/AchievementShowcase";
import { ACADEMY_DEFAULTS } from "@/lib/branding";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.envisionchessacademy.com"),
  title: "Envision Chess Academy | Structured Chess Coaching and Student LMS",
  description:
    "Premium online and offline chess coaching with student achievements, live classes, homework, tournaments, practice tools, progress tracking, and payments in one platform.",
  alternates: { canonical: "https://www.envisionchessacademy.com/" },
  openGraph: {
    title: "Envision Chess Academy",
    description: "Structured chess coaching, proven student journeys, and an all-in-one learning portal.",
    url: "https://www.envisionchessacademy.com/",
    siteName: "Envision Chess Academy",
    type: "website",
    images: [{ url: "/images/landing/anish-bijibilla.jpg", width: 1200, height: 900, alt: "Envision Chess Academy student achievement" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Envision Chess Academy",
    description: "Practise, compete, and improve in one chess-learning platform.",
    images: ["/images/landing/anish-bijibilla.jpg"],
  },
};

const demoHref = "/register";
const cloudinaryCollectionUrl = "https://collection.cloudinary.com/dlafr6yu3/3ddc9e2d8d7656087c4a52336a2e1df4";

const achievementSlides: AchievementSlide[] = [
  {
    student: "Anish Bijibilla",
    title: "World Cadets Chess Championship qualification",
    result: "World Cadets Qualifier",
    location: "Batumi, Georgia",
    year: "[Verified Year]",
    description:
      "Anish's journey is the verified student spotlight currently available in the LMS assets. Add final rating, event year, and parent quote after academy review.",
    category: "International",
    image: "/images/landing/anish-bijibilla.jpg",
    alt: "Anish Bijibilla achievement photograph for Envision Chess Academy",
  },
  {
    student: "[Student Name]",
    title: "[Tournament or championship name]",
    result: "[Position, medal, title, or rating result]",
    location: "[Event location]",
    year: "[Year]",
    description: "Replace this placeholder with verified details from the Cloudinary achievement collection before publishing.",
    category: "National",
    image: "/images/landing/anish-bijibilla.jpg",
    alt: "Editable achievement placeholder using existing Envision Chess Academy student image",
    placeholder: true,
  },
  {
    student: "[Student Name]",
    title: "[State, district, or rating achievement]",
    result: "[Verified result]",
    location: "[Event location]",
    year: "[Year]",
    description: "Use this slot for another Cloudinary achievement photograph and verified result copy.",
    category: "Rating Achievements",
    image: "/images/landing/anish-bijibilla.jpg",
    alt: "Editable Cloudinary achievement placeholder",
    placeholder: true,
  },
];

const achievementSummary = [
  { label: "International achievements", value: "[Verified count]" },
  { label: "National or state champions", value: "[Verified count]" },
  { label: "Rated players developed", value: "[Verified count]" },
  { label: "Tournament winners", value: "[Verified count]" },
];

const navItems = [
  ["Home", "#home"],
  ["Achievements", "#achievements"],
  ["Platform", "#platform"],
  ["Programs", "#programs"],
  ["Anish's Journey", "#anish"],
  ["Reviews", "#reviews"],
  ["Centres", "#centres"],
];

const portalTabs = [
  {
    title: "Dashboard",
    icon: MonitorSmartphone,
    points: ["Upcoming classes", "Homework status", "Attendance", "Credit balance", "Notifications"],
  },
  {
    title: "Live Classes",
    icon: CalendarDays,
    points: ["Assigned classrooms", "Scheduled join button", "Live chessboard", "Chat and questions", "Shared notes"],
  },
  {
    title: "Homework",
    icon: ClipboardList,
    points: ["Pending work", "Late work", "Move submission", "Score after submission", "Coach feedback"],
  },
  {
    title: "Competition",
    icon: Trophy,
    points: ["Tournament lobby", "Pairings", "Live games", "Results", "Leaderboards"],
  },
  {
    title: "Payments",
    icon: WalletCards,
    points: ["Credit balance", "Usage history", "Monthly dues", "Invoice PDF", "Razorpay payments"],
  },
];

const practiceTools = [
  { title: "Tactics Trainer", detail: "Solve focused puzzles and build calculation habits.", icon: Target },
  { title: "King Hunt", detail: "Practise direct attacking patterns and checkmate vision.", icon: Crown },
  { title: "Square Trainer", detail: "Sharpen board coordinates and chessboard fluency.", icon: Sparkles },
  { title: "Play vs Computer", detail: "Train against a guided engine opponent.", icon: Gamepad2 },
];

const learningSteps = [
  "Book a free assessment",
  "Get placed in the correct level",
  "Attend structured live classes",
  "Practise through assignments and tournaments",
  "Track progress through feedback and reports",
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

const programs = [
  { title: "Group Classes", detail: "Level-based batches for steady learning and healthy competition.", mode: "Beginner to advanced" },
  { title: "Individual Coaching", detail: "Focused mentoring for students who need deeper attention.", mode: "Custom plan" },
  { title: "Rated-Player Training", detail: "Tournament preparation, analysis habits, and competitive planning.", mode: "Advanced track" },
];

const centres = ["Bowbazar", "Haridevpur", "Silpara, Behala", "Jodhpur Park", "New Alipore"];

const reviews = [
  {
    name: "[Parent Name]",
    role: "[Student level or relationship]",
    text: "[Add verified parent review here. Do not publish fabricated testimonials.]",
  },
  {
    name: "[Student Name]",
    role: "[Program or batch]",
    text: "[Add verified student review here after consent.]",
  },
];

export default function Home() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Envision Chess Academy",
    url: "https://www.envisionchessacademy.com/",
    description:
      "Chess academy offering structured online and offline coaching, student learning tools, tournament preparation, and progress tracking.",
    address: centres.map((centre) => ({
      "@type": "PostalAddress",
      streetAddress: centre,
      addressLocality: "Kolkata",
      addressRegion: "West Bengal",
      addressCountry: "IN",
    })),
    email: ACADEMY_DEFAULTS.email,
    telephone: ACADEMY_DEFAULTS.phone,
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Can I book a free demo class?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. Families can create a demo student account and request a trial class through the LMS booking flow." },
      },
      {
        "@type": "Question",
        name: "Does the LMS support online and offline learning?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. The platform supports scheduled classes, homework, attendance, calendar, communication, tournaments, practice tools, and student billing." },
      },
    ],
  };

  return (
    <main id="home" className="min-h-screen bg-[#f8fafc] text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#180620]/96 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="#home" aria-label="Envision Chess Academy home">
            <Logo tone="yellow" className="max-w-[178px] sm:max-w-[230px]" />
          </Link>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Main navigation">
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
            <Link href="/register" className="btn border border-white/15 bg-white/10 text-white hover:bg-white/15">
              Register
            </Link>
            <Link href={demoHref} className="btn-accent">
              Book a Free Demo
            </Link>
          </div>
          <details className="relative lg:hidden">
            <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-lg border border-white/15 bg-white/10 text-sm font-black text-accent">
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
                <Link href="/register" className="btn-accent">Book a Free Demo</Link>
              </div>
            </div>
          </details>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#180620] text-white">
        <div className="absolute inset-0 bg-[linear-gradient(125deg,#180620_0%,#401052_52%,#0d1117_100%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(45deg,#fde75a_25%,transparent_25%),linear-gradient(-45deg,#fde75a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#fde75a_75%),linear-gradient(-45deg,transparent_75%,#fde75a_75%)] [background-position:0_0,0_18px,18px_-18px,-18px_0] [background-size:36px_36px]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:min-h-[calc(100dvh-74px)] lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8 lg:py-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-accent">
              Empower Your Chess Vision
            </p>
            <h1 className="mt-5 text-4xl font-black leading-[1.04] text-white sm:text-6xl">
              Structured Chess Coaching. Proven Champions. One Powerful Platform.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/76 sm:text-lg">
              Envision Chess Academy combines certified coaching, tournament preparation, regular feedback, structured learning, and an all-in-one student portal for measurable chess improvement.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-12 px-5">
                Book a Free Demo Class <ArrowRight size={18} />
              </Link>
              <Link href="#achievements" className="btn min-h-12 border border-white/18 bg-white/10 px-5 text-white hover:bg-white/15">
                Explore Student Achievements
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
            <div className="overflow-hidden rounded-lg border border-accent/25 bg-white/[0.08] shadow-2xl shadow-black/30">
              <div className="relative aspect-[0.82]">
                <Image src="/images/landing/anish-bijibilla.jpg" alt="Anish Bijibilla student achievement photograph" fill priority sizes="(min-width: 1024px) 28vw, 100vw" className="object-cover object-top" />
              </div>
              <div className="p-4">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-accent">Student Spotlight</div>
                <div className="mt-1 font-black">Anish Bijibilla</div>
                <p className="mt-1 text-sm leading-5 text-white/68">World Cadets journey details ready for academy verification.</p>
              </div>
            </div>
            <PortalMockup />
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-6 grid max-w-7xl gap-3 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {achievementSummary.map((item) => (
          <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-brand-900/8">
            <div className="text-2xl font-black text-brand">{item.value}</div>
            <div className="mt-2 text-sm font-semibold text-slate-600">{item.label}</div>
          </article>
        ))}
      </section>

      <AchievementShowcase slides={achievementSlides} />

      <section id="anish" className="bg-[#fffdf0] py-14 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-2xl shadow-brand-900/10">
            <div className="relative aspect-[0.92]">
              <Image src="/images/landing/anish-bijibilla.jpg" alt="Anish Bijibilla Envision Chess Academy journey" fill sizes="(min-width: 1024px) 38vw, 100vw" className="object-cover object-top" />
            </div>
          </div>
          <div className="self-center">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Dedicated Student Spotlight</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">Meet Anish: A Journey Built Move by Move</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              This section is designed for a verified, emotional student story. The image is preserved as-is; missing details remain editable until confirmed.
            </p>
            <div className="mt-6 grid gap-3">
              {[
                ["Starting level", "[Anish's Starting Level]"],
                ["Coaching duration", "[Coaching Duration]"],
                ["Current level or rating", "[Current Level or Rating]"],
                ["Major achievement", "[Major Achievement]"],
                ["Parent feedback", "[Parent Testimonial]"],
              ].map(([label, value], itemIndex) => (
                <div key={label} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-lg border border-brand/10 bg-white p-4">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand text-sm font-black text-white">{itemIndex + 1}</div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-brand/65">{label}</div>
                    <div className="mt-1 font-bold text-slate-950">{value}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href={demoHref} className="btn-primary mt-6 min-h-12 px-5">
              Book a Free Demo <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section id="platform" className="bg-white py-14 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Student Learning Portal</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">Everything a Chess Student Needs Inside One Platform</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              The promotional mockups below use fictional sample data and mirror the LMS features already built for students.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <PortalMockup light />
            <div className="grid gap-3">
              {portalTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-lg border border-slate-200 bg-[#f8fafc] p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
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

      <section className="bg-[#f2f7f3] py-14 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Practice Tools</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Practise between classes with focused chess tools.</h2>
            </div>
            <Link href="/register" className="btn-outline">Create Student Account</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {practiceTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <article key={tool.title} className="rounded-lg border border-emerald-900/10 bg-white p-5 shadow-sm shadow-emerald-900/5">
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

      <section className="py-14 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">How it works</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">A clear learning path parents can follow.</h2>
          </div>
          <div className="grid gap-3">
            {learningSteps.map((step, index) => (
              <div key={step} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-sm font-black text-brand-900">{index + 1}</div>
                <div className="self-center font-bold text-slate-950">{step}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#17051f] py-14 text-white lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Coaching Advantages</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Structured coaching with visible support.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {advantages.map((advantage) => (
              <div key={advantage} className="rounded-lg border border-white/12 bg-white/[0.07] p-4 text-sm font-bold text-white/82">
                <CheckCircle2 size={17} className="mb-3 text-accent" />
                {advantage}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="programs" className="bg-white py-14 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Programs and Learning Formats</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Choose the right format after assessment.</h2>
            </div>
            <Link href={demoHref} className="btn-primary">View Programs and Fees</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {programs.map((program) => (
              <article key={program.title} className="rounded-lg border border-slate-200 bg-[#fbfcff] p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-black text-slate-950">{program.title}</h3>
                  <span className="chip-accent">{program.mode}</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{program.detail}</p>
                <Link href={demoHref} className="mt-5 inline-flex text-sm font-black text-brand">Book demo <ArrowRight size={16} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="reviews" className="bg-[#f8fafc] py-14 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Reviews and Parent Trust</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Publish only consented, verified reviews.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {reviews.map((review) => (
              <article key={review.name} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-base leading-7 text-slate-700">{review.text}</p>
                <div className="mt-4 font-black text-slate-950">{review.name}</div>
                <div className="text-sm text-slate-500">{review.role}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="centres" className="bg-[#fffdf0] py-14 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Centres and Global Reach</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">Offline in Kolkata. Online for global students.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {centres.map((centre) => (
              <div key={centre} className="rounded-lg border border-brand/10 bg-white p-4">
                <MapPin size={18} className="text-brand" />
                <div className="mt-3 font-black text-slate-950">{centre}</div>
                <div className="mt-1 text-sm text-slate-500">Class availability: [Confirm active schedule]</div>
              </div>
            ))}
            <div className="rounded-lg border border-brand/10 bg-brand p-4 text-white">
              <Globe2 size={18} className="text-accent" />
              <div className="mt-3 font-black">Online Classes</div>
              <div className="mt-1 text-sm text-white/70">Global time-zone friendly batches</div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl rounded-lg bg-[#180620] p-6 text-white shadow-2xl shadow-brand-900/20 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Start with a free assessment</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Your Child&apos;s Next Great Move Starts Here</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
              No obligation. Level recommendation included. Online and offline options available.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">Book Free Demo</Link>
            <Link href="/register" className="btn border border-white/15 bg-white/10 text-white">Create Student Account</Link>
            <Link href="/login" className="btn border border-white/15 bg-white/10 text-white">Login to Portal</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-sm text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>Copyright {new Date().getFullYear()} Envision Chess Academy</div>
          <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">
            Cloudinary achievement source collection
          </Link>
        </div>
      </footer>
    </main>
  );
}

function PortalMockup({ light = false }: { light?: boolean }) {
  const shell = light ? "border-slate-200 bg-white text-slate-950 shadow-xl shadow-brand-900/8" : "border-white/12 bg-white/[0.09] text-white shadow-2xl shadow-black/25";
  const soft = light ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-white/[0.08] border-white/12 text-white/68";
  const heading = light ? "text-slate-950" : "text-white";

  return (
    <div className={`rounded-lg border p-4 ${shell}`}>
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
