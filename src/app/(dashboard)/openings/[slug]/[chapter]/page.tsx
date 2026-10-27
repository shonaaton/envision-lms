import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import OpeningPlayer from "@/components/openings/OpeningPlayer";
import { canOpenChapter, openingAccessFor } from "@/lib/openings/access";
import { getOpening } from "@/lib/openings/content";
import { OPENING_TOTAL_PAISE, rupees } from "@/lib/openings/pricing";
import { getOpeningProgress } from "@/lib/openings/progress";
import { chapterView } from "@/lib/openings/views";

export const dynamic = "force-dynamic";

export default async function OpeningChapterPage({ params }: { params: { slug: string; chapter: string } }) {
  const opening = getOpening(params.slug);
  const chapter = opening?.chapters.find((item) => item.slug === params.chapter);
  if (!opening || !chapter) notFound();
  const session = await auth();
  const user = session?.user as any;
  const access = await openingAccessFor(user, opening.slug);
  // Decided here, before the chapter is resolved, so a locked chapter's text never leaves the server.
  if (!canOpenChapter(access, chapter)) redirect(`/openings/${opening.slug}?locked=1`);

  const view = chapterView(opening, chapter.slug)!;
  const progress = await getOpeningProgress(user?.id, opening.slug);
  const saved = progress[opening.slug]?.[chapter.slug];
  // A finished chapter replays from the start; an unfinished one resumes.
  const initialStep = saved && !saved.completed ? saved.lastStep : 0;
  const nextChapter = opening.chapters.find((item) => item.slug === view.next?.slug);
  const nextOpen = nextChapter ? canOpenChapter(access, nextChapter) : false;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/openings/${opening.slug}`} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand">
          <ArrowLeft size={14} aria-hidden="true" /> {opening.name}
        </Link>
      </div>
      <OpeningPlayer
        key={chapter.slug}
        view={view}
        initialStep={initialStep}
        saveProgress={Boolean(user?.id)}
        // Room under the board for the card padding and, on a phone, the controls.
        viewportBottomReserve={96}
        links={{
          overview: `/openings/${opening.slug}`,
          prev: view.prev ? `/openings/${opening.slug}/${view.prev.slug}` : undefined,
          next: nextChapter && nextOpen ? `/openings/${opening.slug}/${nextChapter.slug}` : undefined,
          unlock: nextChapter && !nextOpen ? { href: `/openings/${opening.slug}`, label: `Unlock the full course · ${rupees(OPENING_TOTAL_PAISE)}` } : undefined,
        }}
      />
    </div>
  );
}
