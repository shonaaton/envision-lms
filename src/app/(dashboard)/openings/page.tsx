import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Crown, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { ChessDiagramDefs } from "@/components/blog/ChessDiagram";
import { EmptyState, PageHeader } from "@/components/common/PageHeader";
import { OpeningChips, OpeningThumb, PriceTag } from "@/components/openings/OpeningParts";
import { openingAccessFor } from "@/lib/openings/access";
import { OPENINGS } from "@/lib/openings/content";
import { getOpeningProgress } from "@/lib/openings/progress";
import { openingCard } from "@/lib/openings/views";

export const dynamic = "force-dynamic";

export default async function OpeningsLibraryPage() {
  const session = await auth();
  const user = session?.user as any;
  const progress = await getOpeningProgress(user?.id);
  const cards = await Promise.all(
    OPENINGS.map(async (opening) => ({ card: openingCard(opening), access: await openingAccessFor(user, opening.slug) }))
  );

  return (
    <div className="space-y-4">
      <ChessDiagramDefs fens={cards.map(({ card }) => card.fen)} />
      <PageHeader
        eyebrow="Chess Openings"
        title="Learn openings move by move"
        subtitle="Each opening comes with its history, the ideas behind it, and a guided walkthrough on the board with short 'find the move' checks. The first chapter of every opening is free."
        icon={BookOpen as any}
      />

      {cards.length === 0 ? (
        <EmptyState title="Openings are being prepared." description="The first openings will appear here soon." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ card, access }) => {
            const chapterProgress = progress[card.slug] || {};
            const done = card.chapters.filter((chapter) => chapterProgress[chapter.slug]?.completed).length;
            return (
              <Link
                key={card.slug}
                href={`/openings/${card.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-brand/5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10"
              >
                <div className="bg-brand-50 p-4">
                  <div className="mx-auto max-w-[220px] overflow-hidden rounded-lg shadow-md shadow-brand-900/10">
                    <OpeningThumb card={card} />
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="text-lg font-black text-slate-950 group-hover:text-brand">{card.name}</h2>
                  <p className="mt-1 flex-1 text-sm leading-6 text-slate-600">{card.tagline}</p>
                  <div className="mt-3">
                    <OpeningChips card={card} />
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label={`${done} of ${card.chapters.length} chapters complete`}>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${card.chapters.length ? (done / card.chapters.length) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold">
                    <span className="text-slate-500">
                      {done} / {card.chapters.length} chapters done
                    </span>
                    {access.reason === "staff" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
                        <Crown size={12} aria-hidden="true" /> Staff preview
                      </span>
                    ) : access.full ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        <CheckCircle2 size={12} aria-hidden="true" /> Unlocked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
                        <Lock size={12} aria-hidden="true" /> <PriceTag />
                      </span>
                    )}
                  </div>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand">
                    Open course <ArrowRight size={15} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
