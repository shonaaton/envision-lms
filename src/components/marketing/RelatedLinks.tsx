import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RelatedLink } from "@/lib/internalLinks";

/**
 * The "where to next" block, shared by every public page that has one.
 *
 * It exists so internal linking is a component rather than a habit: a page adds
 * one of these and gets descriptive anchor text, a real heading above it and a
 * `<nav>` landmark, instead of a paragraph with "click here" buried in it.
 *
 * `tone` covers the two backgrounds the public site uses - the brand-tinted
 * marketing pages and the slate success-story pages - so the block does not have
 * to be restyled at each call site.
 */
export default function RelatedLinks({
  eyebrow,
  heading,
  intro,
  links,
  columns = 3,
  tone = "brand",
}: {
  eyebrow?: string;
  heading: string;
  intro?: string;
  links: RelatedLink[];
  columns?: 2 | 3;
  tone?: "brand" | "slate";
}) {
  if (!links.length) return null;

  const slate = tone === "slate";
  const border = slate ? "border-slate-200" : "border-brand/10";
  const hoverBorder = slate ? "hover:border-brand/40" : "hover:border-brand/30";
  const labelColor = slate ? "text-slate-950" : "text-brand-900";
  const detailColor = slate ? "text-slate-600" : "text-brand-900/65";

  return (
    <section className={`relative ${slate ? "bg-[#f7f8fb]" : "bg-white"} px-4 py-14 sm:px-6 lg:px-8 lg:py-16`}>
      <div className="mx-auto max-w-7xl">
        <nav aria-label={heading}>
          {eyebrow ? (
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">
              {eyebrow}
            </p>
          ) : null}
          <h2 className={`mt-4 text-2xl font-black leading-tight ${labelColor} sm:text-3xl`}>{heading}</h2>
          {intro ? <p className={`mt-3 max-w-3xl text-sm leading-7 ${detailColor}`}>{intro}</p> : null}

          <ul className={`mt-7 grid gap-3 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}>
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`group flex h-full flex-col rounded-xl border ${border} bg-white px-4 py-4 shadow-sm shadow-brand-900/5 transition hover:-translate-y-0.5 ${hoverBorder} hover:bg-brand-50`}
                >
                  <span className={`flex items-center justify-between gap-2 text-sm font-black ${labelColor} group-hover:text-brand`}>
                    {link.label}
                    <ArrowRight size={15} className="shrink-0 text-brand transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                  <span className={`mt-1.5 text-xs leading-5 ${detailColor}`}>{link.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
