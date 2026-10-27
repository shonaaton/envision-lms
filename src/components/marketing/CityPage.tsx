import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Languages, MapPin, MonitorSmartphone, Sparkles } from "lucide-react";
import { Inline } from "@/components/blog/PostBody";
import CourseResultsStrip from "@/components/marketing/CourseResultsStrip";
import HeroStudentCluster from "@/components/marketing/HeroStudentCluster";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { blogHref } from "@/lib/blog";
import { cityDisplayName, cityFaqs, cityHref, cityPages, type CityPageConfig } from "@/lib/cityPages";
import { courseHub, coursePages } from "@/lib/coursePages";
import { curriculumLevels } from "@/lib/demoCurriculum";
import { centreHubLink, cityLinks, courseHubLink, demoLink, kidsClassesLink, postLinks, successStoriesLink } from "@/lib/internalLinks";
import { absoluteUrl, breadcrumbSchema, courseOffer, faqSchema, organizationRef } from "@/lib/seo";

const demoHref = demoLink.href;

const stages = coursePages.map((page) => ({
  ...page,
  sessions: curriculumLevels(page.tier).reduce((total, level) => total + level.sessions.length, 0),
}));
const totalSessions = stages.reduce((total, stage) => total + stage.sessions, 0);

/**
 * One city's landing page, shared by every city route so the layout, schema
 * and links cannot drift - only the words in `cityPages` change.
 *
 * The schema is a `Service` with the city as `areaServed`, not a
 * `LocalBusiness`: the academy has no premises in these cities, and an address
 * it cannot be found at is exactly what Google's local guidelines prohibit.
 */
