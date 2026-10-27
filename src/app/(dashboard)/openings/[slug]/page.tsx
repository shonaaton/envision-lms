import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, PlayCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { ChessDiagramDefs } from "@/components/blog/ChessDiagram";
import { ChapterList, HistoryAndIdeas, OpeningChips, OpeningThumb, PriceTag } from "@/components/openings/OpeningParts";
import { canOpenChapter, openingAccessFor } from "@/lib/openings/access";
import { getOpening } from "@/lib/openings/content";
import { getOpeningProgress } from "@/lib/openings/progress";
import { openingOverview, previewChapter } from "@/lib/openings/views";

export const dynamic = "force-dynamic";

export default async function OpeningOverviewPage({ params, searchParams }: { params: { slug: string }; searchParams: { locked?: string } }) {
  const opening = getOpening(params.slug);
  if (!opening) notFound();
  const session = await auth();
  const user = session?.user as any;
  const [access, progress] = await Promise.all([openingAccessFor(user, opening.slug), getOpeningProgress(user?.id, opening.slug)]);
  const overview = openingOverview(opening);
  const chapterProgress = progress[opening.slug] || {};
  const firstOpen =
    overview.chapters.find((chapter) => canOpenChapter(access, chapter) && !chapterProgress[chapter.slug]?.completed) ??
    overview.chapters.find((chapter) => canOpenChapter(access, chapter)) ??
    previewChapter(opening);

  return (
    <div className="space-y-4">
      <ChessDiagramDefs fens={[overview.fen]} />
      <Link href="/openings" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand">
        <ArrowLeft size={14} aria-hidden="true" /> All openings
      </Link>

      {searchParams.locked ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <Lock size={16} aria-hidden="true" /> That chapter is part of the full course. Unlock the opening to open it.
        </p>
      ) : null}

      <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-brand/5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
        <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-lg shadow-md shadow-brand-900/10">
          <OpeningThumb card={overview} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">Chess Openings</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">{overview.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{overview.tagline}</p>
          <div className="mt-3">
            <OpeningChips card={overview} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/openings/${opening.slug}/${firstOpen.slug}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
            >
              <PlayCircle size={16} aria-hidden="true" /> {access.full ? "Continue" : "Start the free chapter"}
            </Link>
            {access.full ? null : (
              <button
                type="button"
                disabled
                title="Buying openings opens soon"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 opacity-80"
              >
                <Lock size={15} aria-hidden="true" /> Unlock for <PriceTag /> · opens soon
              </button>
            )}
          </div>
        </div>
      </section>

      <HistoryAndIdeas overview={overview} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-brand/5">
        <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">Chapters</h2>
        <div className="mt-3">
          <ChapterList
            chapters={overview.chapters}
            progress={chapterProgress}
            isOpen={(chapter) => canOpenChapter(access, chapter)}
            hrefFor={(chapter) => (canOpenChapter(access, chapter) ? `/openings/${opening.slug}/${chapter.slug}` : null)}
          />
        </div>
      </section>
    </div>
  );
}
