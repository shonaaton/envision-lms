"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Eye,
  Lightbulb,
  Lock,
  Pause,
  Play,
  Repeat2,
  Target,
} from "lucide-react";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";
import RichText from "@/components/openings/RichText";
import { answersQuiz, type ChapterFrame } from "@/lib/openings/engine";
import type { ArrowColor, OpeningArrow } from "@/lib/openings/types";
import type { ChapterView } from "@/lib/openings/views";

const ARROW_COLORS: Record<ArrowColor, string> = {
  green: "rgba(21, 128, 61, 0.82)",
  red: "rgba(220, 38, 38, 0.82)",
  blue: "rgba(37, 99, 235, 0.82)",
  yellow: "rgba(202, 138, 4, 0.88)",
};

const RING_COLORS: Record<ArrowColor, string> = {
  green: "rgba(21, 128, 61, 0.9)",
  red: "rgba(220, 38, 38, 0.9)",
  blue: "rgba(37, 99, 235, 0.9)",
  yellow: "rgba(234, 179, 8, 0.95)",
};

const LAST_MOVE = "rgba(253, 231, 90, 0.5)";
const AUTOPLAY_MS = 4000;

export type OpeningPlayerLinks = {
  /** Where "Next chapter" goes, when the student may open it. */
  next?: string;
  prev?: string;
  /** Shown instead of `next` when the next chapter is locked. */
  unlock?: { href: string; label: string };
  /** The opening's overview page. */
  overview?: string;
};

type QuizState = { solved: boolean; revealed: boolean; feedback?: { tone: "good" | "bad" | "hint"; text: string } };

function squareStyles(frame: ChapterFrame | undefined, showAnswer: boolean, hoverSquare: string | null, selected: string | null) {
  const styles: Record<string, CSSProperties> = {};
  if (!frame) return styles;
  if (showAnswer && frame.move) {
    styles[frame.move.from] = { background: LAST_MOVE };
    styles[frame.move.to] = { background: LAST_MOVE };
  }
  if (showAnswer) {
    for (const [square, color = "yellow"] of frame.highlights) {
      styles[square] = { ...styles[square], boxShadow: `inset 0 0 0 4px ${RING_COLORS[color]}` };
    }
  }
  if (selected) styles[selected] = { ...styles[selected], background: "rgba(90, 19, 114, 0.35)" };
  if (hoverSquare) styles[hoverSquare] = { ...styles[hoverSquare], background: "rgba(234, 179, 8, 0.55)" };
  return styles;
}

function boardArrows(arrows: OpeningArrow[]) {
  return arrows.map(([from, to, color = "green"]) => [from, to, ARROW_COLORS[color]] as [any, any, string]);
}

