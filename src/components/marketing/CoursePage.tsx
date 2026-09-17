import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, GraduationCap, MonitorSmartphone, Sparkles } from "lucide-react";
import CourseResultsStrip from "@/components/marketing/CourseResultsStrip";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import HeroStudentCluster from "@/components/marketing/HeroStudentCluster";
import WhyEnvision from "@/components/marketing/WhyEnvision";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { courseHub, coursePages, type CoursePageConfig } from "@/lib/coursePages";
import { curriculumLevels } from "@/lib/demoCurriculum";
import { centreHubLink, centreLinks, contactLink, successStoriesLink } from "@/lib/internalLinks";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

const demoHref = "/register";

/** Matches the social card `courseMetadata` sets, so schema and OG agree. */
const COURSE_OG_IMAGE = "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg";

/**
 * One tier of the ladder as a standalone, indexable page.
 *
 * Shared by every course route so the pages cannot drift in layout, schema or
 * calls to action - only the words and the tier change.
 */
export default function CoursePage({ config }: { config: CoursePageConfig }) {
  const levels = curriculumLevels(config.tier);
  const totalSessions = levels.reduce((total, level) => total + level.sessions.length, 0);
  const pageUrl = `${MARKETING_BASE_URL}/${config.slug}`;
  const ctaLabel = config.ctaLabel ?? "Book Demo Class";

  const courseFacts = [
    { label: `${totalSessions} live sessions`, detail: "Across three levels", icon: ClipboardList },
    { label: "2 classes per week", detail: "A steady, repeatable rhythm", icon: CalendarDays },
    { label: "16 sessions per level", detail: "About two months each", icon: GraduationCap },
    { label: config.prerequisite, detail: "Placed by a coach in the demo", icon: Sparkles },
  ];

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Course",
      name: config.keyword.replace(/\b\w/g, (c) => c.toUpperCase()),
      description: config.description,
      url: pageUrl,
      inLanguage: "en",
      alternateName: config.h1,
      image: `${MARKETING_BASE_URL}${COURSE_OG_IMAGE}`,
      educationalLevel: config.educationalLevel,
      coursePrerequisites: config.prerequisite,
      teaches: levels.flatMap((level) => level.sessions.map((session) => session.topic)),
      numberOfCredits: totalSessions,
      timeRequired: "P6M",
      isAccessibleForFree: false,
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
      hasCourseInstance: levels.map((level) => ({
        "@type": "CourseInstance",
        name: `${config.eyebrow.replace(" Stage", "")} ${level.name}`,
        description: config.levelBlurb[level.name],
        courseMode: "online",
        courseWorkload: `PT${level.sessions.length}H`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: courseHub.navLabel, item: `${MARKETING_BASE_URL}/${courseHub.slug}` },
        { "@type": "ListItem", position: 3, name: config.navLabel, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: config.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
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
            <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-brand-900/60">
              <Link href="/" className="hover:text-brand">Home</Link>
              <span>/</span>
              <Link href={`/${courseHub.slug}`} className="hover:text-brand">{courseHub.navLabel}</Link>
              <span>/</span>
              <span className="text-brand">{config.navLabel}</span>
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
              <CheckCircle2 size={15} /> {config.eyebrow} · {totalSessions} Sessions
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.6rem]">{config.h1}</h1>
            {config.supportingHeading ? (
              <h2 className="mt-2.5 max-w-lg text-base font-black leading-snug text-brand sm:text-lg">{config.supportingHeading}</h2>
            ) : null}
            <p className="mt-4 max-w-lg text-sm leading-7 text-brand-900/70 sm:text-[0.95rem]">{config.intro}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-11 px-5 shadow-lg shadow-accent-600/20">
                {ctaLabel} <ArrowRight size={18} />
              </Link>
              <Link href="/login" className="btn min-h-11 border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                <MonitorSmartphone size={18} /> Explore Portal
              </Link>
            </div>
            <div className="mt-6 grid max-w-lg grid-cols-3 gap-2">
              {[
                [String(levels.length), "Levels"],
                [String(totalSessions), "Sessions"],
                ["6", "Months"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-brand/10 bg-white px-3 py-2.5 shadow-sm shadow-brand-900/5">
                  <div className="text-lg font-extrabold text-brand">{value}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-brand-900/60">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <HeroStudentCluster />
        </div>
      </section>

      {/* ------------------------------------------------------ course facts */}
      <section className="relative bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {courseFacts.map((fact) => {
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

      <WhyEnvision demoHref={demoHref} heading={config.whyHeading} ctaLabel={ctaLabel} secondary={{ href: "#curriculum", label: `See all ${totalSessions} sessions` }} />

      {/* ------------------------------------------------------- curriculum */}
      <section id="curriculum" className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(253,231,90,0.4),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Full Curriculum</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
              Every session in the {config.eyebrow.replace(" Stage", "").toLowerCase()} chess course.
            </h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              This is the actual syllabus a coach teaches from - not a summary. {totalSessions} sessions, {levels.length} levels, in the order they are taught.
              Every session is live, online for students anywhere in India and offline at our four Kolkata centres.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {levels.map((level, levelIndex) => (
              <article
                key={level.name}
                className="group flex min-h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/15"
              >
                <div className="relative overflow-hidden border-b border-brand/10 bg-brand-50 p-5">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-brand via-accent to-brand transition-transform duration-500 ease-out group-hover:scale-x-100" aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand">{config.eyebrow.replace(" Stage", "")} · {level.name}</p>
                      <h3 className="mt-1.5 text-lg font-black text-brand-900">
                        Sessions {level.sessions[0].sessionNumber}&ndash;{level.sessions[level.sessions.length - 1].sessionNumber}
                      </h3>
                    </div>
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-sm font-black text-accent shadow-sm shadow-brand-900/20 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                      {levelIndex + 1}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-brand-900/70">{config.levelBlurb[level.name]}</p>
                </div>
                <ol className="flex-1 divide-y divide-brand/10">
                  {level.sessions.map((session) => (
                    <li key={session.sessionNumber} className="flex gap-3 px-5 py-2.5 transition-colors duration-200 hover:bg-accent/15">
                      <span className="mt-px w-6 shrink-0 text-[11px] font-black tabular-nums text-brand">{session.sessionNumber}</span>
                      <span className="text-[12.5px] leading-5 text-brand-900/80">{session.topic}</span>
                    </li>
                  ))}
                </ol>
                <div className="border-t border-brand/10 bg-brand-50 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-brand-900/60">
                  {level.sessions.length} sessions · about 2 months
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={demoHref} className="btn-accent">{ctaLabel} <ArrowRight size={16} /></Link>
            <Link href={`/${courseHub.slug}`} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
              See all online chess coaching courses
            </Link>
          </div>

          {/*
            Each course is its own page targeting its own phrase, so the sibling
            links are spelled out rather than hidden behind the header dropdown.
          */}
          <nav aria-label="Other chess courses" className="mt-10 border-t border-brand/10 pt-8">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-brand-900/70">The other chess courses in this ladder</h3>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {coursePages
                .filter((page) => page.slug !== config.slug)
                .map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/${page.slug}`}
                      className="flex h-full flex-col rounded-xl border border-brand/10 bg-white px-4 py-3 shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50"
                    >
                      <span className="text-sm font-black text-brand-900">{page.h1}</span>
                      <span className="mt-1 text-xs leading-5 text-brand-900/60">{page.supportingHeading ?? page.keyword}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        </div>
      </section>

      <CourseResultsStrip
        heading="Results from students on this ladder."
        intro={`Students who trained through the Envision syllabus, of which the ${config.eyebrow.replace(" Stage", "").toLowerCase()} course is one stage.`}
        offset={coursePages.findIndex((page) => page.slug === config.slug) + 1}
      />

      <RelatedLinks
        eyebrow="Learn in person"
        heading="Prefer to learn at a chess academy in Kolkata?"
        intro={`The ${config.eyebrow.replace(" Stage", "").toLowerCase()} course runs offline too, on the same syllabus and with the same homework, tournaments and progress tracking. Four centres across the city, each with its own coach and batch timings.`}
        links={[centreHubLink, ...centreLinks(), successStoriesLink, contactLink]}
      />

      {/* -------------------------------------------------------------- FAQ */}
      <section className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Questions</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
            Common questions about this {config.eyebrow.replace(" Stage", "").toLowerCase()} chess course.
          </h2>
          <div className="mt-8 grid gap-3">
            {config.faqs.map((faq) => (
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

      {/* ---------------------------------------------------------- last CTA */}
      <section className="relative overflow-hidden bg-white px-4 py-16 text-brand-900 sm:px-6 lg:px-8 lg:py-24">
        <div className="relative mx-auto max-w-7xl rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-900 shadow-sm shadow-accent-600/30">Start with a free assessment</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Start this chess course this week.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              A coach assesses your child in the demo class and tells you exactly which session to start from. No obligation, online or at a
              Kolkata centre.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">{ctaLabel}</Link>
            <Link href="/login" className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">Explore Portal</Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
