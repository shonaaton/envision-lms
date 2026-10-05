import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Gamepad2,
  GraduationCap,
  Globe2,
  MapPin,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import CourseResultsStrip from "@/components/marketing/CourseResultsStrip";
import HeroStudentCluster from "@/components/marketing/HeroStudentCluster";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { centreHref, centreHub, kolkataCentres } from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";
import { blogHubLink, centreHubLink, courseHubLink, courseLinks, demoLink, successStoriesLink } from "@/lib/internalLinks";
import { curriculumLevels } from "@/lib/demoCurriculum";
import { absoluteUrl, breadcrumbSchema, faqSchema, organizationRef, publicMetadata } from "@/lib/seo";

/**
 * The parent-facing landing page for chess classes for children.
 *
 * It owns "online chess classes for kids", "chess classes for kids" and the
 * broad "chess classes", which is why those phrases were demoted out of the
 * beginner course's and the course hub's keyword lists - two pages chasing one
 * query is how a site competes with itself.
 *
 * The division of labour with the pages it links to: the course pages own the
 * syllabus ("what is taught in session 23"), the centre pages own the city
 * ("where in Kolkata"), and this page owns the question a parent actually asks
 * first - "should my child learn chess, and what does a class look like". It is
 * deliberately kept out of the header nav; the footer carries it on every page
 * instead.
 */

const PATH = "/online-chess-classes-for-kids";
const demoHref = "/register";

export const metadata = publicMetadata({
  path: PATH,
  title: "Online Chess Classes for Kids | Envision Chess Academy",
  description:
    "Live online chess classes for kids, taught in small groups on a published 240-session syllabus, with homework, weekly tournaments and a free trial class.",
  keywords: [
    "online chess classes for kids",
    "chess classes for kids",
    "chess classes",
    "chess classes for children",
    "online chess coaching for kids",
    "kids chess lessons online",
    "chess classes for beginners kids",
    "chess class for kids near me",
    "learn chess online for kids",
  ],
  imageAlt: "A child playing a rated chess game with a clock, trained in Envision's online chess classes for kids",
});

/** Read from the taught syllabus, so the page cannot advertise sessions nobody teaches. */
const stageSessions = (tier: string) =>
  curriculumLevels(tier).reduce((total, level) => total + level.sessions.length, 0);
const totalSessions = coursePages.reduce((total, page) => total + stageSessions(page.tier), 0);
const totalLevels = coursePages.reduce((total, page) => total + curriculumLevels(page.tier).length, 0);

/**
 * The ladder as a parent of a nine-year-old reads it, rather than as five
 * product names. Each band hands its traffic to the course page that owns the
 * syllabus, so this page never has to restate a syllabus it would then have to
 * keep in sync.
 */
const stageCopy: Record<string, { heading: string; detail: string }> = {
  beginner: {
    heading: "A child who has never played",
    detail:
      "Starts at the board itself - how each piece moves, how to write a move down, what a legal game looks like - and finishes with your child delivering checkmate on purpose rather than by accident.",
  },
  intermediate: {
    heading: "A child who knows the rules but keeps losing pieces",
    detail:
      "The stage where chess stops being random. Forks, pins, skewers, back-rank mates and discovered attacks, drilled until your child sees them on the board instead of hearing about them afterwards.",
  },
  semi_pro: {
    heading: "A child playing their first tournaments",
    detail:
      "Technique for the games that are decided after the tactics: king and pawn endings, the named mating patterns, and a first opening repertoire so they are not improvising against prepared opponents.",
  },
  pro: {
    heading: "A rated player who wants to calculate deeper",
    detail:
      "Sacrifices, combinations and every tactical motif in its hardest form, for a child already competing in rated events and losing points to the one move they did not see.",
  },
  masters: {
    heading: "A serious competitor working on judgement",
    detail:
      "Pawn structure, weak squares, attacking schemes and theoretical endgames - the understanding that decides games between two children who both already see the tactics.",
  },
};

const stageBands = coursePages
  .filter((page) => stageCopy[page.tier])
  .map((page) => ({
    slug: page.slug,
    courseName: page.h1,
    sessions: stageSessions(page.tier),
    ...stageCopy[page.tier],
  }));

