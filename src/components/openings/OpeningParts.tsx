import Link from "next/link";
import { CheckCircle2, Lock, PlayCircle, Sparkles } from "lucide-react";
import { BoardSvg } from "@/components/blog/ChessDiagram";
import RichText from "@/components/openings/RichText";
import { OPENING_PRICE_PAISE, OPENING_TOTAL_PAISE, rupees } from "@/lib/openings/pricing";
import type { ChapterProgress } from "@/lib/openings/progress";
import type { ChapterOutline, OpeningCard, OpeningOverview } from "@/lib/openings/views";

/**
 * Pieces shared by the portal pages (/openings) and the public sales pages
 * (/chess-openings). Server components: nothing here needs the browser except
 * RichText's square chips, which hydrate on their own.
 */

const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

export function OpeningThumb({ card, className = "" }: { card: Pick<OpeningCard, "fen" | "side">; className?: string }) {
  return <BoardSvg diagram={{ fen: card.fen, alt: "", flipped: card.side === "black" }} decorative className={className} />;
}

export function OpeningChips({ card }: { card: Pick<OpeningCard, "side" | "level" | "eco" | "chapters"> }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${card.side === "white" ? "border-slate-300 bg-white text-slate-800" : "border-slate-800 bg-slate-900 text-white"}`}>
        <span aria-hidden="true" className={`h-2 w-2 rounded-full border ${card.side === "white" ? "border-slate-400 bg-white" : "border-white bg-slate-900"}`} />
        For {card.side === "white" ? "White" : "Black"}
      </span>
      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand">{LEVEL_LABEL[card.level]}</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
        {card.chapters.length} chapter{card.chapters.length === 1 ? "" : "s"}
      </span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-slate-600">{card.eco[0]}{card.eco.length > 1 ? `–${card.eco[card.eco.length - 1]}` : ""}</span>
    </div>
  );
}

export function PriceTag({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-black">{rupees(OPENING_PRICE_PAISE)}</span>
      <span className="text-[0.85em] font-semibold opacity-75"> + GST = {rupees(OPENING_TOTAL_PAISE)}</span>
    </span>
  );
}

export function HistoryAndIdeas({ overview }: { overview: OpeningOverview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-brand/5">
        <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">A little history</h2>
        <RichText text={overview.history.join("\n\n")} className="mt-3 text-sm leading-7 text-slate-700" />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-brand/5">
        <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">Key ideas</h2>
        <ul className="mt-3 space-y-3">
          {overview.keyIdeas.map((idea) => (
            <li key={idea} className="flex gap-2.5 text-sm leading-6 text-slate-700">
              <Sparkles size={16} className="mt-1 shrink-0 text-amber-500" aria-hidden="true" />
              <RichText text={idea} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ChapterList({
  chapters,
  hrefFor,
  isOpen,
  progress = {},
}: {
  chapters: ChapterOutline[];
  /** Null when the chapter has no page to link to (locked). */
  hrefFor: (chapter: ChapterOutline) => string | null;
  isOpen: (chapter: ChapterOutline) => boolean;
  progress?: Record<string, ChapterProgress>;
}) {
  return (
    <ol className="space-y-2.5">
      {chapters.map((chapter, index) => {
        const open = isOpen(chapter);
        const href = hrefFor(chapter);
        const done = progress[chapter.slug]?.completed;
        const started = !done && (progress[chapter.slug]?.lastStep ?? 0) > 0;
        const body = (
          <>
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${
                done ? "bg-emerald-100 text-emerald-700" : open ? "bg-brand text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <CheckCircle2 size={18} aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-black ${open ? "text-slate-950" : "text-slate-500"}`}>{chapter.title}</span>
                {chapter.preview ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">Free preview</span> : null}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">{chapter.summary}</span>
            </span>
            <span className="shrink-0 text-xs font-bold">
              {open ? (
                <span className="inline-flex items-center gap-1 text-brand">
                  <PlayCircle size={16} aria-hidden="true" /> {done ? "Replay" : started ? "Resume" : "Start"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <Lock size={14} aria-hidden="true" /> Locked
                </span>
              )}
            </span>
          </>
        );
        const className = `flex items-center gap-3 rounded-2xl border p-3.5 transition ${
          open ? "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md hover:shadow-brand/10" : "border-slate-200 bg-slate-50"
        }`;
        return (
          <li key={chapter.slug}>
            {href ? (
              <Link href={href} className={className}>
                {body}
              </Link>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
