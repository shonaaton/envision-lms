import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Mail, MapPin, Menu, Phone } from "lucide-react";
import { academyBranches } from "@/lib/achievementData";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL } from "@/lib/branding";
import { courseHub, coursePages } from "@/lib/coursePages";
import { OFFLINE_ACADEMY_URL } from "@/lib/publicLinks";
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

export type NavItem = [label: string, href: string];

export const landingNav: NavItem[] = [
  ["Home", "#home"],
  ["Why Us", "#why"],
  ["Programs", "#programs"],
  ["Portal", "#platform"],
  ["Reviews", "#reviews"],
  ["Achievements", "#achievements"],
  ["Centres", "#centres"],
];

/** Same destinations, reachable from a course route. */
export const courseNav: NavItem[] = [
  ["Home", "/"],
  ["Portal", "/#platform"],
  ["Achievements", "/#achievements"],
  ["Centres", "/#centres"],
];

/** The courses dropdown, on both the landing page and the course routes. */
function CoursesMenu() {
  return (
    <div className="group relative">
      <Link href={hubHref} className="inline-flex items-center gap-1 text-sm font-semibold text-white/80 hover:text-accent">
        Courses <ChevronDown size={14} className="transition-transform duration-200 group-hover:rotate-180" />
      </Link>
      {/* Hover-opened so it works without client JavaScript; the hub link above
          is the keyboard and touch path into the same content. */}
      <div className="invisible absolute left-0 top-full z-50 w-[min(80vw,300px)] translate-y-1 pt-3 opacity-0 transition duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-xl border border-brand/10 bg-white p-2 shadow-xl shadow-brand-900/15">
          <Link href={hubHref} className="block rounded-lg px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-brand hover:bg-brand-50">
            All courses
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

export function MarketingHeader({ navItems, demoHref }: { navItems: NavItem[]; demoHref: string }) {
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
        <nav className="hidden items-center gap-5 xl:flex" aria-label="Main navigation">
          {navItems.map(([label, href]) => (
            <Link key={href} href={href} className="text-sm font-semibold text-white/80 hover:text-accent">
              {label}
            </Link>
          ))}
          <CoursesMenu />
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/login" className="btn border border-white/30 bg-white/10 text-white hover:bg-white/20">
            Login
          </Link>
          <Link href={demoHref} className="btn-accent">
            Book Free Demo Class
          </Link>
        </div>
        <details className="relative xl:hidden">
          <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-lg border border-white/30 bg-white/10 text-accent">
            <Menu size={20} />
          </summary>
          <div className="absolute right-0 mt-3 max-h-[70vh] w-[min(88vw,340px)] overflow-y-auto rounded-xl border border-brand-700 bg-brand-900 p-3 shadow-lg shadow-brand-900/30">
            {navItems.map(([label, href]) => (
              <Link key={href} href={href} className="block rounded-lg px-3 py-3 text-sm font-bold text-white/85 hover:bg-white/10">
                {label}
              </Link>
            ))}
            <div className="mt-2 border-t border-white/15 pt-2">
              <Link href={hubHref} className="block rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-accent hover:bg-white/10">
                Online Chess Coaching Courses
              </Link>
              {coursePages.map((page) => (
                <Link key={page.slug} href={`/${page.slug}`} className="block rounded-lg px-3 py-2.5 pl-5 text-sm font-bold text-white/85 hover:bg-white/10">
                  {page.navLabel}
                </Link>
              ))}
            </div>
            <div className="mt-3 grid gap-2 border-t border-white/15 pt-3">
              <Link href="/login" className="btn border border-white/30 bg-white/10 text-white">Login</Link>
              <Link href={demoHref} className="btn-accent">Book Free Demo Class</Link>
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
          <nav aria-label="Courses">
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-brand-900">Courses</h2>
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
                <a href={OFFLINE_ACADEMY_URL} target="_blank" rel="noreferrer" className="text-sm text-brand-900/70 hover:text-brand hover:underline">
                  Offline Academy
                </a>
              </li>
              <li>
                <a href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-900/70 hover:text-brand hover:underline">
                  Achievement Gallery
                </a>
              </li>
            </ul>
          </nav>

          {/* -------------------------------------------------------- centres */}
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-brand-900">Kolkata Centres</h2>
            <ul className="mt-4 space-y-3">
              {academyBranches.map((centre) => (
                <li key={centre.name} className="flex gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-brand" />
                  <span>
                    <span className="block text-sm font-bold text-brand-900">{centre.name}</span>
                    <span className="block text-xs leading-5 text-brand-900/60">{centre.address}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
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