const classShape = [
  {
    title: "Live classes, never recordings",
    detail:
      "A coach is on the call, watching the board your child is playing on and correcting the move as it happens. Nobody is handed a video and left to it.",
    icon: MonitorSmartphone,
  },
  {
    title: "Small groups, corrected by name",
    detail:
      "Batches are kept small enough that every child is spoken to in every class, and quiet children do not get to hide at the back of a room.",
    icon: Users,
  },
  {
    title: "Homework a child will actually do",
    detail:
      "Puzzles, a tactics trainer, a square trainer and practice games against a friendly engine, all in the portal, all scored and all reviewed by the coach.",
    icon: ClipboardList,
  },
  {
    title: "Parents can see all of it",
    detail:
      "Attendance, homework scores, coach feedback, tournament results and fee history sit behind your own login, so you never have to ask how it is going.",
    icon: ShieldCheck,
  },
];

/**
 * What chess classes actually train, described as the habit the class builds.
 * Deliberately not the usual "chess raises IQ and school marks" claims - those
 * are not ours to make, and a parent who has read them elsewhere trusts the
 * concrete version more.
 */
const whatChessBuilds = [
  {
    title: "Sitting with one problem",
    detail:
      "A tournament game can run an hour. Children work up to that from short games, and the ability to stay with one hard thing is the first thing parents tell us they notice.",
    icon: Sparkles,
  },
  {
    title: "Thinking before touching",
    detail:
      "Touch-move is a real rule, and it teaches a child to check the consequence of a move before committing to it, every single game.",
    icon: CheckCircle2,
  },
  {
    title: "Losing well",
    detail:
      "Everybody loses at chess, including the coach. Children learn to shake hands, go through what happened, and come back next week - which is a lot of what a weekly tournament is for.",
    icon: Trophy,
  },
  {
    title: "A reason to keep practising",
    detail:
      "Levels to finish, puzzle streaks, XP, academy leaderboards and a tournament every week give practice a point, so it does not depend on being nagged.",
    icon: Gamepad2,
  },
];

const faqs = [
  {
    q: "What age can my child start chess classes?",
    a: "There is no fixed cut-off. What matters is whether a child can sit through a class and follow instructions, which the free trial class tells us far better than a birthday does - a coach plays with your child and says honestly whether they are ready. Several of our students were already winning Under-7 and Under-8 events, so starting young is normal here.",
  },
  {
    q: "Are online chess classes for kids as good as in-person ones?",
    a: "For chess, yes, because the board is on the screen for everybody at once. The coach sees exactly what your child sees, can take over the board to show a line, and nobody is sitting too far back to follow. The syllabus, homework, tournaments and progress reports are identical to our offline batches in Kolkata.",
  },
  {
    q: "Does my child need to know anything before the first class?",
    a: "No. The beginner stage starts from the board itself - the squares, how each piece moves, how to record a game - so a child who has never played a full game is exactly who it is written for.",
  },
  {
    q: "How many chess classes a week does a child need?",
    a: `Two live classes a week. Each level is sixteen sessions and takes about two months, and the full ladder is ${totalLevels} levels and ${totalSessions} taught sessions from the first move through to Masters.`,
  },
  {
    q: "Are your chess classes for kids online or in person?",
    a: `Both. Live online classes run for children anywhere in India and in 15+ other countries, and the same courses run offline at our ${kolkataCentres.length} Kolkata centres. Children move between the two without repeating anything, because both follow one syllabus.`,
  },
  {
    q: "Will my child get to play in tournaments?",
    a: "Yes. Academy tournaments run every week inside the portal with real pairings, live games, results and leaderboards. Children who want to compete further are prepared for and entered into rated district, state and national events.",
  },
  {
    q: "How will I know whether my child is actually improving?",
    a: "You get a parent login to the same portal the class runs in: attendance, homework status and scores, the coach's written feedback, tournament results, progress reports and certificates. Improvement is something you read, not something you are told.",
  },
  {
    q: "How do I book a chess class for my child?",
    a: "Book the free trial class. It is a real class with a coach that ends in a level recommendation and the exact session your child should start from - and it carries no obligation to enrol.",
  },
];

const pageFacts = [
  { label: `${totalSessions} taught sessions`, detail: `${totalLevels} levels, five stages`, icon: GraduationCap },
  { label: "2 classes per week", detail: "About two months a level", icon: CalendarDays },
  { label: "Live small-group classes", detail: "Online, or at a Kolkata centre", icon: Users },
  { label: "Free trial class", detail: "A real assessment with a coach", icon: CheckCircle2 },
];

