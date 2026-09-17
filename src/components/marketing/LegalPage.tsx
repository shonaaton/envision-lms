import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";

/**
 * Shared chrome and typography for the legal routes.
 *
 * These pages used to redirect to the WordPress site. The LMS serves the whole
 * domain now, so the text lives here. The project has no typography plugin, so
 * the prose rules are applied as descendant utilities on one wrapper rather than
 * repeated on every element in the (very long) policy bodies.
 */

const prose = [
  "[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:text-lg [&_h2]:font-black [&_h2]:text-slate-950 sm:[&_h2]:text-xl",
  "[&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-950",
  "[&_p]:mt-4 [&_p]:text-[15px] [&_p]:leading-7 [&_p]:text-slate-600",
  "[&_ul]:mt-4 [&_ul]:list-[square] [&_ul]:space-y-2 [&_ul]:pl-5",
  "[&_li]:text-[15px] [&_li]:leading-7 [&_li]:text-slate-600",
  "[&_ul_ul]:mt-2 [&_ul_ul]:list-[circle] [&_ul_ul]:pl-5",
  "[&_strong]:font-bold [&_strong]:text-slate-800",
  "[&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-words",
  "[&_table]:mt-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
  "[&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:p-3 [&_th]:text-[13px] [&_th]:font-bold [&_th]:text-slate-800",
  "[&_td]:border [&_td]:border-slate-200 [&_td]:p-3 [&_td]:align-top [&_td]:text-[14px] [&_td]:leading-6 [&_td]:text-slate-600",
].join(" ");

export function InShort({ children }: { children: ReactNode }) {
  return (
    <p className="!mt-4 rounded-lg border-l-4 border-accent bg-accent/10 px-4 py-3 !text-slate-700">
      <strong>In Short:</strong> <em>{children}</em>
    </p>
  );
}

export function TableOfContents({ items }: { items: [id: string, label: string][] }) {
  return (
    <nav aria-label="Table of contents" className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <ol className="space-y-2">
        {items.map(([id, label], index) => (
          <li key={id} className="text-[15px] leading-6">
            <a href={`#${id}`} className="font-semibold text-brand underline underline-offset-2">
              {index + 1}. {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <>
      <MarketingHeader demoHref="/register" />
      <main className="bg-[#f7f8fb] px-4 py-14 text-slate-950 sm:px-6 lg:px-8">
        <article className={`mx-auto max-w-3xl ${prose}`}>
          <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
          <p className="!mt-2 !text-sm !text-slate-500">Last updated {lastUpdated}</p>
          {children}
        </article>
      </main>
      <MarketingFooter />
    </>
  );
}