export default function OpeningPlayer({
  view,
  initialStep = 0,
  saveProgress = false,
  links = {},
  viewportBottomReserve = 24,
  viewportHeightOffset,
}: {
  view: ChapterView;
  initialStep?: number;
  /** Post the step reached to /api/openings/progress. Off for logged-out previews. */
  saveProgress?: boolean;
  links?: OpeningPlayerLinks;
  /** For a player near the top of the page: fit the board above this many pixels. */
  viewportBottomReserve?: number;
  /**
   * For a player far down a long page, where the space above it says nothing
   * about how much room it gets once scrolled to: the board is at most the
   * viewport height minus this. Overrides viewportBottomReserve.
   */
  viewportHeightOffset?: number;
}) {
  const frames = view.frames;
  const last = frames.length - 1;
  const [step, setStep] = useState(Math.min(Math.max(0, initialStep), Math.max(0, last)));
  const [orientation, setOrientation] = useState<"white" | "black">(view.opening.side);
  const [autoplay, setAutoplay] = useState(false);
  const [hoverSquare, setHoverSquare] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // A quiz the student already passed stays solved when they step back over it.
  // Quizzes before the resume point count as seen.
  const [quizzes, setQuizzes] = useState<Record<number, QuizState>>(() => {
    const seen: Record<number, QuizState> = {};
    frames.forEach((frame, index) => {
      if (frame.quiz && index < initialStep) seen[index] = { solved: true, revealed: true };
    });
    return seen;
  });

  const frame = frames[step];
  const quiz = frame?.quiz ? quizzes[step] ?? { solved: false, revealed: false } : null;
  const quizOpen = Boolean(frame?.quiz && !quiz?.solved && !quiz?.revealed);
  const position = quizOpen ? frame!.quiz!.beforeFen : frame?.fen ?? view.startFen;

  const go = useCallback(
    (target: number) => {
      setSelected(null);
      setHoverSquare(null);
      setStep(Math.min(Math.max(0, target), last));
    },
    [last]
  );

  const reveal = useCallback(() => {
    if (!frame?.quiz) return;
    setQuizzes((current) => ({
      ...current,
      [step]: { solved: current[step]?.solved ?? false, revealed: true, feedback: { tone: "hint", text: `The answer is ${frame.move?.san}.` } },
    }));
  }, [frame, step]);

  // "Next" on an open quiz shows the answer first, so nobody is stuck on a question.
  const next = useCallback(() => {
    if (quizOpen) {
      reveal();
      return;
    }
    go(step + 1);
  }, [go, quizOpen, reveal, step]);

  const tryMove = useCallback(
    (from: string, to: string) => {
      if (!quizOpen || !frame?.quiz) return false;
      const game = new Chess(frame.quiz.beforeFen);
      let san: string;
      try {
        const played: any = game.move({ from, to, promotion: "q" });
        if (!played) return false;
        san = String(played.san);
      } catch {
        return false;
      }
      setSelected(null);
      if (answersQuiz(frame, san)) {
        setQuizzes((current) => ({ ...current, [step]: { solved: true, revealed: false, feedback: { tone: "good", text: `${san} is right!` } } }));
        return true;
      }
      setQuizzes((current) => ({
        ...current,
        [step]: {
          solved: false,
          revealed: false,
          feedback: { tone: "bad", text: `${san} is legal, but not the move we're looking for.${frame.quiz?.hint ? " Try the hint." : " Try again."}` },
        },
      }));
      return false;
    },
    [frame, quizOpen, step]
  );

  const sideToMove = (position.split(" ")[1] === "b" ? "b" : "w") as "w" | "b";

  function onSquareClick(square: string) {
    if (!quizOpen) return;
    const game = new Chess(position);
    const piece = game.get(square as any);
    if (piece && piece.color === sideToMove) {
      setSelected(square === selected ? null : square);
      return;
    }
    if (selected) tryMove(selected, square);
  }

  // Keyboard: arrows step, Home/End jump.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(step - 1);
      } else if (event.key === "Home") {
        go(0);
      } else if (event.key === "End") {
        go(last);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, last, next, step]);

  // Auto-play stops at an open quiz and at the end.
  useEffect(() => {
    if (!autoplay) return;
    if (quizOpen || step >= last) {
      setAutoplay(false);
      return;
    }
    const timer = window.setTimeout(() => go(step + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, go, last, quizOpen, step]);

  // Progress: saved a moment after the student settles on a step, at once on the last one.
  const savedRef = useRef(-1);
  useEffect(() => {
    if (!saveProgress || step <= savedRef.current) return;
    const send = () => {
      savedRef.current = step;
      fetch("/api/openings/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ opening: view.opening.slug, chapter: view.chapter.slug, step, completed: step === last }),
      }).catch(() => undefined);
    };
    if (step === last) {
      send();
      return;
    }
    const timer = window.setTimeout(send, 800);
    return () => window.clearTimeout(timer);
  }, [last, saveProgress, step, view.chapter.slug, view.opening.slug]);

  const shownMoves = useMemo(() => {
    const list: { label: string; index: number | null }[] = view.setup.map((move) => ({ label: move.label, index: null }));
    frames.forEach((item, index) => {
      if (!item.move || index > step) return;
      if (index === step && quizOpen) return;
      list.push({ label: item.move.label, index });
    });
    return list;
  }, [frames, quizOpen, step, view.setup]);

  if (!frame) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">This chapter has no steps yet.</div>;
  }

  const showMarks = !quizOpen;
  const progress = last > 0 ? Math.round((step / last) * 100) : 100;
  // An open quiz shows the name from before the answer: the name after it would give it away.
  const openingName = quizOpen ? frames[step - 1]?.opening : frame.opening;

  // On a phone the controls sit right under the board; on a wide screen, in the side panel.
  const controls = (
    <div className="flex items-center justify-between gap-1">
      <ControlButton label="First step" onClick={() => go(0)} disabled={step === 0}>
        <ChevronFirst size={18} />
      </ControlButton>
      <ControlButton label="Previous step" onClick={() => go(step - 1)} disabled={step === 0}>
        <ChevronLeft size={18} />
      </ControlButton>
      <ControlButton label={autoplay ? "Pause" : "Auto-play"} onClick={() => setAutoplay((value) => !value)} disabled={step === last || quizOpen}>
        {autoplay ? <Pause size={18} /> : <Play size={18} />}
      </ControlButton>
      <button
        type="button"
        onClick={next}
        disabled={step === last && !quizOpen}
        className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {quizOpen ? "Show answer" : "Next"} <ChevronRight size={18} aria-hidden="true" />
      </button>
      <ControlButton label="Last step" onClick={() => go(last)} disabled={step === last}>
        <ChevronLast size={18} />
      </ControlButton>
      <ControlButton label="Flip board" onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))}>
        <Repeat2 size={18} />
      </ControlButton>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
      <div className="min-w-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-brand/5 sm:p-4">
          <AssignmentChessboard
            id={`opening-${view.opening.slug}-${view.chapter.slug}`}
            maxWidth={640}
            {...(viewportHeightOffset ? { viewportHeightOffset } : { viewportBottomReserve })}
            position={position}
            boardOrientation={orientation}
            arePiecesDraggable={quizOpen}
            isDraggablePiece={({ piece }) => quizOpen && piece[0] === sideToMove}
            onPieceDrop={(from, to) => tryMove(from, to)}
            onSquareClick={(square) => onSquareClick(square)}
            customArrows={showMarks ? boardArrows(frame.arrows) : []}
            customSquareStyles={squareStyles(frame, showMarks, hoverSquare, selected)}
            animationDuration={250}
            areArrowsAllowed={false}
            customDarkSquareStyle={{ backgroundColor: "#8f6aa3" }}
            customLightSquareStyle={{ backgroundColor: "#f3eaf7" }}
          />
          {view.error ? (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Content error: {view.error}</p>
          ) : null}
        </div>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm shadow-brand/5 lg:hidden">{controls}</div>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand/5">
          <div className="flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand">
            <span>
              Chapter {view.chapter.number} of {view.chapter.total}
            </span>
            <span className="text-slate-500">
              Step {step + 1} / {frames.length}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-black leading-tight text-slate-950">{view.chapter.title}</h2>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {openingName ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{openingName.eco}</span>
              <span className="font-semibold">{openingName.name}</span>
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand/5" aria-live="polite">
          {quizOpen ? (
            <div>
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">
                <Target size={14} aria-hidden="true" /> Your move · {sideToMove === "w" ? "White" : "Black"} to play
              </p>
              <p className="mt-2 text-base font-bold leading-6 text-slate-950">{frame.quiz!.prompt}</p>
              <p className="mt-1 text-xs text-slate-500">Drag the piece, or tap it and then tap its square.</p>
              {quiz?.feedback ? (
                <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${quiz.feedback.tone === "bad" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                  {quiz.feedback.text}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {frame.quiz!.hint ? (
                  <button
                    type="button"
                    onClick={() =>
                      setQuizzes((current) => ({ ...current, [step]: { solved: false, revealed: false, feedback: { tone: "hint", text: frame.quiz!.hint! } } }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                  >
                    <Lightbulb size={14} aria-hidden="true" /> Hint
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={reveal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Eye size={14} aria-hidden="true" /> Show answer
                </button>
              </div>
            </div>
          ) : (
            <div>
              {quiz?.feedback && frame.quiz ? (
                <p
                  className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${quiz.solved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                >
                  {quiz.solved ? <CheckCircle2 size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />} {quiz.feedback.text}
                </p>
              ) : null}
              {frame.move && !frame.quiz && !frame.title ? (
                <p className="mb-1 font-mono text-sm font-black text-brand">{frame.move.label}</p>
              ) : null}
              {frame.title ? <h3 className="text-base font-black leading-6 text-slate-950">{frame.title}</h3> : null}
              <RichText text={frame.text} onSquareHover={setHoverSquare} className="mt-2 text-sm leading-6 text-slate-700" />
              {frame.points?.length ? (
                <ul className="mt-3 space-y-2">
                  {frame.points.map((point) => (
                    <li key={point} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {step === last && !quizOpen ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="flex items-center gap-2 text-sm font-black text-emerald-700">
                <CheckCircle2 size={16} aria-hidden="true" /> Chapter complete
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {links.next ? (
                  <Link href={links.next} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white hover:bg-brand-700">
                    Next: {view.next?.title} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : links.unlock ? (
                  <Link href={links.unlock.href} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white hover:bg-brand-700">
                    <Lock size={15} aria-hidden="true" /> {links.unlock.label}
                  </Link>
                ) : null}
                {links.overview ? (
                  <Link href={links.overview} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    All chapters
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm shadow-brand/5 lg:block">{controls}</div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand/5">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Moves</p>
          {shownMoves.length ? (
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {shownMoves.map((move, index) =>
                move.index === null ? (
                  <li key={`setup-${index}`} className="rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-slate-400" title="Played before this chapter">
                    {move.label}
                  </li>
                ) : (
                  <li key={`move-${move.index}`}>
                    <button
                      type="button"
                      onClick={() => go(move.index!)}
                      className={`rounded-md px-2 py-1 font-mono text-xs font-bold transition ${
                        move.index === step ? "bg-brand text-white" : "bg-brand-50 text-brand hover:bg-brand-100"
                      }`}
                    >
                      {move.label}
                    </button>
                  </li>
                )
              )}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-slate-500">The moves appear here as you step through the chapter.</p>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold">
            {links.prev ? (
              <Link href={links.prev} className="inline-flex items-center gap-1 text-slate-500 hover:text-brand">
                <ArrowLeft size={14} aria-hidden="true" /> {view.prev?.title}
              </Link>
            ) : (
              <span />
            )}
            <span className="hidden text-slate-400 sm:inline">← → keys step through</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ControlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-brand-50 hover:text-brand disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
