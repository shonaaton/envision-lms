"use client";

import { useRef, useState } from "react";
import { Chess } from "chess.js";
import { Check, ChevronLeft, ChevronRight, CircleHelp, Lightbulb, RotateCcw, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";
import type { LearningExerciseDetail } from "@/lib/learning/service";

const boardDark = { backgroundColor: "#7a4a2e" };
const boardLight = { backgroundColor: "#f4dfb8" };

export default function LearningExercisePlayer({ exercise }: { exercise: LearningExerciseDetail }) {
  const router = useRouter();
  const gameRef = useRef<Chess>(createGame(exercise.startingPosition));
  const [fen, setFen] = useState(gameRef.current.fen());
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "idle" | "success" | "error"; text: string }>({ type: "idle", text: "Choose a piece to begin." });
  const [moveCount, setMoveCount] = useState(0);
  const [incorrectMoves, setIncorrectMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [submitted, setSubmitted] = useState(exercise.completed);
  const [saving, setSaving] = useState(false);
  const [showHint, setShowHint] = useState(false);

  function reset() {
    gameRef.current = createGame(exercise.startingPosition);
    setFen(gameRef.current.fen());
    setSelected(null);
    setMoveCount(0);
    setIncorrectMoves(0);
    setHintsUsed(0);
    setSubmitted(false);
    setShowHint(false);
    setFeedback({ type: "idle", text: "Choose a piece to begin." });
  }

  async function submit(completed: boolean, stars = 0) {
    setSaving(true);
    try {
      const response = await fetch("/api/learn/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, completed, stars, moveCount, incorrectMoves, hintsUsed }),
      });
      if (response.ok && completed) setSubmitted(true);
    } finally {
      setSaving(false);
    }
  }

  function finishMove() {
    const stars = incorrectMoves === 0 && hintsUsed === 0 ? 3 : incorrectMoves <= 1 ? 2 : 1;
    setSubmitted(true);
    setFeedback({ type: "success", text: exercise.successMessage });
    void submit(true, stars);
  }

  function tryMove(source: string, target: string) {
    const game = gameRef.current;
    try {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      setMoveCount((value) => value + 1);
      setFen(game.fen());
      setSelected(null);
      finishMove();
      return true;
    } catch {
      setIncorrectMoves((value) => value + 1);
      setSelected(null);
      setFeedback({ type: "error", text: exercise.failureMessage });
      return false;
    }
  }

  function onSquareClick(square: string) {
    if (submitted) return;
    const piece = gameRef.current.get(square as any);
    if (!selected) {
      if (piece && piece.color === gameRef.current.turn()) setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (!tryMove(selected, square) && piece && piece.color === gameRef.current.turn()) setSelected(square);
  }

  function undo() {
    if (submitted) return;
    gameRef.current.undo();
    setFen(gameRef.current.fen());
    setSelected(null);
    setFeedback({ type: "idle", text: "Move undone. Try another line." });
  }

  const questionOptions = exercise.goalConfig?.options || ["Rook", "Bishop", "Queen", "Knight"];
  const isQuestion = exercise.interactionMode === "MULTIPLE_CHOICE";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#24152d] p-3 shadow-2xl shadow-brand/20 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 px-1 text-white sm:mb-4 sm:px-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">Interactive board</p>
            <p className="mt-1 text-sm font-semibold text-white/75">{exercise.sideToMove === "black" ? "Black" : "White"} to move</p>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">{moveCount} move{moveCount === 1 ? "" : "s"}</div>
        </div>
        <div className="mx-auto w-full max-w-[760px] rounded-2xl bg-[#140c1b] p-2 shadow-inner sm:p-4">
          <AssignmentChessboard
            maxWidth={760}
            viewportHeightOffset={170}
            position={fen}
            boardOrientation={exercise.orientation}
            onPieceDrop={(source, target) => tryMove(source, target)}
            onSquareClick={onSquareClick as any}
            customDarkSquareStyle={boardDark}
            customLightSquareStyle={boardLight}
            customSquareStyles={selected ? { [selected]: { boxShadow: "inset 0 0 0 5px rgba(253,231,90,.95)" } } : undefined}
            arePiecesDraggable={!submitted && !isQuestion}
            coordinatesClassName="text-white/60"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 sm:px-2">
          <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-white/20"><RotateCcw size={16} /> Reset</button>
          <button type="button" onClick={undo} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-white/20"><Undo2 size={16} /> Undo</button>
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Your challenge</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{exercise.title}</h1>
            </div>
            <div className="rounded-2xl bg-accent/30 px-3 py-2 text-sm font-black text-brand">Level {exercise.difficulty}</div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{exercise.description}</p>

          {isQuestion ? (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start gap-2 text-sm font-bold text-slate-900"><CircleHelp size={18} className="mt-0.5 text-brand" /> {exercise.goalConfig?.prompt || "Choose the best answer."}</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {questionOptions.map((option: string) => <button key={option} type="button" onClick={() => { if (option === exercise.goalConfig?.correctOption) finishMove(); else { setIncorrectMoves((value) => value + 1); setFeedback({ type: "error", text: exercise.failureMessage }); } }} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-bold text-slate-700 transition hover:border-brand/40 hover:bg-brand-50">{option}</button>)}
              </div>
            </div>
          ) : null}

          <div className={`mt-5 flex items-start gap-3 rounded-2xl p-4 text-sm font-semibold ${feedback.type === "success" ? "bg-emerald-50 text-emerald-800" : feedback.type === "error" ? "bg-rose-50 text-rose-800" : "bg-brand-50 text-brand-900"}`}>
            {feedback.type === "success" ? <Check size={18} className="mt-0.5 shrink-0" /> : feedback.type === "error" ? <X size={18} className="mt-0.5 shrink-0" /> : <Lightbulb size={18} className="mt-0.5 shrink-0" />}
            <span>{feedback.text}</span>
          </div>

          {exercise.hints[0] ? <button type="button" onClick={() => { setShowHint(true); setHintsUsed((value) => value + 1); }} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand/15 px-3.5 py-2 text-sm font-bold text-brand transition hover:bg-brand-50"><Lightbulb size={16} /> Show hint</button> : null}
          {showHint && exercise.hints[0] ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">{exercise.hints[0].text}</p> : null}
        </div>

        {submitted ? <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><div className="text-lg font-black">Exercise complete</div><p className="mt-1 text-sm">{exercise.explanation}</p><div className="mt-4 flex flex-wrap gap-2"><Link href={`/learn/${exercise.lessonSlug}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-emerald-800"><ChevronLeft size={16} /> Lesson</Link>{exercise.nextExerciseStableKey ? <button type="button" disabled={saving} onClick={() => router.push(`/learn/${exercise.lessonSlug}/${exercise.nextExerciseStableKey}`)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-bold text-white disabled:opacity-60">Next exercise <ChevronRight size={16} /></button> : null}</div></div> : null}
      </aside>
    </div>
  );
}

function createGame(position: string) {
  try { return new Chess(position && position !== "start" ? position : undefined); } catch { return new Chess(); }
}
