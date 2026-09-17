import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, GraduationCap, MapPin, Navigation, Phone, Quote, Sparkles, Star, Trophy } from "lucide-react";
import CourseResultsStrip from "@/components/marketing/CourseResultsStrip";
import RelatedLinks from "@/components/marketing/RelatedLinks";
import HeroStudentCluster from "@/components/marketing/HeroStudentCluster";
import WhyEnvision from "@/components/marketing/WhyEnvision";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { verifiedReviews } from "@/lib/achievementData";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL, ACADEMY_PHONE_DISPLAY } from "@/lib/branding";
import {
  centreBatchCount,
  centreHref,
  centreHub,
  centreHubMetadata,
  centreOpeningHours,
  centrePostalAddress,
  centreTimeRange,
  kolkataCentres,
} from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";
import { courseHubLink, courseLinks, demoLink, successStoriesLink } from "@/lib/internalLinks";
import { curriculumLevels } from "@/lib/demoCurriculum";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

export const metadata = centreHubMetadata();

/**
 * Like the centre pages, the city hub leads with the contact form: the questions
 * an offline reader has - which centre, which batch, what it costs - are ones
 * the team answers. The academy number is the second call to action throughout.
 */
const contactHref = "/contact-us";
const hubUrl = `${MARKETING_BASE_URL}/${centreHub.slug}`;

/** Read from the taught syllabus, so the page cannot advertise sessions nobody teaches. */
const totalSessions = coursePages.reduce(
  (total, page) => total + curriculumLevels(page.tier).reduce((sum, level) => sum + level.sessions.length, 0),
  0,
);
const totalBatches = kolkataCentres.reduce((total, centre) => total + centreBatchCount(centre), 0);

/**
 * How the ladder reads to a parent standing in a Kolkata centre, rather than
 * as five product names. Each band links to the course page that owns its
 * phrase, so the hub passes its local traffic on to the right syllabus.
 */
const skillBands = [
  {
    heading: "Beginner chess classes",
    detail:
      "For a child who has never played, or who knows roughly how the pieces move. Starts from the board, the pieces and notation, and finishes with checkmate delivered on purpose.",
    slug: "beginner-chess-course",
    label: "Beginner course syllabus",
  },
  {
    heading: "Intermediate chess training",
    detail:
      "For the player who knows the rules but keeps losing pieces. A full tactics stage: forks, pins, skewers, back rank, discovered attacks, up to mate in three.",
    slug: "intermediate-chess-course",
    label: "Intermediate course syllabus",
  },
  {
    heading: "Advanced and competitive chess coaching",
    detail:
      "For tournament players. Endgame technique and a working opening repertoire, then advanced calculation, then pawn structure and theoretical endgames at Masters level.",
    slug: "semi-pro-chess-course",
    label: "Advanced course syllabus",
  },
];

