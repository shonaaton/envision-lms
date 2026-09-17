import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Mail, MapPin, Menu, Phone } from "lucide-react";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL, ACADEMY_PHONE_DISPLAY } from "@/lib/branding";
import { centreHref, centreHub, kolkataAreasServed, kolkataCentres } from "@/lib/centrePages";
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
  ["Student Success Stories", "/success-stories"],
  ["Parent Reviews", "/#reviews"],
  ["Book a Free Demo Class", "/register"],
  ["Contact Us", "/contact-us"],
  ["Student Login", "/login"],
];

/** A footer column heading, so the footer has a real document outline. */
function FooterHeading({ children, href }: { children: React.ReactNode; href?: string }) {
  const text = <span className="text-xs font-black uppercase tracking-[0.14em] text-accent">{children}</span>;
  return <h2 className="mb-4">{href ? <Link href={href} className="hover:underline">{text}</Link> : text}</h2>;
}

/** Every footer link reads the same: quiet white, accent on hover, like the header. */
const footerLink = "text-sm text-white/75 transition hover:text-accent hover:underline";

const legalLinks: NavItem[] = [
  ["Privacy Policy", "/privacy"],
  ["Terms of Service", "/terms"],
  ["Refund Policy", "/refund-policy"],
];

/**
 * The sitewide footer.
 *
 * It is the only block that links every public page from every public page, so
 * it is built from `coursePages` and `kolkataCentres` rather than a hand-kept
 * list: a new course or centre cannot go missing from it.
 *
 * Two parts exist specifically for search. The NAP block repeats the academy's
 * name, address and phone in the same form the centre pages' `LocalBusiness`
 * schema uses, because inconsistent NAP is what splits one local listing into
 * two. And the areas row links each Kolkata locality to the centre that actually
 * serves it - the honest version of a "we serve X" list, since every entry is a
 * real commute to a real address rather than a doorway page.
 */
export function MarketingFooter() {
  const telHref = `tel:${ACADEMY_DEFAULTS.phone}`;
  const mailHref = `mailto:${ACADEMY_DEFAULTS.email}`;
  const areas = kolkataAreasServed();

  return (
    /*
      Brand purple, the same bar the header is, so the page is bookended rather
      than fading into a pale panel at the end. The logo artwork is
      yellow-on-transparent, so on this background it sits directly on the bar
      exactly as it does in the header - the dark box it used to need only
      existed because the old footer was light.
    */
    <footer className="border-t border-brand-700 bg-brand text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr_1.25fr_1fr]">
          {/* ---------------------------------------------------------- brand */}
          <div>
            <Link href="/" className="inline-flex" aria-label="Envision Chess Academy home">
              <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={190} height={64} unoptimized className="h-12 w-auto max-w-[190px] object-contain" />
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/70">
              Structured chess coaching from the first move to elite competitive play - live online across India and offline at{" "}
              {kolkataCentres.length} Kolkata centres - with classes, homework, tournaments and progress tracking in one portal.
            </p>

            {/* Name, address and phone, in the form the centre schema uses. */}
            <div className="mt-5 space-y-2 text-sm">
              <p className="font-black text-white">{ACADEMY_DEFAULTS.legalName}</p>
              <address className="flex gap-2 not-italic leading-6 text-white/70">
                <MapPin size={15} className="mt-1 shrink-0 text-accent" />
                <span>{ACADEMY_DEFAULTS.registeredAddress.replace("\n", ", ")}</span>
              </address>
              <a href={telHref} className="flex items-center gap-2 font-bold text-accent transition hover:underline">
                <Phone size={15} /> {ACADEMY_PHONE_DISPLAY}
              </a>
              <a href={mailHref} className="flex items-center gap-2 break-all font-bold text-accent transition hover:underline">
                <Mail size={15} /> {ACADEMY_DEFAULTS.email}
              </a>
            </div>

            <p className="mt-5 text-xs font-semibold leading-5 text-white/65">
              {ACADEMY_DEFAULTS.affiliationLine}
              <br />
              {ACADEMY_DEFAULTS.recognitionLine}
            </p>
          </div>

          {/* -------------------------------------------------------- courses */}
          <nav aria-label="Online chess coaching courses">
            <FooterHeading href={hubHref}>Online Chess Coaching Courses</FooterHeading>
            <ul className="space-y-2.5">
              <li>
                <Link href={hubHref} className="text-sm font-bold text-accent transition hover:underline">
                  All five chess courses
                </Link>
              </li>
              {/* The full course name, not the nav label: the anchor text is the
                  phrase each of those pages targets. */}
              {coursePages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/${page.slug}`} className={footerLink}>
                    {page.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* -------------------------------------------------------- academy */}
          <nav aria-label="Academy">
            <FooterHeading>Academy</FooterHeading>
            <ul className="space-y-2.5">
              {academyLinks.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className={footerLink}>
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <a href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className={footerLink}>
                  Achievement Gallery
                </a>
              </li>
            </ul>
          </nav>

          {/* -------------------------------------------------------- centres */}
          <nav aria-label="Kolkata chess academy centres">
            <FooterHeading href={centreHubHref}>{centreHub.navLabel}</FooterHeading>
            <ul className="space-y-3">
              {kolkataCentres.map((centre) => (
                <li key={centre.slug} className="flex gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    <Link href={centreHref(centre.slug)} className="block text-sm font-bold text-white transition hover:text-accent hover:underline">
                      {centre.h1}
                    </Link>
                    <span className="block text-xs leading-5 text-white/65">{centre.address}</span>
                    <a href={`tel:${centre.phone}`} className="mt-0.5 inline-block text-xs font-bold text-accent transition hover:underline">
                      {centre.phoneDisplay}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* ------------------------------------------------------------ areas */}
        <nav aria-label="Areas we serve in Kolkata" className="mt-10 border-t border-white/12 pt-8">
          <h2 className="text-xs font-black uppercase tracking-[0.14em] text-accent">Chess Classes Across Kolkata</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/60">
            Each area links to the Envision centre nearest to it, with that centre&apos;s batch timings, coach and contact number.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {areas.map(({ area, centre }) => (
              <li key={area}>
                <Link
                  href={centreHref(centre.slug)}
                  title={`Nearest centre: ${centre.h1}, ${centre.address}`}
                  className="inline-flex rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-accent/60 hover:bg-white/10 hover:text-accent"
                >
                  Chess classes in {area}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* ------------------------------------------------------------- bottom */}
      <div className="border-t border-white/12 bg-brand-600">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-white/60 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            Copyright {new Date().getFullYear()} {ACADEMY_DEFAULTS.legalName}. GSTIN {ACADEMY_DEFAULTS.gstNumber}.
          </div>
          <nav aria-label="Legal" className="flex flex-wrap gap-4">
            {legalLinks.map(([label, href]) => (
              <Link key={href} href={href} className="font-semibold text-white/70 transition hover:text-accent hover:underline">
                {label}
              </Link>
            ))}
            <CookieSettingsLink className="font-semibold text-white/70 transition hover:text-accent hover:underline" />
          </nav>
        </div>
      </div>
    </footer>
  );
}