export default function OnlineChessClassesForKidsPage() {
  const schema = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Online Chess Classes for Kids", path: PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Chess classes for kids at Envision Chess Academy",
      url: absoluteUrl(PATH),
      numberOfItems: stageBands.length,
      itemListElement: stageBands.map((band, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Course",
          name: band.courseName,
          description: band.detail,
          url: absoluteUrl(`/${band.slug}`),
          inLanguage: "en",
          courseMode: "online",
          audience: { "@type": "EducationalAudience", educationalRole: "student" },
          provider: organizationRef,
        },
      })),
    },
    faqSchema(faqs),
  ];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <MarketingHeader demoHref={demoHref} ctaLabel="Book Free Trial Class" />

      {/* ------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden bg-[#f5edf8] text-brand-900">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_52%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-14">
          <div className="motion-rise max-w-xl">
            <nav aria-label="Breadcrumb" className="mb-4 text-xs font-bold text-brand-900/60">
              <Link href="/" className="hover:text-brand">Home</Link>
              <span className="px-1.5">/</span>
              <span className="text-brand">Online Chess Classes for Kids</span>
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
              <CheckCircle2 size={15} /> Live Classes &middot; Free Trial
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.6rem]">
              Online Chess Classes for Kids
            </h1>
            <h2 className="mt-2.5 max-w-lg text-base font-black leading-snug text-brand sm:text-lg">
              Live, small-group chess classes for children, on one published syllabus from the first move to tournament play.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-brand-900/70 sm:text-[0.95rem]">
              Most chess classes for kids are a weekly hour with no published plan behind it. Ours is a course: {totalSessions} taught
              sessions in a fixed order, two live classes a week, homework a coach actually marks, and a tournament every week. Online for
              children anywhere in India, and offline at our {kolkataCentres.length} Kolkata centres.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-11 whitespace-nowrap px-5 shadow-lg shadow-accent-600/20">
                Book a Free Trial Class <ArrowRight size={18} />
              </Link>
              <Link href="#stages" className="btn min-h-11 whitespace-nowrap border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                See what your child would learn
              </Link>
            </div>
          </div>
          <HeroStudentCluster />
        </div>
      </section>

      {/* -------------------------------------------------------- page facts */}
      <section className="relative bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pageFacts.map((fact) => {
              const Icon = fact.icon;
              return (
                <div key={fact.label} className="group rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/10">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                    <Icon size={20} />
                  </span>
                  <div className="mt-4 text-sm font-black text-brand-900">{fact.label}</div>
                  <div className="mt-1 text-xs font-semibold text-brand-900/60">{fact.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- what a class is */}
      <section id="class" className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(253,231,90,0.4),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">The Class</p>
              <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
                What our chess classes for kids actually look like.
              </h2>
              <p className="mt-4 text-sm leading-7 text-brand-900/75">
                A class is an hour, live, with a coach and a small group of children at roughly the same strength. The coach teaches one idea
                from the syllabus, the children work through it on the board together, and then they play it out. Nothing is a recording, and
                nothing is improvised on the day.
              </p>
              <p className="mt-4 text-sm leading-7 text-brand-900/75">
                Your child is not dropped into a generic beginner slot either. The free trial class is a real assessment: the coach plays with
                them, reads where they actually are, and names the session to start from. A child who already knows how the pieces move skips
                ahead to tactics rather than sitting through four weeks of material they have outgrown.
              </p>
              <p className="mt-4 text-sm leading-7 text-brand-900/75">
                Between classes the work continues in the student portal - puzzles, a tactics trainer, assignments the coach marks, and a
                weekly academy tournament with real pairings. You see every bit of it from your own parent login.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={demoHref} className="btn-accent">Book a Free Trial Class <ArrowRight size={16} /></Link>
                <Link href={`/${courseHub.slug}`} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                  Read the full syllabus
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:content-start">
              {classShape.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-4 text-sm font-black text-brand-900">{item.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-brand-900/70">{item.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ stages */}
      <section id="stages" className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">The Ladder</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
              Chess classes for kids, stage by stage.
            </h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              Find the description that sounds like your child. Each one opens the course page with the full syllabus, listed session by
              session, so you can read exactly what will be taught before you book anything.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {stageBands.map((band, index) => (
              <article
                key={band.slug}
                className="group relative flex min-h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/15"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-brand via-accent to-brand transition-transform duration-500 ease-out group-hover:scale-x-100" aria-hidden />
                <span className="absolute right-5 top-5 z-10 text-3xl font-black leading-none text-brand-100 transition-colors duration-300 group-hover:text-accent-500" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="max-w-md text-lg font-black leading-snug text-brand-900 transition-colors duration-300 group-hover:text-brand">
                  {band.heading}
                </h3>
                <p className="mt-2.5 flex-1 text-sm leading-6 text-brand-900/70">{band.detail}</p>
                <p className="mt-4 text-[11px] font-black uppercase tracking-[0.12em] text-brand-900/55">
                  {band.courseName} &middot; {band.sessions} sessions
                </p>
                <Link href={`/${band.slug}`} className="mt-3 inline-flex items-center gap-1 text-sm font-black text-brand hover:underline">
                  See the {band.courseName.replace(" Chess Course", "").toLowerCase()} syllabus <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- what chess builds */}
      <section className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(90,19,114,0.09),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Why Chess</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
              What chess classes give a child, beyond the game.
            </h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              We will not promise you a jump in school marks. What a weekly chess class reliably builds is narrower than that, and more
              useful.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whatChessBuilds.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-4 text-sm font-black text-brand-900">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-brand-900/70">{item.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- online vs centre */}
      <section className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Online or offline</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
              Online chess classes, or chess classes in Kolkata?
            </h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              Both run the same syllabus with the same coaches, so this is a question about your week, not about what your child will be
              taught.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="flex flex-col rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                <Globe2 size={20} />
              </span>
              <h3 className="mt-4 text-lg font-black text-brand-900">Online chess classes for kids</h3>
              <p className="mt-2.5 flex-1 text-sm leading-6 text-brand-900/70">
                For children anywhere in India and in 15+ other countries. No travel, batches in the evening and at weekends, and the board,
                homework, tournaments and reports all live in the same portal. This is how most of our students learn, including several now
                playing for their country.
              </p>
              <Link href={`/${courseHub.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-black text-brand hover:underline">
                See the online chess coaching courses <ArrowRight size={16} />
              </Link>
            </article>
            <article className="flex flex-col rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                <MapPin size={20} />
              </span>
              <h3 className="mt-4 text-lg font-black text-brand-900">Chess classes at our Kolkata centres</h3>
              <p className="mt-2.5 flex-1 text-sm leading-6 text-brand-900/70">
                For families in and around Kolkata who would rather their child sat across a real board from another child.{" "}
                {kolkataCentres.length} centres - {kolkataCentres.map((centre) => centre.name).join(", ")} - with batch timings, a named coach
                and a phone number for each.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {kolkataCentres.map((centre) => (
                  <li key={centre.slug}>
                    <Link
                      href={centreHref(centre.slug)}
                      className="inline-flex rounded-full border border-brand/15 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-white"
                    >
                      Chess classes in {centre.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/${centreHub.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-black text-brand hover:underline">
                See all {centreHub.navLabel.toLowerCase()} <ArrowRight size={16} />
              </Link>
            </article>
          </div>
        </div>
      </section>

      <CourseResultsStrip
        heading="Children who started exactly where your child is now."
        intro="Every result below belongs to a student who began on this syllabus, most of them as complete beginners."
        offset={2}
      />

      <RelatedLinks
        eyebrow="Where to next"
        heading="Read more before you book a chess class."
        intro="The syllabus each stage teaches, the centres that run offline batches, what our students have won, and the guides we wrote for parents choosing a first chess class."
        links={[courseHubLink, ...courseLinks(), centreHubLink, successStoriesLink, blogHubLink, demoLink]}
      />

      {/* -------------------------------------------------------------- FAQ */}
      <section id="faq" className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Questions</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
            Questions parents ask about chess classes for kids.
          </h2>
          <p className="mt-3 text-sm leading-7 text-brand-900/70">
            Age, online versus in person, how often classes run, and how you will know it is working.
          </p>
          <div className="mt-8 grid gap-3">
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:border-brand/30">
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

      {/* ---------------------------------------------------------- last CTA */}
      <section className="relative overflow-hidden bg-white px-4 py-16 text-brand-900 sm:px-6 lg:px-8 lg:py-24">
        <div className="relative mx-auto max-w-7xl rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-900 shadow-sm shadow-accent-600/30">Start with a free class</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Book your child&apos;s first chess class, free.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              A real class with a coach, not a sales call. It ends with an honest read on where your child is and which session they should
              start from. Online, or at any of our Kolkata centres.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">Book a Free Trial Class</Link>
            <Link href="/contact-us" className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
              Ask a question first
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
