import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { academyReasons } from "@/lib/academyReasons";

/**
 * The "why choose us" card wall, shared by the landing page and the course
 * pages so both make the same promises.
 *
 * `secondary` is the non-demo call to action, which differs by page: the
 * landing page sends people down to the curriculum, a course page sends them
 * into the portal.
 */
export default function WhyEnvision({
  demoHref,
  secondary,
  ctaLabel = "Book Free Demo Class",
  heading = "Why parents choose Envision Chess Academy.",
  intro = "Not a set of loose classes. A structured path, a coach who knows where your child is, and a portal that shows you the progress.",
}: {
  demoHref: string;
  secondary?: { href: string; label: string };
  ctaLabel?: string;
  heading?: string;
  intro?: string;
}) {
  return (
    <section id="why" className="relative overflow-hidden bg-[#f5edf8] py-16 text-brand-900 lg:py-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(253,231,90,0.4),transparent_30%),radial-gradient(circle_at_88%_20%,rgba(90,19,114,0.08),transparent_32%),linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
      <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(rgba(90,19,114,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(90,19,114,0.05)_1px,transparent_1px)] [background-size:84px_84px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">Why Envision</p>
          <h2 className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">{heading}</h2>
          <p className="mt-3 text-sm leading-7 text-brand-900/70">{intro}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {academyReasons.map((reason, index) => {
            const Icon = reason.icon;
            return (
              <article
                key={reason.title}
                className="group relative flex min-h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white p-6 shadow-lg shadow-brand-900/5 transition duration-300 ease-out hover:-translate-y-1.5 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/15"
              >
                {/* A yellow wash rises from the bottom as the card is hovered. */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0 bg-gradient-to-t from-accent/25 to-transparent transition-all duration-500 ease-out group-hover:h-full" aria-hidden />
                {/* And an accent rule sweeps across the top edge. */}
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-brand via-accent to-brand transition-transform duration-500 ease-out group-hover:scale-x-100" aria-hidden />

                <span className="absolute right-5 top-5 z-10 text-3xl font-black leading-none text-brand-100 transition-colors duration-300 group-hover:text-accent-500" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="relative z-10 grid h-12 w-12 place-items-center rounded-xl bg-brand text-accent shadow-sm shadow-brand-900/20 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110">
                  <Icon size={22} />
                </span>
                <h3 className="relative z-10 mt-5 text-base font-black leading-snug text-brand-900 transition-colors duration-300 group-hover:text-brand">{reason.title}</h3>
                <p className="relative z-10 mt-2.5 text-sm leading-6 text-brand-900/70">{reason.detail}</p>
                <span className="relative z-10 mt-5 block h-1 w-10 rounded-full bg-accent transition-all duration-500 ease-out group-hover:w-24 group-hover:bg-brand" />
              </article>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={demoHref} className="btn-accent">
            {ctaLabel} <ArrowRight size={16} />
          </Link>
          {secondary ? (
            <Link href={secondary.href} className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
