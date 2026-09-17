import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, GraduationCap, MonitorSmartphone, Sparkles } from "lucide-react";
import CourseResultsStrip from "@/components/marketing/CourseResultsStrip";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import HeroStudentCluster from "@/components/marketing/HeroStudentCluster";
import WhyEnvision from "@/components/marketing/WhyEnvision";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { courseHub, courseHubMetadata, coursePages } from "@/lib/coursePages";
import { curriculumLevels } from "@/lib/demoCurriculum";
import { centreHubLink, centreLinks, contactLink, successStoriesLink } from "@/lib/internalLinks";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

export const metadata = courseHubMetadata();

const demoHref = "/register";
const hubUrl = `${MARKETING_BASE_URL}/${courseHub.slug}`;

/** Every stage with its session count, read from the syllabus rather than typed. */
const stages = coursePages.map((page) => {
  const levels = curriculumLevels(page.tier);
  return {
    ...page,
    levels: levels.length,
    sessions: levels.reduce((total, level) => total + level.sessions.length, 0),
  };
});

const totalSessions = stages.reduce((total, stage) => total + stage.sessions, 0);
const totalLevels = stages.reduce((total, stage) => total + stage.levels, 0);

export default function CourseHubPage() {
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: courseHub.h1,
      description: courseHub.description,
      url: hubUrl,
      numberOfItems: stages.length,
      itemListElement: stages.map((stage, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Course",
          name: stage.h1,
          description: stage.description,
          url: `${MARKETING_BASE_URL}/${stage.slug}`,
          educationalLevel: stage.educationalLevel,
          inLanguage: "en",
          courseMode: "online",
          provider: {
            "@type": "EducationalOrganization",
            name: "Envision Chess Academy",
            url: `${MARKETING_BASE_URL}/`,
            email: ACADEMY_DEFAULTS.email,
            telephone: ACADEMY_DEFAULTS.phone,
            areaServed: [
              { "@type": "Country", name: "India" },
              { "@type": "City", name: "Kolkata" },
            ],
          },
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: courseHub.navLabel, item: hubUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: courseHub.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ];

  const hubFacts = [
    { label: `${totalSessions} taught sessions`, detail: `Across ${stages.length} stages`, icon: GraduationCap },
    { label: `${totalLevels} levels`, detail: "Sixteen sessions each", icon: Sparkles },
    { label: "2 classes per week", detail: "About two months per level", icon: CalendarDays },
    { label: "Placed by assessment", detail: "A coach picks your starting session", icon: CheckCircle2 },
  ];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <MarketingHeader demoHref={demoHref} />

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
              <span className="text-brand">{courseHub.navLabel}</span>
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
              <CheckCircle2 size={15} /> Beginner to Masters · {totalSessions} Sessions
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.6rem]">{courseHub.h1}</h1>
            <h2 className="mt-2.5 max-w-lg text-base font-black leading-snug text-brand sm:text-lg">{courseHub.supportingHeading}</h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-brand-900/70 sm:text-[0.95rem]">{courseHub.intro}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-11 px-5 shadow-lg shadow-accent-600/20">
                Book Free Demo Class <ArrowRight size={18} />
              </Link>
              <Link href="/login" className="btn min-h-11 border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                <MonitorSmartphone size={18} /> Explore Portal
              </Link>
            </div>
          </div>
          <HeroStudentCluster />
        </div>
      </section>

      {/* --------------------------------------------------------- hub facts */}
      <section className="relative bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {hubFacts.map((fact) => {
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

      {/* ------------------------------------------------------- the ladder */}
      <section id="courses" className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(253,231,90,0.4),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">The Ladder</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Five online chess courses, from first move to elite competitive play.</h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              Each course is a stage of the same ladder: three levels of sixteen live sessions, taught two classes a week. They are five separate
              courses with five separate syllabuses, so open any one of them to read what a coach actually teaches, session by session.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stages.map((stage, index) => (
              <article
                key={stage.slug}
                className="group relative flex min-h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/15"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-brand via-accent to-brand transition-transform duration-500 ease-out group-hover:scale-x-100" aria-hidden />
                <span className="absolute right-5 top-5 z-10 text-3xl font-black leading-none text-brand-100 transition-colors duration-300 group-hover:text-accent-500" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand">{stage.eyebrow}</p>
                <h3 className="mt-2 text-lg font-black leading-snug text-brand-900 transition-colors duration-300 group-hover:text-brand">{stage.h1}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-6 text-brand-900/70">{stage.intro}</p>
                <dl className="mt-5 flex gap-5 text-[11px] font-black uppercase tracking-[0.1em] text-brand-900/60">
                  <div>
                    <dt className="sr-only">Sessions</dt>
                    <dd><span className="text-base text-brand">{stage.sessions}</span> sessions</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Levels</dt>
                    <dd><span className="text-base text-brand">{stage.levels}</span> levels</dd>
                  </div>
                </dl>
                <Link href={`/${stage.slug}`} className="mt-5 inline-flex items-center gap-1 text-sm font-black text-brand hover:underline">
                  See the {stage.navLabel.replace(" Course", "")} syllabus <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CourseResultsStrip
        heading="What students from these courses go on to win."
        intro="Every result below belongs to a student who worked through this ladder, online or at a Kolkata centre."
        offset={0}
      />

      <WhyEnvision
        demoHref={demoHref}
        heading="Why parents and players choose Envision for online chess coaching."
        intro="Not a set of loose classes. A published syllabus, a coach who places your child at the right session, and a portal where parents can see every class, score and tournament result."
        secondary={{ href: "#courses", label: "Compare the five courses" }}
      />

      <RelatedLinks
        eyebrow="Learn in person"
        heading="The same courses, taught offline in Kolkata."
        intro="Every stage of this ladder also runs at our four Kolkata centres, with the same syllabus, homework, tournaments and progress tracking. Open a centre for its batch timings, coach and contact number."
        links={[centreHubLink, ...centreLinks(), successStoriesLink, contactLink]}
      />

      {/*
        The hub FAQ answers the questions asked about the ladder as a whole -
        which course to start with, how long it takes, online versus Kolkata -
        and feeds the FAQPage schema at the top of this page.
      */}
      <section id="faq" className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Questions</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Questions about our online chess coaching courses.</h2>
          <p className="mt-3 text-sm leading-7 text-brand-900/70">
            How the five courses fit together, how long each one takes, and how a student is placed into the right one.
          </p>
          <div className="mt-8 grid gap-3">
            {courseHub.faqs.map((faq) => (
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
            <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-900 shadow-sm shadow-accent-600/30">Not sure where to start?</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">A coach will tell you which chess course fits.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              Book a free demo class. The coach assesses the player and recommends the exact course and session to begin from, whether you want
              online chess classes at home or offline coaching at a Kolkata centre.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">Book Free Demo Class</Link>
            <Link href="/login" className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">Explore Portal</Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