export default function CityPage({ config }: { config: CityPageConfig }) {
  const path = cityHref(config.slug);
  const display = cityDisplayName(config);
  const faqs = cityFaqs(config);
  const languageLine = config.languages.join(" & ");

  const facts = [
    { label: `${totalSessions} live sessions`, detail: "One published syllabus, five stages", icon: ClipboardList },
    { label: "2 classes a week", detail: "Live with a coach, never recorded", icon: CalendarDays },
    { label: `Taught in ${languageLine}`, detail: "Explained the way your child follows best", icon: Languages },
    { label: "Free demo class", detail: "Ends in a level recommendation", icon: Sparkles },
  ];

  const howItWorks = [
    {
      title: "Book a free demo",
      detail: `A coach meets your child online, plays a few positions and recommends the exact session to start from - whether they are new to chess or already play in ${config.city}'s tournaments.`,
    },
    {
      title: "Join live classes",
      detail: "Two live classes a week in our online classroom, with a shared board your child moves pieces on. Each level is sixteen sessions, about two months.",
    },
    {
      title: "Practise between classes",
      detail: "Homework the coach reviews, a tactics trainer and weekly academy tournaments keep the learning going between lessons.",
    },
    {
      title: "Follow the progress",
      detail: "Attendance, homework scores, coach feedback and tournament results sit in the parent portal, visible without having to ask.",
    },
  ];

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": `${absoluteUrl(path)}#service`,
      name: `Online chess coaching in ${config.city}`,
      serviceType: "Chess coaching",
      description: config.description,
      url: absoluteUrl(path),
      provider: organizationRef,
      areaServed: {
        "@type": "City",
        name: config.city,
        ...(config.altName ? { alternateName: config.altName } : {}),
        containedInPlace: { "@type": "State", name: config.state },
      },
      availableChannel: { "@type": "ServiceChannel", serviceUrl: absoluteUrl(demoHref), availableLanguage: config.languages },
      audience: { "@type": "EducationalAudience", educationalRole: "student" },
      offers: courseOffer(path),
    },
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: `Chess Coaching in ${config.city}`, path },
    ]),
    faqSchema(faqs),
  ];

  const otherCities = cityLinks(config.slug);

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
              <span className="text-brand">Chess Coaching in {config.city}</span>
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
              <CheckCircle2 size={15} /> Live Online Classes &middot; {config.city}
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.6rem]">Best Chess Coaching in {display}</h1>
            <h2 className="mt-2.5 max-w-lg text-base font-black leading-snug text-brand sm:text-lg">{config.supportingHeading}</h2>
            {config.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-4 max-w-lg text-sm leading-7 text-brand-900/70 sm:text-[0.95rem]">
                <Inline text={paragraph} />
              </p>
            ))}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={demoHref} className="btn-accent min-h-11 whitespace-nowrap px-5 shadow-lg shadow-accent-600/20">
                Book a Free Demo Class <ArrowRight size={18} />
              </Link>
              <Link href="#courses" className="btn min-h-11 whitespace-nowrap border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                See the course ladder
              </Link>
            </div>
          </div>
          <HeroStudentCluster />
        </div>
      </section>

      {/* ------------------------------------------------------------ facts */}
      <section className="relative bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => {
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

      {/* ------------------------------------------------------- local scene */}
      <section className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-20">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">{config.city}</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">{config.scene.heading}</h2>
          {config.scene.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 32)} className="mt-4 text-[0.97rem] leading-8 text-brand-900/75">
              <Inline text={paragraph} />
            </p>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- reasons */}
      <section className="relative bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="max-w-3xl text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
            Why {config.city} families choose online chess coaching with Envision
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {config.reasons.map((reason) => (
              <article key={reason.title} className="rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5">
                <h3 className="text-lg font-black text-brand-900">{reason.title}</h3>
                <p className="mt-2 text-sm leading-6 text-brand-900/70">{reason.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-20">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="max-w-3xl text-2xl font-black leading-tight text-brand-900 sm:text-3xl">How online chess classes work for families in {config.city}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-900/70">
            Everything happens in one academy portal. For a fuller picture, read our guide to{" "}
            <Link href={blogHref("how-online-chess-classes-work")} className="font-bold text-brand underline decoration-brand/30 underline-offset-[3px]">
              how online chess classes work
            </Link>
            .
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-sm font-black text-accent">{index + 1}</span>
                <h3 className="mt-3 text-base font-black text-brand-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-brand-900/70">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- courses */}
      <section id="courses" className="relative scroll-mt-24 bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="max-w-3xl text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
            One chess course ladder, from the first move to Masters
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-900/70">
            Students in {config.city} follow the same {totalSessions}-session syllabus as every Envision student. The demo class decides where your child starts;{" "}
            <Link href={`/${courseHub.slug}`} className="font-bold text-brand underline decoration-brand/30 underline-offset-[3px]">
              see every online chess coaching course
            </Link>
            .
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {stages.map((stage, index) => (
              <li key={stage.slug}>
                <Link
                  href={`/${stage.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30"
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-brand">Stage {index + 1} &middot; {stage.sessions} sessions</span>
                  <h3 className="mt-2 text-base font-black text-brand-900 group-hover:text-brand">{stage.h1}</h3>
                  <span className="mt-2 flex-1 text-xs leading-5 text-brand-900/65">{stage.prerequisite}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-brand">
                    View course <ArrowRight size={13} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CourseResultsStrip
        heading="Results from Envision students."
        intro="Envision students train on this same syllabus online, across India and in more than 15 countries. These are some of their verified results."
        offset={cityPages.findIndex((page) => page.slug === config.slug) + 2}
      />

      {/* ------------------------------------------------------------- areas */}
      <section className="relative bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Online chess classes across {config.city}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-900/70">
            Because every class is live and online, families join from anywhere in {config.city} and around {config.state === config.city ? "the region" : config.state}, including:
          </p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label={`Areas of ${config.city}`}>
            {config.areas.map((area) => (
              <li key={area} className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-900/80">
                <MapPin size={12} className="text-brand" /> {area}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <RelatedLinks
        eyebrow="Other cities"
        heading="Chess coaching in other cities"
        intro="The same live online classes run for families across India. In Kolkata, students can also learn in person at our four centres."
        links={[...otherCities, centreHubLink]}
      />

      <RelatedLinks
        eyebrow="Before you book"
        heading="Guides for parents"
        links={[
          kidsClassesLink,
          ...postLinks(["best-age-to-start-chess", "how-to-choose-a-chess-coach", "how-chess-pieces-move"]),
          successStoriesLink,
          courseHubLink,
        ]}
      />

      {/* --------------------------------------------------------------- FAQ */}
      <section id="faq" className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Questions</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Questions {config.city} parents ask about chess coaching</h2>
          <div className="mt-8 grid gap-3">
            {faqs.map((faq) => (
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
            <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-900 shadow-sm shadow-accent-600/30">Free demo class</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Start chess coaching in {config.city} this week.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              Book a free demo class. A coach assesses your child online and tells you exactly which session to start from - with no payment and no obligation.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={demoHref} className="btn-accent">Book a Free Demo Class</Link>
            <Link href="/contact-us" className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
              <MonitorSmartphone size={16} /> Ask a question
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