export default function KolkataAcademyPage() {
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": ["EducationalOrganization", "LocalBusiness"],
      "@id": `${hubUrl}#organization`,
      name: "Envision Chess Academy",
      legalName: ACADEMY_DEFAULTS.legalName,
      alternateName: centreHub.h1,
      description: centreHub.description,
      url: hubUrl,
      logo: ACADEMY_LOGO_URL,
      telephone: ACADEMY_DEFAULTS.phone,
      email: ACADEMY_DEFAULTS.email,
      address: centrePostalAddress(kolkataCentres[0]),
      areaServed: [{ "@type": "City", name: "Kolkata" }, { "@type": "AdministrativeArea", name: "West Bengal" }],
      knowsAbout: [
        "Chess coaching in Kolkata",
        "Chess classes for kids",
        "Offline chess classes",
        "Chess tournament preparation",
        "FIDE rated chess coaching",
      ],
      memberOf: [
        { "@type": "Organization", name: "Kolkata District Chess Association" },
        { "@type": "Organization", name: "Sara Bangla Daba Sangstha" },
      ],
      department: kolkataCentres.map((centre) => ({
        "@type": ["LocalBusiness", "EducationalOrganization"],
        "@id": `${MARKETING_BASE_URL}${centreHref(centre.slug)}#centre`,
        name: `Envision Chess Academy - ${centre.name}`,
        url: `${MARKETING_BASE_URL}${centreHref(centre.slug)}`,
        telephone: centre.phone,
        address: centrePostalAddress(centre),
        hasMap: centre.mapsUrl,
        openingHoursSpecification: centreOpeningHours(centre),
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Envision Chess Academy centres in Kolkata",
      url: hubUrl,
      numberOfItems: kolkataCentres.length,
      itemListElement: kolkataCentres.map((centre, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: centre.h1,
        url: `${MARKETING_BASE_URL}${centreHref(centre.slug)}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: centreHub.navLabel, item: hubUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: centreHub.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ];

  const hubFacts = [
    { label: `${kolkataCentres.length} Kolkata centres`, detail: "Bowbazar, Haridevpur, Jodhpur Park, New Alipore", icon: MapPin },
    { label: `${totalBatches} weekly batches`, detail: "Weekday evenings and weekends", icon: CalendarDays },
    { label: `${totalSessions} taught sessions`, detail: "One published syllabus, five stages", icon: GraduationCap },
    { label: "FIDE-qualified coaches", detail: "Every centre, every batch", icon: Trophy },
  ];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <MarketingHeader demoHref={contactHref} ctaLabel="Contact Us" />

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
              <span className="text-brand">{centreHub.navLabel}</span>
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
              <CheckCircle2 size={15} /> Offline Coaching &middot; {kolkataCentres.length} Centres
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.6rem]">{centreHub.h1}</h1>
            <h2 className="mt-2.5 max-w-lg text-base font-black leading-snug text-brand sm:text-lg">{centreHub.supportingHeading}</h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-brand-900/70 sm:text-[0.95rem]">{centreHub.intro}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={contactHref} className="btn-accent min-h-11 whitespace-nowrap px-5 shadow-lg shadow-accent-600/20">
                Contact Us <ArrowRight size={18} />
              </Link>
              <a href={`tel:${ACADEMY_DEFAULTS.phone}`} className="btn min-h-11 whitespace-nowrap border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                <Phone size={18} /> {ACADEMY_PHONE_DISPLAY}
              </a>
              <Link href="#centres" className="btn min-h-11 whitespace-nowrap border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                <MapPin size={18} /> Find your nearest centre
              </Link>
            </div>
          </div>
          <HeroStudentCluster />
        </div>
      </section>

      {/* ------------------------------------------------------- hub facts */}
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

      {/* ------------------------------------------- coaching in Kolkata */}
      <section id="coaching" className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(253,231,90,0.4),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">The Coaching</p>
              <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Professional chess coaching in Kolkata.</h2>
              <p className="mt-4 text-sm leading-7 text-brand-900/75">
                Chess coaching in Kolkata is usually sold as a weekly class. Ours is a course. Every student, at every centre, works through one
                published curriculum of {totalSessions} taught sessions in a fixed order, so a parent can read exactly what their child will be
                taught in session forty as easily as in session four.
              </p>
              <p className="mt-4 text-sm leading-7 text-brand-900/75">
                Nobody is dropped into a generic beginner slot either. A free demo class is a real assessment: the coach watches the student play,
                then names the session to start from. A child who already knows the rules skips ahead to tactics instead of relearning how a rook
                moves.
              </p>
              <p className="mt-4 text-sm leading-7 text-brand-900/75">
                Batches are kept small enough that every child is corrected by name. Between classes, homework, coach feedback, weekly academy
                tournaments and progress reports sit in the student portal, which parents can see for themselves rather than having to ask how
                it is going.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={contactHref} className="btn-accent">Contact Us <ArrowRight size={16} /></Link>
                <Link href={`/${courseHub.slug}`} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                  See the full syllabus
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:content-start">
              {[
                { title: "Coaches with federation credentials", detail: "A FIDE Instructor who has trained IMs, GMs and Asian-level champions, a FIDE-certified National Instructor, and FIDE-rated coaches at every other centre.", icon: Trophy },
                { title: "Affiliated and recognised", detail: `${ACADEMY_DEFAULTS.affiliationLine}. ${ACADEMY_DEFAULTS.recognitionLine}.`, icon: CheckCircle2 },
                { title: "Tournament preparation, not just classes", detail: "Students are prepared for and entered into district, state and national rated events, with weekly academy tournaments in between.", icon: Sparkles },
                { title: "Offline and online on one syllabus", detail: "Miss a centre batch and the same session is available in a live online batch, with identical homework and tracking.", icon: GraduationCap },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-4 text-sm font-black leading-snug text-brand-900">{item.title}</h3>
                    <p className="mt-2 text-xs leading-6 text-brand-900/70">{item.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- skill levels */}
      <section id="levels" className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Every Level</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Chess classes in Kolkata for every skill level.</h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              The same ladder runs at all {kolkataCentres.length} centres. Where a student joins it is decided by a coach in the demo class, not
              by age or by how long they have been playing.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {skillBands.map((band, index) => (
              <article
                key={band.slug}
                className="group relative flex min-h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/15"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-brand via-accent to-brand transition-transform duration-500 ease-out group-hover:scale-x-100" aria-hidden />
                <span className="absolute right-5 top-5 z-10 text-3xl font-black leading-none text-brand-100 transition-colors duration-300 group-hover:text-accent-500" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-lg font-black leading-snug text-brand-900 transition-colors duration-300 group-hover:text-brand">{band.heading}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-6 text-brand-900/70">{band.detail}</p>
                <Link href={`/${band.slug}`} className="mt-5 inline-flex items-center gap-1 text-sm font-black text-brand hover:underline">
                  {band.label} <ArrowRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- centres */}
      <section id="centres" className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(90,19,114,0.09),transparent_28%),radial-gradient(circle_at_80%_28%,rgba(253,231,90,0.45),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Centres</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Our chess academy centres in Kolkata.</h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              {kolkataCentres.length} centres across the city, each with its own coach, its own batch timings and its own contact number. Open a
              centre for its full schedule, map and directions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {kolkataCentres.map((centre) => (
              <article key={centre.slug} className="flex min-h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30">
                <div className="flex flex-1 flex-col p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                    <MapPin size={18} />
                  </span>
                  <h3 className="mt-4 text-lg font-black text-brand-900">
                    <Link href={centreHref(centre.slug)} className="hover:text-brand hover:underline">{centre.h1}</Link>
                  </h3>
                  <address className="mt-1.5 text-sm not-italic leading-6 text-brand-900/70">{centre.address}</address>
                  <p className="mt-3 text-sm leading-6 text-brand-900/75">{centre.supportingHeading}</p>

                  <dl className="mt-4 grid gap-2 text-xs text-brand-900/70">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 font-black uppercase tracking-[0.08em] text-brand-900/50">Days</dt>
                      <dd className="font-semibold">{centre.schedule.map((entry) => entry.day).join(", ")}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 font-black uppercase tracking-[0.08em] text-brand-900/50">Timings</dt>
                      <dd className="font-semibold">
                        {centreTimeRange(centre)}
                        {centreBatchCount(centre) === 1 ? " (1 batch)" : ` (${centreBatchCount(centre)} batches)`}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 font-black uppercase tracking-[0.08em] text-brand-900/50">Coach</dt>
                      <dd className="font-semibold">{centre.coachName}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 font-black uppercase tracking-[0.08em] text-brand-900/50">Phone</dt>
                      <dd><a href={`tel:${centre.phone}`} className="font-bold text-brand hover:underline">{centre.phoneDisplay}</a></dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={centreHref(centre.slug)} className="btn-accent px-4 py-2 text-xs">
                      {centre.name} centre details <ArrowRight size={15} />
                    </Link>
                    <a href={centre.mapsUrl} target="_blank" rel="noreferrer" className="btn border border-brand/25 bg-white px-4 py-2 text-xs text-brand hover:border-brand/50 hover:bg-brand-50">
                      <Navigation size={15} /> Directions
                    </a>
                  </div>
                </div>
                <figure className="m-0">
                  <iframe
                    title={`Map to the Envision Chess Academy ${centre.name} chess coaching centre in Kolkata`}
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(centre.address)}&output=embed`}
                    className="h-36 w-full border-0"
                    loading="lazy"
                  />
                  <figcaption className="border-t border-brand/10 px-5 py-2.5 text-[11px] leading-4 text-brand-900/60">
                    Offline chess classes at our {centre.name} centre, {centre.area}.
                  </figcaption>
                </figure>
              </article>
            ))}
          </div>

          <p className="mt-6 text-sm leading-7 text-brand-900/70">
            Not near any of them? The same courses run live online for students anywhere in India and in 15+ other countries, with identical
            homework, tournaments and progress tracking.{" "}
            <Link href={`/${courseHub.slug}`} className="font-black text-brand hover:underline">See the online chess coaching courses</Link>.
          </p>
        </div>
      </section>

      <WhyEnvision
        demoHref={contactHref}
        ctaLabel="Contact Us"
        heading="Why parents in Kolkata choose Envision Chess Academy."
        intro="Not a set of loose classes. A published syllabus, a coach who places your child at the right session, and a portal where parents can see every class, score and tournament result."
        secondary={{ href: `tel:${ACADEMY_DEFAULTS.phone}`, label: `Call ${ACADEMY_PHONE_DISPLAY}` }}
      />

      {/* ---------------------------------------------------------- reviews */}
      <section className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-20">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Parent Reviews</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">What Kolkata parents say about the coaching.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {verifiedReviews.map((review) => (
              <article key={review.name} className="flex min-h-full flex-col rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30">
                <Quote size={22} className="text-accent-600" />
                <p className="mt-4 flex-1 text-sm leading-7 text-brand-900/75">{review.text}</p>
                <div className="mt-5 flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
                  {Array.from({ length: review.rating }).map((_, index) => (
                    <Star key={index} size={15} className="fill-accent text-accent-600" aria-hidden />
                  ))}
                </div>
                <div className="mt-2 text-sm font-black text-brand-900">{review.name}</div>
                <div className="text-xs font-semibold text-brand-900/60">{review.role}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CourseResultsStrip
        heading="What students from our Kolkata centres go on to win."
        intro="Every result below belongs to a student trained on the Envision syllabus, at a Kolkata centre or in a live online batch."
        offset={0}
      />

      <RelatedLinks
        eyebrow="The syllabus"
        heading="The five courses taught at every Kolkata centre."
        intro="Offline students work through the same published ladder as our online students. Open any stage to read what a coach teaches, session by session."
        links={[courseHubLink, ...courseLinks(), successStoriesLink, demoLink]}
      />

      {/* -------------------------------------------------------------- FAQ */}
      <section id="faq" className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Questions</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Questions about our chess academy in Kolkata.</h2>
          <p className="mt-3 text-sm leading-7 text-brand-900/70">
            Where the centres are, who teaches, what a beginner starts with, and how to get in touch.
          </p>
          <div className="mt-8 grid gap-3">
            {centreHub.faqs.map((faq) => (
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
            <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-900 shadow-sm shadow-accent-600/30">Talk to us</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Ask us about chess classes in Kolkata.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              Tell us which centre suits you and we will come back with the batches that still have room, the current fee structure and a free
              trial class with the coach. Prefer to speak to somebody now? Call the academy.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={contactHref} className="btn-accent">Contact Us</Link>
            <a href={`tel:${ACADEMY_DEFAULTS.phone}`} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
              <Phone size={16} /> Call the academy
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
