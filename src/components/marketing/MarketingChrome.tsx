import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Mail, MapPin, Menu, Phone } from "lucide-react";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL } from "@/lib/branding";
import { centreHref, centreHub, kolkataCentres } from "@/lib/centrePages";
import { courseHub, coursePages } from "@/lib/coursePages";
import CookieSettingsLink from "@/components/marketing/CookieSettingsLink";

/**
 * The marketing header and footer, shared by every public page.
 *
 * Pages that are not the landing page pass absolute anchors ("/#programs") so
 * the nav still works from a sub-route. The course links are built from the page
 * configs, so a new tier appears in the nav, the dropdown and the footer without
 * a second edit.
 */

const cloudinaryCollectionUrl = "https://collection.cloudinary.com/dlafr6yu3/3ddc9e2d8d7656087c4a52336a2e1df4";
const hubHref = `/${courseHub.slug}`;
const centreHubHref = `/${centreHub.slug}`;

export type NavItem = [label: string, href: string];

/**
 * One nav row for the whole public site.
 *
 * Every page used to pass its own list, so the menu changed shape as you moved
 * between the landing page, a course and a centre. The two dropdowns are the
 * journeys the site splits into, so they sit in the middle of the row and the
 * links on either side are absolute - they work identically from every route,
 * including the legal and contact pages, which carry no sections of their own.
 */
export type NavEntry = NavItem | "courses" | "centres";

export const siteNav: NavEntry[] = [
  ["Home", "/"],
  ["Why Us", "/#why"],
  "courses",
  "centres",
  ["Contact Us", "/contact-us"],
];

/**
 * The courses dropdown, the same on every page.
 *
 * The trigger is the sitewide internal link into the hub, so it spells out
 * "Online Chess Coaching Courses" - the phrase that page targets - rather than
 * spending the anchor text on the word "Courses".
 */
