import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Mail, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import ContactForm from "@/components/marketing/ContactForm";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL } from "@/lib/branding";
import { centreHref, centreHub, centreTimeRange, kolkataCentres } from "@/lib/centrePages";
import { courseHub } from "@/lib/coursePages";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

const pageUrl = `${MARKETING_BASE_URL}/contact-us`;
const OG_IMAGE_PATH = "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg";

const title = "Contact Us | Envision Chess Academy, Kolkata";
const description =
  "Contact Envision Chess Academy for online chess classes or our four Kolkata centres. Send a message, or call the centre directly for batch timings and fees.";

export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_BASE_URL),
  title,
  description,
  keywords: [
    "contact Envision Chess Academy",
    "chess academy contact number Kolkata",
    "chess classes enquiry Kolkata",
    "chess coaching enquiry",
    "chess academy near me contact",
    "online chess classes enquiry",
  ],
  alternates: { canonical: pageUrl },
  openGraph: {
    title,
    description,
    url: pageUrl,
    siteName: "Envision Chess Academy",
    type: "website",
    images: [{ url: OG_IMAGE_PATH, width: 1200, height: 900, alt: "Envision Chess Academy - contact us" }],
  },
  twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE_PATH] },
};

/**
 * The contact page.
 *
 * The form is the point, but the centre numbers sit beside it on purpose: a
 * parent who wants to speak to somebody now should not have to fill in a form
 * to find a phone number, and an enquiry that never needed to be an enquiry is
 * one the team does not have to work.
 */
export default function ContactUsPage() {
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      name: title,
      description,
      url: pageUrl,
      about: {
        "@type": "EducationalOrganization",
        name: "Envision Chess Academy",
        legalName: ACADEMY_DEFAULTS.legalName,
        url: `${MARKETING_BASE_URL}/`,
        logo: ACADEMY_LOGO_URL,
        email: ACADEMY_DEFAULTS.email,
        telephone: ACADEMY_DEFAULTS.phone,
        contactPoint: kolkataCentres.map((centre) => ({
          "@type": "ContactPoint",
          contactType: `${centre.name} centre enquiries`,
          telephone: centre.phone,
          email: ACADEMY_DEFAULTS.email,
          areaServed: "IN",
          availableLanguage: ["English", "Bengali", "Hindi"],
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${MARKETING_BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Contact Us", item: pageUrl },
      ],
    },
  ];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <MarketingHeader demoHref="/register" />

      {/* ------------------------------------------------------ hero + form */}
      <section className="relative isolate overflow-hidden bg-[#f5edf8] text-brand-900">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_52%,#e8d4f0_100%)]" />
        <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
        <div className="relative mx-auto grid max-w-7xl items-start gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-14">
          <div className="motion-rise max-w-xl lg:sticky lg:top-24">
            <nav aria-label="Breadcrumb" className="mb-4 text-xs font-bold text-brand-900/60">
              <Link href="/" className="hover:text-brand">Home</Link>
              <span className="px-1.5">/</span>
              <span className="text-brand">Contact Us</span>
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
              <MessageCircle size={15} /> We reply on WhatsApp
            </p>
            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.08] text-brand-900 sm:text-[2.25rem] lg:text-[2.6rem]">Contact Us</h1>
            <h2 className="mt-2.5 max-w-lg text-base font-black leading-snug text-brand sm:text-lg">
              Talk to Envision Chess Academy about online classes or any of our four Kolkata centres.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-brand-900/70">
              Tell us who the classes are for and where you want to learn, and our team will come back with batch timings, current availability
              and the fee structure. Prefer to call? Every centre number is below.
            </p>

            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5">
                <dt className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-brand-900/50">
                  <Phone size={14} className="text-brand" /> Academy office
                </dt>
                <dd className="mt-1.5">
                  <a href={`tel:${ACADEMY_DEFAULTS.phone}`} className="text-sm font-black text-brand hover:underline">{ACADEMY_DEFAULTS.phone}</a>
                </dd>
              </div>
              <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5">
                <dt className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-brand-900/50">
                  <Mail size={14} className="text-brand" /> Email
                </dt>
                <dd className="mt-1.5">
                  <a href={`mailto:${ACADEMY_DEFAULTS.email}`} className="break-all text-sm font-black text-brand hover:underline">{ACADEMY_DEFAULTS.email}</a>
                </dd>
              </div>
              <div className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5 sm:col-span-2">
                <dt className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-brand-900/50">
                  <MapPin size={14} className="text-brand" /> Registered office
                </dt>
                <dd className="mt-1.5 text-sm leading-6 text-brand-900/75">
                  <address className="not-italic">{ACADEMY_DEFAULTS.registeredAddress.replace("\n", ", ")}</address>
                </dd>
              </div>
            </dl>
          </div>

          <ContactForm />
        </div>
      </section>

      {/* --------------------------------------------------- centre numbers */}
      <section id="centres" className="relative overflow-hidden bg-white py-16 text-brand-900 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(90,19,114,0.08),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f5edf8_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Call a centre</p>
            <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">Contact numbers for our Kolkata centres.</h2>
            <p className="mt-3 text-sm leading-7 text-brand-900/70">
              Each centre has its own in-charge and its own batch timings. Call the one nearest you, or{" "}
              <Link href={`/${centreHub.slug}`} className="font-black text-brand hover:underline">compare all four centres</Link>.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kolkataCentres.map((centre) => (
              <article key={centre.slug} className="flex min-h-full flex-col rounded-2xl border border-brand/10 bg-white p-5 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20">
                  <MapPin size={18} />
                </span>
                <h3 className="mt-4 text-base font-black text-brand-900">
                  <Link href={centreHref(centre.slug)} className="hover:text-brand hover:underline">{centre.name} centre</Link>
                </h3>
                <address className="mt-1.5 flex-1 text-xs not-italic leading-5 text-brand-900/65">{centre.address}</address>
                <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-brand-900/70">
                  <Clock3 size={14} className="mt-0.5 shrink-0 text-brand" />
                  {centre.schedule.map((entry) => entry.day.slice(0, 3)).join(", ")} &middot; {centreTimeRange(centre)}
                </p>
                <p className="mt-2.5 text-xs text-brand-900/60">{centre.contactName} &middot; {centre.contactRole}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`tel:${centre.phone}`} className="btn-accent px-3.5 py-2 text-xs">
                    <Phone size={14} /> {centre.phoneDisplay}
                  </a>
                  <a href={centre.mapsUrl} target="_blank" rel="noreferrer" className="btn border border-brand/25 bg-white px-3.5 py-2 text-xs text-brand hover:border-brand/50 hover:bg-brand-50">
                    <Navigation size={14} /> Map
                  </a>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-6 text-sm leading-7 text-brand-900/70">
            Not in Kolkata? The same courses run live online for students anywhere in India and in 15+ other countries.{" "}
            <Link href={`/${courseHub.slug}`} className="font-black text-brand hover:underline">See the online chess coaching courses</Link>.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- last CTA */}
      <section className="relative overflow-hidden bg-white px-4 pb-16 text-brand-900 sm:px-6 lg:px-8 lg:pb-24">
        <div className="relative mx-auto max-w-7xl rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-900 shadow-sm shadow-accent-600/30">Free demo class</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Would you rather just try a class?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">
              The demo is a real assessment class with a coach, online or at a centre. It ends with a level recommendation, and there is no
              obligation to enrol.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link href="/register" className="btn-accent">Book Free Demo Class <ArrowRight size={16} /></Link>
            <Link href={`/${centreHub.slug}`} className="btn border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-brand-50">
              {centreHub.navLabel}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
