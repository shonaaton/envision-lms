import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";
import { coursePages } from "@/lib/coursePages";
import { OFFLINE_ACADEMY_URL } from "@/lib/publicLinks";

/**
 * The marketing header and footer, shared by every public page.
 *
 * Pages that are not the landing page pass absolute anchors ("/#programs") so
 * the nav still works from a sub-route.
 */

const cloudinaryCollectionUrl = "https://collection.cloudinary.com/dlafr6yu3/3ddc9e2d8d7656087c4a52336a2e1df4";

export type NavItem = [label: string, href: string];

export const landingNav: NavItem[] = [
  ["Home", "#home"],
  ["Why Us", "#why"],
  ["Programs", "#programs"],
  ["Portal", "#platform"],
  ["Reviews", "#reviews"],
  ["Anish", "#anish"],
  ["Achievements", "#achievements"],
  ["Centres", "#centres"],
];

/**
 * Same destinations, reachable from a course route. The course links are built
 * from the page configs so a new tier appears in the nav automatically.
 */
export const courseNav: NavItem[] = [
  ["Home", "/"],
  ...coursePages.map((page) => [page.navLabel, `/${page.slug}`] as NavItem),
  ["Programs", "/#programs"],
  ["Portal", "/#platform"],
  ["Achievements", "/#achievements"],
  ["Centres", "/#centres"],
];

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
          <div className="absolute right-0 mt-3 w-[min(88vw,340px)] rounded-xl border border-brand-700 bg-brand-900 p-3 shadow-lg shadow-brand-900/30">
            {navItems.map(([label, href]) => (
              <Link key={href} href={href} className="block rounded-lg px-3 py-3 text-sm font-bold text-white/85 hover:bg-white/10">
                {label}
              </Link>
            ))}
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

export function MarketingFooter() {
  return (
    <footer className="border-t border-brand/10 bg-white py-6 text-sm text-brand-900/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>Copyright {new Date().getFullYear()} Envision Chess Academy</div>
        <div className="flex flex-wrap gap-4">
          {coursePages.map((page) => (
            <Link key={page.slug} href={`/${page.slug}`} className="font-semibold text-brand hover:underline">
              {page.keyword}
            </Link>
          ))}
          <Link href={cloudinaryCollectionUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Achievement images</Link>
          <Link href={OFFLINE_ACADEMY_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Offline academy source</Link>
        </div>
      </div>
    </footer>
  );
}