function CoursesMenu() {
  return (
    <div className="group relative">
      <Link href={hubHref} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-white/80 hover:text-accent">
        Online Chess Coaching Courses <ChevronDown size={14} className="shrink-0 transition-transform duration-200 group-hover:rotate-180" />
      </Link>
      {/* Hover-opened so it works without client JavaScript; the hub link above
          is the keyboard and touch path into the same content. */}
      <div className="invisible absolute left-0 top-full z-50 w-[min(80vw,300px)] translate-y-1 pt-3 opacity-0 transition duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-xl border border-brand/10 bg-white p-2 shadow-xl shadow-brand-900/15">
          <Link href={hubHref} className="block rounded-lg px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-brand hover:bg-brand-50">
            All five courses
          </Link>
          {coursePages.map((page) => (
            <Link key={page.slug} href={`/${page.slug}`} className="block rounded-lg px-3 py-2.5 text-sm font-bold text-brand-900/80 hover:bg-brand-50 hover:text-brand">
              {page.navLabel}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The Kolkata centres dropdown, the offline counterpart to `CoursesMenu`,
 * likewise the same on every page.
 *
 * The trigger is the sitewide internal link into the city hub, so it spells out
 * "Chess Academy in Kolkata" - the phrase that page targets - and the children
 * spell out the localities theirs do.
 */
function CentresMenu() {
  return (
    <div className="group relative">
      <Link href={centreHubHref} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-white/80 hover:text-accent">
        {centreHub.navLabel} <ChevronDown size={14} className="shrink-0 transition-transform duration-200 group-hover:rotate-180" />
      </Link>
      <div className="invisible absolute left-0 top-full z-50 w-[min(80vw,300px)] translate-y-1 pt-3 opacity-0 transition duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-xl border border-brand/10 bg-white p-2 shadow-xl shadow-brand-900/15">
          <Link href={centreHubHref} className="block rounded-lg px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-brand hover:bg-brand-50">
            All {kolkataCentres.length} Kolkata centres
          </Link>
          {kolkataCentres.map((centre) => (
            <Link key={centre.slug} href={centreHref(centre.slug)} className="block rounded-lg px-3 py-2.5 text-sm font-bold text-brand-900/80 hover:bg-brand-50 hover:text-brand">
              {centre.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The mobile drawer's grouped copy of a dropdown. */
function MobileMenuGroup({ href, label, links }: { href: string; label: string; links: NavItem[] }) {
  return (
    <div className="mt-2 border-t border-white/15 pt-2">
      <Link href={href} className="block rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-accent hover:bg-white/10">
        {label}
      </Link>
      {links.map(([childLabel, childHref]) => (
        <Link key={childHref} href={childHref} className="block rounded-lg px-3 py-2.5 pl-5 text-sm font-bold text-white/85 hover:bg-white/10">
          {childLabel}
        </Link>
      ))}
    </div>
  );
}

const courseChildren: NavItem[] = coursePages.map((page) => [page.navLabel, `/${page.slug}`]);
const centreChildren: NavItem[] = kolkataCentres.map((centre) => [centre.name, centreHref(centre.slug)]);

/**
 * `ctaLabel` exists for the offline pages. A parent reading a centre page wants
 * to talk to that centre, not open a booking form, so those pages point the
 * primary button at the contact form and relabel it. Every other page keeps the
 * default and nothing about them changes.
 */
export function MarketingHeader({ demoHref, ctaLabel = "Book Free Demo Class" }: { demoHref: string; ctaLabel?: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-700 bg-brand/95 text-white backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* The logo artwork is yellow-on-transparent, so it sits directly on the brand purple bar. */}
        <Link href="/" className="flex shrink-0 items-center" aria-label="Envision Chess Academy home">
          <Image
            src={ACADEMY_LOGO_URL}
            alt="Envision Chess Academy"
            width={190}
            height={64}
            priority
            unoptimized
            className="h-12 w-auto max-w-[150px] object-contain sm:h-14 sm:max-w-[190px]"
          />
        </Link>
        <nav className="hidden items-center gap-4 xl:flex" aria-label="Main navigation">
          {/* Five entries fit the desktop container alongside the action
              buttons; below xl the same row is available from the menu. */}
          {siteNav.map((entry) =>
            entry === "courses" ? (
              <CoursesMenu key="courses" />
            ) : entry === "centres" ? (
              <CentresMenu key="centres" />
            ) : (
              <Link key={entry[1]} href={entry[1]} className="whitespace-nowrap text-sm font-semibold text-white/80 hover:text-accent">
                {entry[0]}
              </Link>
            ),
          )}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/login" className="btn whitespace-nowrap border border-white/30 bg-white/10 text-white hover:bg-white/20">
            Login
          </Link>
          <Link href={demoHref} className="btn-accent whitespace-nowrap">
            {ctaLabel}
          </Link>
        </div>
        <details className="relative xl:hidden">
          <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-lg border border-white/30 bg-white/10 text-accent">
            <Menu size={20} />
          </summary>
          <div className="absolute right-0 mt-3 max-h-[70vh] w-[min(88vw,340px)] overflow-y-auto rounded-xl border border-brand-700 bg-brand-900 p-3 shadow-lg shadow-brand-900/30">
            {/* Same order as the desktop row, with each dropdown expanded in
                place. A plain link straight after an expanded group takes the
                group's divider, so it still reads as a top-level entry. */}
            {siteNav.map((entry, index) =>
              entry === "courses" ? (
                <MobileMenuGroup key="courses" href={hubHref} label={courseHub.navLabel} links={courseChildren} />
              ) : entry === "centres" ? (
                <MobileMenuGroup key="centres" href={centreHubHref} label={centreHub.navLabel} links={centreChildren} />
              ) : (
                <Link
                  key={entry[1]}
                  href={entry[1]}
                  className={`block rounded-lg px-3 py-3 text-sm font-bold text-white/85 hover:bg-white/10${
                    typeof siteNav[index - 1] === "string" ? " mt-2 border-t border-white/15 pt-4" : ""
                  }`}
                >
                  {entry[0]}
                </Link>
              ),
            )}
            <div className="mt-3 grid gap-2 border-t border-white/15 pt-3">
              <Link href="/login" className="btn border border-white/30 bg-white/10 text-white">Login</Link>
              <Link href={demoHref} className="btn-accent">{ctaLabel}</Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

const academyLinks: NavItem[] = [
  ["Learning Portal", "/#platform"],
  ["Student Achievements", "/#achievements"],
  ["Success Stories", "/success-stories"],
  ["Parent Reviews", "/#reviews"],
  ["Book a Free Demo", "/register"],
  ["Contact Us", "/contact-us"],
  ["Student Login", "/login"],
];

const legalLinks: NavItem[] = [
  ["Privacy Policy", "/privacy"],
  ["Terms of Service", "/terms"],
  ["Refund Policy", "/refund-policy"],
];

export function MarketingFooter() {
  const telHref = `tel:${ACADEMY_DEFAULTS.phone}`;
  const mailHref = `mailto:${ACADEMY_DEFAULTS.email}`;

  return (
    <footer className="border-t border-brand/10 bg-brand-50 text-brand-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* ---------------------------------------------------------- brand */}
          <div>
            <Link href="/" className="inline-flex rounded-xl bg-brand-900 px-3 py-2" aria-label="Envision Chess Academy home">
              <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={190} height={64} unoptimized className="h-10 w-auto max-w-[160px] object-contain" />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-brand-900/70">
              Structured chess coaching from the first move to elite competitive play, with live classes, homework, tournaments and progress
              tracking in one portal.
            </p>
            <p className="mt-4 text-xs font-semibold leading-5 text-brand-900/60">
              {ACADEMY_DEFAULTS.affiliationLine}
              <br />
              {ACADEMY_DEFAULTS.recognitionLine}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <a href={telHref} className="inline-flex items-center gap-2 text-sm font-bold text-brand hover:underline">
                <Phone size={15} /> {ACADEMY_DEFAULTS.phone}
              </a>
              <a href={mailHref} className="inline-flex items-center gap-2 text-sm font-bold text-brand hover:underline">
                <Mail size={15} /> {ACADEMY_DEFAULTS.email}
              </a>
            </div>
          </div>

          {/* -------------------------------------------------------- courses */}
          <nav aria-label="Online chess coaching courses">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-brand-900">Online Chess Coaching Courses</h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href={hubHref} className="text-sm font-bold text-brand hover:underline">
                  {courseHub.navLabel}
                </Link>
              </li>
              {coursePages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/${page.slug}`} className="text-sm text-brand-900/70 hover:text-brand hover:underline">
                    {page.navLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* -------------------------------------------------------- academy */}
          <nav aria-label="Academy">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-brand-900">Academy</h2>
            <ul className="mt-4 space-y-2.5">
              {academyLinks.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-brand-900/70 hover:text-brand hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={centreHubHref} className="text-sm text-brand-900/70 hover:text-brand hover:underline">
                  {centreHub.navLabel}
                </Link>
              </li>
              <li>
                <a href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-900/70 hover:text-brand hover:underline">
                  Achievement Gallery
                </a>
              </li>
            </ul>
          </nav>

          {/* -------------------------------------------------------- centres */}
          <nav aria-label="Kolkata chess academy centres">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-brand-900">
              <Link href={centreHubHref} className="hover:text-brand hover:underline">Kolkata Centres</Link>
            </h2>
            <ul className="mt-4 space-y-3">
              {kolkataCentres.map((centre) => (
                <li key={centre.slug} className="flex gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-brand" />
                  <span>
                    <Link href={centreHref(centre.slug)} className="block text-sm font-bold text-brand-900 hover:text-brand hover:underline">
                      {centre.h1}
                    </Link>
                    <span className="block text-xs leading-5 text-brand-900/60">{centre.address}</span>
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* ------------------------------------------------------------- bottom */}
      <div className="border-t border-brand/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-brand-900/60 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            Copyright {new Date().getFullYear()} {ACADEMY_DEFAULTS.legalName}. GSTIN {ACADEMY_DEFAULTS.gstNumber}.
          </div>
          <nav aria-label="Legal" className="flex flex-wrap gap-4">
            {legalLinks.map(([label, href]) => (
              <Link key={href} href={href} className="font-semibold text-brand-900/70 hover:text-brand hover:underline">
                {label}
              </Link>
            ))}
            <CookieSettingsLink className="font-semibold text-brand-900/70 hover:text-brand hover:underline" />
          </nav>
        </div>
      </div>
    </footer>
  );
}
