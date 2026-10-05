import type { Block } from "@/lib/blog/types";

type Heading = Extract<Block, { type: "h2" | "h3" }>;

/**
 * Jump links to each section. Plain anchors, so it works without JavaScript and
 * Google can offer the sections as "jump to" links under the result.
 */
export default function TableOfContents({ headings }: { headings: Heading[] }) {
  if (headings.length < 3) return null;
  return (
    <nav aria-label="In this guide" className="rounded-2xl border border-brand/10 bg-brand-50/60 p-5">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-900/70">In this guide</p>
      <ol className="mt-3 space-y-1.5 text-sm">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.type === "h3" ? "pl-4" : ""}>
            <a href={`#${heading.id}`} className={`leading-6 transition hover:text-brand hover:underline ${heading.type === "h2" ? "font-bold text-brand-900" : "text-brand-900/70"}`}>
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
