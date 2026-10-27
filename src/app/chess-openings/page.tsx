import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Eye, ListChecks, Target } from "lucide-react";
import { ChessDiagramDefs } from "@/components/blog/ChessDiagram";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { OpeningChips, OpeningThumb, PriceTag } from "@/components/openings/OpeningParts";
import { demoLink } from "@/lib/internalLinks";
import { OPENINGS } from "@/lib/openings/content";
import { OPENINGS_PUBLIC_PATH as OPENINGS_PATH, publicOpeningHref } from "@/lib/openings/paths";
import { OPENINGS_ON_SALE } from "@/lib/openings/pricing";
import { openingCard } from "@/lib/openings/views";
import { breadcrumbSchema, publicMetadata } from "@/lib/seo";

const title = "Chess Openings, Explained Move by Move | Envision";
const description =
  "Learn chess openings the way coaches teach them: the history, the key ideas and an interactive board that walks you through every move. First chapter free.";

export const metadata: Metadata = publicMetadata({
  path: OPENINGS_PATH,
  title,
  description,
  keywords: ["chess openings", "learn chess openings", "chess openings for beginners", "italian game", "chess opening course"],
  noindex: !OPENINGS_ON_SALE,
});

const features = [
  { icon: Eye, title: "Move by move", text: "Every move explained on a live board, with arrows showing what it attacks and defends." },
  { icon: Target, title: "Find the move", text: "Short checks along the way: you play the key move yourself before we explain it." },
  { icon: ListChecks, title: "Ideas, not memory", text: "The plans behind the opening and a little of its history, so you know what to do when your opponent leaves the book." },
];

export default function ChessOpeningsPage() {
  const cards = OPENINGS.map(openingCard);
  const schema = [breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Chess Openings", path: OPENINGS_PATH }])];

  return (
    <main className="landing-compact min-h-screen bg-white text-brand-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <MarketingHeader demoHref={demoLink.href} />
      <ChessDiagramDefs fens={cards.map((card) => card.fen)} />

      <header className="relative isolate overflow-hidden bg-[#f5edf8]">
        <div className="absolute inset-0 bg-[linear-gradient(118deg,#ffffff_0%,#f5edf8_55%,#e8d4f0_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-brand-900/60">
            <Link href="/" className="hover:text-brand">Home</Link>
            <span>/</span>
            <span className="text-brand">Chess Openings</span>
          </nav>
          <p className="inline-flex rounded-full bg-accent px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-900 shadow-sm shadow-accent-600/30">
            Interactive opening courses
          </p>
          <h1 className="mt-4 max-w-3xl text-[2rem] font-black leading-[1.08] text-brand-900 sm:text-[2.6rem] lg:text-[3rem]">
            Chess openings, explained move by move
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-brand-900/75 sm:text-lg sm:leading-8">
            Pick an opening and play through it on the board with a coach&apos;s explanation at every move. The first chapter of every opening is free; the full
            course is <PriceTag className="text-brand-900" />.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {features.map(({ icon: Icon, title: featureTitle, text }) => (
              <li key={featureTitle} className="rounded-2xl border border-brand/10 bg-white/80 p-4 shadow-sm shadow-brand-900/5">
                <Icon size={20} className="text-brand" aria-hidden="true" />
                <p className="mt-2 text-sm font-black text-brand-900">{featureTitle}</p>
                <p className="mt-1 text-sm leading-6 text-brand-900/70">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14" aria-labelledby="openings-heading">
        <h2 id="openings-heading" className="text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
          Choose an opening
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-brand-900/70">New openings are added one at a time. Each one is a short course you can finish in an evening.</p>
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.slug}
              href={publicOpeningHref(card.slug)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-brand-900/10"
            >
              <div className="bg-brand-50 p-4">
                <div className="mx-auto max-w-[240px] overflow-hidden rounded-lg shadow-md shadow-brand-900/10">
                  <OpeningThumb card={card} />
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-black text-brand-900 group-hover:text-brand">{card.name}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-brand-900/70">{card.tagline}</p>
                <div className="mt-3">
                  <OpeningChips card={card} />
                </div>
                <span className="mt-4 flex items-center justify-between text-xs font-bold">
                  <PriceTag className="text-brand-900" />
                  <span className="inline-flex items-center gap-1 text-brand">
                    Try it free <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
