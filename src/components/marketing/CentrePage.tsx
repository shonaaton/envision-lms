import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gift,
  GraduationCap,
  MapPin,
  Navigation,
  Phone,
  Sparkles,
  Users,
} from "lucide-react";
import CourseResultsStrip from "@/components/marketing/CourseResultsStrip";
import WhyEnvision from "@/components/marketing/WhyEnvision";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import {
  centreBatchCount,
  centreHref,
  centreHub,
  centreOpeningHours,
  centrePostalAddress,
  kolkataCentres,
  slotLabel,
  type CentreConfig,
} from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

/**
 * The offline pages lead with the contact form rather than the demo booking.
 * A parent reading a centre page is choosing a place and a time, and what
 * decides that - is there a slot on Saturday, what does it cost - is answered by
 * the team, not by a booking form. The centre's own number is the second call to
 * action everywhere on the page, so nobody has to fill in anything at all.
 */
const contactHref = "/contact-us";
const CENTRE_OG_IMAGE = "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg";

/**
 * One Kolkata centre as a standalone, indexable page.
 *
 * Shared by all four centre routes so they cannot drift in layout or schema.
 * What differs between them is what genuinely differs on the ground - the
 * address, the coach, the batch timings and the localities the centre serves -
 * rather than the same paragraph with the locality swapped out.
 */
