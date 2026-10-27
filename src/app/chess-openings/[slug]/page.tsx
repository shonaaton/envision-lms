import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, PlayCircle } from "lucide-react";
import { ChessDiagramDefs } from "@/components/blog/ChessDiagram";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import OpeningPlayer from "@/components/openings/OpeningPlayer";
import { ChapterList, HistoryAndIdeas, OpeningChips, OpeningThumb, PriceTag } from "@/components/openings/OpeningParts";
import { demoLink } from "@/lib/internalLinks";
import { getOpening, OPENINGS } from "@/lib/openings/content";
import { OPENINGS_PUBLIC_PATH, publicOpeningHref } from "@/lib/openings/paths";
import { OPENING_TOTAL_PAISE, OPENINGS_ON_SALE, rupees } from "@/lib/openings/pricing";
import { chapterView, openingOverview, previewChapter } from "@/lib/openings/views";
import { absoluteUrl, breadcrumbSchema, organizationRef, publicMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return OPENINGS.map((opening) => ({ slug: opening.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const opening = getOpening(params.slug);
  if (!opening) return {};
  return publicMetadata({
    path: publicOpeningHref(opening.slug),
    title: `${opening.name}: Learn It Move by Move | Envision`,
    description: `${opening.tagline} History, key ideas and an interactive move-by-move walkthrough. First chapter free.`.slice(0, 160),
    keywords: [opening.name.toLowerCase(), `${opening.name.toLowerCase()} chess opening`, "chess openings", "learn chess openings"],
    noindex: !OPENINGS_ON_SALE,
  });
}

/**
 * The public sales page for one opening. Anyone can play the preview chapter
 * here without an account; the rest of the course lives in the portal at
 * /openings/<slug>. Only the preview chapter is resolved, so the paid chapters'
 * text never reaches this page.
 */
export default function PublicOpeningPage({ params }: { params: { slug: string } }) {
  const opening = getOpening(params.slug);
  if (!opening) notFound();
  const overview = openingOverview(opening);
  const preview = previewChapter(opening);
  const view = chapterView(opening, preview.slug)!;
  const url = absoluteUrl(publicOpeningHref(opening.slug));

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Course",
      "@id": `${url}#course`,
      name: `${opening.name} – chess opening course`,
      description: opening.tagline,
      url,
      provider: organizationRef,
      inLanguage: "en-IN",
      educationalLevel: overview.level,
      ...(OPENINGS_ON_SALE
        ? { offers: { "@type": "Offer", price: (OPENING_TOTAL_PAISE / 100).toFixed(2), priceCurrency: "INR", category: "Paid" } }
        : {}),
    },
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Chess Openings", path: OPENINGS_PUBLIC_PATH },
      { name: opening.name, path: publicOpeningHref(opening.slug) },
    ]),
  ];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <MarketingHeader demoHref={demoLink.href} />
      <ChessDiagramDefs fens={[overview.fen]} />

      <header className="relative isolate overflow-hidden bg-[#f5edf8]">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_55%,#e8d4f0_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_260px] md:items-center lg:px-8 lg:py-14">
          <div>
            <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-brand-900/60">
              <Link href="/" className="hover:text-brand">Home</Link>
              <span>/</span>
              <Link href={OPENINGS_PUBLIC_PATH} className="hover:text-brand">Chess Openings</Link>
              <span>/</span>
              <span className="text-brand">{opening.name}</span>
            </nav>
            <h1 className="text-[2rem] font-black leading-[1.08] text-brand-900 sm:text-[2.6rem] lg:text-[3rem]">{opening.name}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-brand-900/75 sm:text-lg sm:leading-8">{opening.tagline}</p>
            <div className="mt-4">
              <OpeningChips card={overview} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#preview" className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-black text-white shadow-lg shadow-brand-900/20 hover:bg-brand-700">
                <PlayCircle size={18} aria-hidden="true" /> Play the free chapter
              </a>
              <a href="#unlock" className="inline-flex items-center gap-2 rounded-xl border border-brand/20 bg-white px-5 py-3 text-sm font-bold text-brand-900 hover:border-brand/40">
                Full course · <PriceTag />
              </a>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-xl shadow-xl shadow-brand-900/15">
            <OpeningThumb card={overview} />
          </div>
        </div>
      </header>

      <section id="preview" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">Free chapter</p>
        <h2 className="mt-1 text-2xl font-black text-brand-900 sm:text-3xl">{preview.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-brand-900/70">{preview.summary} Use the arrow keys or the Next button to step through.</p>
        <div className="mt-6">
          <OpeningPlayer
            view={view}
            viewportHeightOffset={170}
            links={{ unlock: { href: "#unlock", label: `Get the full course · ${rupees(OPENING_TOTAL_PAISE)}` } }}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <HistoryAndIdeas overview={overview} />
      </section>

      <section id="unlock" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-14 sm:px-6 lg:px-8">
        <div className="grid gap-6 rounded-3xl border border-brand/10 bg-brand-50/60 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-2xl font-black text-brand-900">What&apos;s in the course</h2>
            <div className="mt-4">
              <ChapterList
                chapters={overview.chapters}
                isOpen={(chapter) => chapter.preview}
                hrefFor={(chapter) => (chapter.preview ? "#preview" : null)}
              />
            </div>
          </div>
          <div className="self-start rounded-2xl border border-brand/15 bg-white p-6 shadow-lg shadow-brand-900/5">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">Full course</p>
            <p className="mt-2 text-3xl text-brand-900">
              <PriceTag />
            </p>
            <p className="mt-1 text-xs text-brand-900/60">One-time payment. Yours to replay any time.</p>
            <ul className="mt-4 space-y-2 text-sm text-brand-900/80">
              <li>All {overview.chapters.length} chapters of the {opening.name}</li>
              <li>Move-by-move explanations with arrows on the board</li>
              <li>&ldquo;Find the move&rdquo; checks in every chapter</li>
              <li>Academy students: your first 3 openings are free</li>
            </ul>
            {OPENINGS_ON_SALE ? null : (
              <button
                type="button"
                disabled
                className="mt-5 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-brand/60 px-5 py-3 text-sm font-black text-white"
              >
                <Lock size={16} aria-hidden="true" /> Buying opens soon
              </button>
            )}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