export default function CentrePage({ config }: { config: CentreConfig }) {
  const pageUrl = `${MARKETING_BASE_URL}${centreHref(config.slug)}`;
  const hubUrl = `${MARKETING_BASE_URL}/${centreHub.slug}`;
  const batches = centreBatchCount(config);
  const otherCentres = kolkataCentres.filter((centre) => centre.slug !== config.slug);
  const directionsUrl = config.mapsUrl;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(config.address)}&output=embed`;

  const facts = [
    { label: `${config.schedule.length} days a week`, detail: config.schedule.map((entry) => entry.day.slice(0, 3)).join(", "), icon: CalendarDays },
    { label: `${batches} weekly batches`, detail: "Small groups, fixed slots", icon: Clock3 },
    { label: config.coachCredential, detail: config.coachName, icon: GraduationCap },
    { label: "Group and one-to-one", detail: "Same syllabus either way", icon: Users },
  ];

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": ["LocalBusiness", "EducationalOrganization"],
      "@id": `${pageUrl}#centre`,
      name: `Envision Chess Academy - ${config.name}`,
      alternateName: config.h1,
      description: config.description,
      url: pageUrl,
      image: `${MARKETING_BASE_URL}${CENTRE_OG_IMAGE}`,
      telephone: config.phone,
      email: ACADEMY_DEFAULTS.email,
      address: centrePostalAddress(config),
      hasMap: directionsUrl,
      areaServed: [{ "@type": "City", name: "Kolkata" }, ...config.nearby.map((area) => ({ "@type": "Place", name: `${area}, Kolkata` }))],
      openingHoursSpecification: centreOpeningHours(config),
      knowsAbout: ["Chess coaching", "Chess classes for kids", "Chess tournament preparation"],
      parentOrganization: {
        "@type": "EducationalOrganization",
        name: "Envision Chess Academy",
        legalName: ACADEMY_DEFAULTS.legalName,
        url: `${MARKETING_BASE_URL}/`,
        telephone: ACADEMY_DEFAULTS.phone,
        email: ACADEMY_DEFAULTS.email,
      },
      makesOffer: config.programmes.map((programme) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: programme, serviceType: "Chess coaching" },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: centreHub.navLabel, item: hubUrl },
        { "@type": "ListItem", position: 3, name: config.h1, item: pageUrl },
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

      <MarketingHeader demoHref={contactHref} ctaLabel="Contact Us" />

      {/* ------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden bg-[#f5edf8] text-brand-900">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_52%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-14">
          <div className="motion-rise max-w-xl">
            <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-brand-900/60">
              <Link href="/" className="hover:text-brand">Home</Link>
              <span>/</span>
              <Link href={`/${centreHub.slug}`} className="hover:text-brand">{centreHub.navLabel}</Link>
              <span>/</span>
              <span className="text-brand">{config.name}</span>
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
              <CheckCircle2 size={15} /> Offline Centre &middot; {config.area}
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.6rem]">{config.h1}</h1>
            <h2 className="mt-2.5 max-w-lg text-base font-black leading-snug text-brand sm:text-lg">{config.supportingHeading}</h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-brand-900/70 sm:text-[0.95rem]">{config.intro}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={contactHref} className="btn-accent min-h-11 whitespace-nowrap px-5 shadow-lg shadow-accent-600/20">
                Contact Us <ArrowRight size={18} />
              </Link>
              <a href={`tel:${config.phone}`} className="btn min-h-11 whitespace-nowrap border border-brand/25 bg-white px-5 text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                <Phone size={18} /> {config.phoneDisplay}
              </a>
            </div>
          </div>

          {/* The card a local searcher actually came for: where, when, who. */}
          <aside className="rounded-2xl border border-brand/10 bg-white p-5 shadow-xl shadow-brand-900/10 sm:p-6">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-brand-900/70">Centre details</h2>
            <dl className="mt-4 grid gap-4">
              <div className="flex gap-3">
                <MapPin size={18} className="mt-0.5 shrink-0 text-brand" />
                <div>
                  <dt className="text-xs font-black uppercase tracking-[0.1em] text-brand-900/50">Address</dt>
                  <dd><address className="mt-1 text-sm not-italic leading-6 text-brand-900/80">{config.address}</address></dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Phone size={18} className="mt-0.5 shrink-0 text-brand" />
                <div>
                  <dt className="text-xs font-black uppercase tracking-[0.1em] text-brand-900/50">Contact</dt>
                  <dd className="mt-1 text-sm leading-6 text-brand-900/80">
                    <a href={`tel:${config.phone}`} className="font-bold text-brand hover:underline">{config.phoneDisplay}</a>
                    <span className="block text-xs text-brand-900/60">{config.contactName} &middot; {config.contactRole}</span>
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock3 size={18} className="mt-0.5 shrink-0 text-brand" />
                <div>
                  <dt className="text-xs font-black uppercase tracking-[0.1em] text-brand-900/50">Class days</dt>
                  <dd className="mt-1 text-sm leading-6 text-brand-900/80">{config.schedule.map((entry) => entry.day).join(", ")}</dd>
                </div>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={directionsUrl} target="_blank" rel="noreferrer" className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                <Navigation size={16} /> Get directions
              </a>
              <Link href="#timings" className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
                See batch timings
              </Link>
            </div>
            <p className="mt-4 border-t border-brand/10 pt-4 text-xs leading-5 text-brand-900/60">
              Our team shares the current fee structure with you directly when you get in touch.
            </p>
          </aside>
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

      {/* ------------------------------------------------- timings and map */}
      <section id="timings" className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(253,231,90,0.4),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Batch Timings</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
              Chess class timings at our {config.name} centre.
            </h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              {batches} batches a week across {config.schedule.length} days. Students attend two classes a week, so pick any two slots that fit
              around school - a coach confirms the batch after the demo class.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              {config.schedule.map((entry) => (
                <article key={entry.day} className="rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30">
                  <h3 className="text-sm font-black uppercase tracking-[0.12em] text-brand">{entry.day}</h3>
                  <ul className="mt-3 divide-y divide-brand/10">
                    {entry.slots.map((slot) => (
                      <li key={`${slot.from}-${slot.to}`} className="flex items-baseline justify-between gap-3 py-2">
                        <time className="text-sm font-bold tabular-nums text-brand-900/85">{slotLabel(slot)}</time>
                        {slot.note ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-brand-900">{slot.note}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5">
              <figure className="m-0">
                <iframe
                  title={`Map to the Envision Chess Academy ${config.name} chess coaching centre in Kolkata`}
                  src={embedUrl}
                  className="h-72 w-full border-0"
                  loading="lazy"
                />
                <figcaption className="border-t border-brand/10 p-5">
                  <h3 className="text-sm font-black text-brand-900">How to reach the {config.name} centre</h3>
                  <address className="mt-2 text-sm not-italic leading-6 text-brand-900/70">{config.address}</address>
                  <p className="mt-2 text-sm leading-6 text-brand-900/70">
                    Convenient for families in {config.nearby.slice(0, -1).join(", ")} and {config.nearby[config.nearby.length - 1]}.
                  </p>
                  <a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-black text-brand hover:underline">
                    Open in Google Maps <ArrowRight size={15} />
                  </a>
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------- coach and programmes */}
      <section className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <article className="rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">The Coach</p>
            <h2 className="mt-4 text-xl font-black text-brand-900 sm:text-2xl">Who teaches at {config.name}</h2>
            <p className="mt-2 text-sm font-black text-brand">{config.coachName}</p>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">{config.coachBio}</p>
            <p className="mt-4 text-xs font-semibold leading-5 text-brand-900/60">
              {ACADEMY_DEFAULTS.affiliationLine}
              <br />
              {ACADEMY_DEFAULTS.recognitionLine}
            </p>
          </article>

          <article className="rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Programmes</p>
            <h2 className="mt-4 text-xl font-black text-brand-900 sm:text-2xl">What runs at this centre</h2>
            <ul className="mt-4 grid gap-2.5">
              {config.programmes.map((programme) => (
                <li key={programme} className="flex items-start gap-2.5 text-sm leading-6 text-brand-900/75">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand" />
                  {programme}
                </li>
              ))}
            </ul>
            {config.offer ? (
              <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-accent-600/30 bg-accent/25 p-4 text-sm font-semibold leading-6 text-brand-900">
                <Gift size={18} className="mt-0.5 shrink-0 text-brand" />
                {config.offer}
              </p>
            ) : null}
          </article>
        </div>
      </section>

      {/* ------------------------------------------------- the same ladder */}
      <section className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">The Syllabus</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
              What a student at {config.name} actually learns.
            </h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              Offline students here work through the same published ladder as our online students: five stages, fifteen levels and 240 taught
              sessions. Open any stage to read the syllabus session by session.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {coursePages.map((page) => (
              <li key={page.slug}>
                <Link
                  href={`/${page.slug}`}
                  className="flex h-full flex-col rounded-xl border border-brand/10 bg-white px-4 py-3 shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50"
                >
                  <span className="text-sm font-black text-brand-900">{page.h1}</span>
                  <span className="mt-1 text-xs leading-5 text-brand-900/60">{page.prerequisite}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/${courseHub.slug}`} className="mt-6 inline-flex items-center gap-1 text-sm font-black text-brand hover:underline">
            See all online chess coaching courses <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <WhyEnvision
        demoHref={contactHref}
        ctaLabel="Contact Us"
        heading={`Why parents in ${config.name} choose Envision Chess Academy.`}
        intro="Not a set of loose classes. A published syllabus, a coach who places your child at the right session, and a portal where parents can see every class, score and tournament result."
        secondary={{ href: `tel:${config.phone}`, label: `Call ${config.phoneDisplay}` }}
      />

      <CourseResultsStrip
        heading="What students from our Kolkata centres go on to win."
        intro="Every result below belongs to a student trained on the Envision syllabus, at a Kolkata centre or in a live online batch."
        offset={kolkataCentres.findIndex((centre) => centre.slug === config.slug) + 1}
      />

      {/* -------------------------------------------------------------- FAQ */}
      <section className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Questions</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
            Questions about chess classes in {config.name}.
          </h2>
          <div className="mt-8 grid gap-3">
            {config.faqs.map((faq) => (
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

      {/* --------------------------------------------------- other centres */}
      <section className="relative bg-white py-16 text-brand-900 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Other Kolkata chess centres">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-brand-900/70">Our other chess academy centres in Kolkata</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {otherCentres.map((centre) => (
                <li key={centre.slug}>
                  <Link
                    href={centreHref(centre.slug)}
                    className="flex h-full flex-col rounded-xl border border-brand/10 bg-white px-4 py-4 shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-black text-brand-900">
                      <MapPin size={15} className="text-brand" /> {centre.h1}
                    </span>
                    <span className="mt-1.5 text-xs leading-5 text-brand-900/60">{centre.address}</span>
                    <span className="mt-1.5 text-xs font-bold text-brand">{centre.schedule.map((entry) => entry.day.slice(0, 3)).join(", ")}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`/${centreHub.slug}`}
                  className="flex h-full flex-col rounded-xl border border-brand/15 bg-brand-50 px-4 py-4 shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 hover:border-brand/40"
                >
                  <span className="flex items-center gap-1.5 text-sm font-black text-brand-900">
                    <Sparkles size={15} className="text-brand" /> {centreHub.navLabel}
                  </span>
                  <span className="mt-1.5 text-xs leading-5 text-brand-900/60">All four centres, timings and coaches in one place.</span>
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </section>

      {/* ---------------------------------------------------------- last CTA */}
      <section className="relative overflow-hidden bg-white px-4 pb-16 text-brand-900 sm:px-6 lg:px-8 lg:pb-24">
        <div className="relative mx-auto max-w-7xl rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-900 shadow-sm shadow-accent-600/30">Talk to us</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Ask us about the {config.name} centre.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              Send us a message and we will come back with the batches that still have room, the current fee structure and a free trial class
              with the coach. Prefer to speak to somebody now? Call {config.phoneDisplay}.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href={contactHref} className="btn-accent">Contact Us</Link>
            <a href={`tel:${config.phone}`} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
              <Phone size={16} /> Call the centre
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
