"use client";

import { useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, ChevronsLeft, CircleHelp, Flag, Lightbulb, MousePointerClick, RotateCcw, SkipBack, SkipForward, Target, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";
import {
  applyChoice,
  applyMove,
  applySquareSelection,
  buildDemoTimeline,
  choiceOptions,
  correctSquares,
  createSession,
  describeGoal,
  highlightSquares,
  informationKeyPoints,
  legalDestinations,
  parseMovementBoard,
  type LearningExerciseSpec,
  type LearningSessionState,
} from "@/lib/learning/engine";
import type { LearningExerciseDetail } from "@/lib/learning/service";

const boardDark = { backgroundColor: "#7a4a2e" };
const boardLight = { backgroundColor: "#f4dfb8" };

const selectedStyle = { boxShadow: "inset 0 0 0 5px rgba(253,231,90,.95)" };
const targetStyle = { boxShadow: "inset 0 0 0 4px rgba(16,185,129,.9)", backgroundColor: "rgba(16,185,129,.22)" };
const collectedStyle = { backgroundColor: "rgba(16,185,129,.42)" };
const obstacleStyle = { backgroundColor: "rgba(15,23,42,.62)" };
const destinationStyle = {
  background: "radial-gradient(circle, rgba(15,23,42,.32) 20%, transparent 22%)",
  borderRadius: "50%",
};
const lastMoveStyle = { backgroundColor: "rgba(253,231,90,.35)" };

const promotionPieces: Array<{ code: "q" | "r" | "b" | "n"; label: string }> = [
  { code: "q", label: "Queen" },
  { code: "r", label: "Rook" },
  { code: "b", label: "Bishop" },
  { code: "n", label: "Knight" },
];

type Feedback = { tone: "idle" | "success" | "error" | "progress"; text: string };

export default function LearningExercisePlayer({ exercise }: { exercise: LearningExerciseDetail }) {
  const router = useRouter();

  const spec: LearningExerciseSpec = useMemo(
    () => ({
      rulesMode: exercise.rulesMode as LearningExerciseSpec["rulesMode"],
      interactionMode: exercise.interactionMode as LearningExerciseSpec["interactionMode"],
      goalType: exercise.goalType,
      startingPosition: exercise.startingPosition,
      orientation: exercise.orientation,
      sideToMove: exercise.sideToMove,
      goalConfig: exercise.goalConfig,
      acceptedSolutions: exercise.acceptedSolutions,
      opponentScript: exercise.opponentScript,
      targets: exercise.targets,
      obstacles: exercise.obstacles,
      maxMoves: exercise.maxMoves,
      idealMoves: exercise.idealMoves,
    }),
    [exercise]
  );

  const [state, setState] = useState<LearningSessionState>(() => createSession(spec));
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ tone: "idle", text: describeGoal(spec) });
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [completed, setCompleted] = useState(exercise.completed);
  const [awardedStars, setAwardedStars] = useState(exercise.bestStars);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(Date.now());
  const saved = useRef(false);

  const isInformation = exercise.interactionMode === "INFORMATION";
  const isQuestion = !isInformation && (exercise.interactionMode === "MULTIPLE_CHOICE" || exercise.rulesMode === "QUESTION");
  const isSelectSquare = exercise.interactionMode === "SELECT_SQUARE";
  const isBoardMove = !isInformation && !isQuestion && !isSelectSquare;
  const finished = state.status === "solved";
  const options = useMemo(() => choiceOptions(spec), [spec]);
  const wantedSquares = useMemo(() => correctSquares(spec), [spec]);
  const keyPoints = useMemo(() => informationKeyPoints(spec), [spec]);
  const demo = useMemo(() => buildDemoTimeline(spec), [spec]);
  const [demoStep, setDemoStep] = useState(0);
  const demoCurrent = demo.steps[Math.min(demoStep, demo.steps.length - 1)];
  const hasDemo = demo.steps.length > 1;

  function reset() {
    setState(createSession(spec));
    setSelected(null);
    setPendingPromotion(null);
    setShowHint(false);
    setResetCount((value) => value + 1);
    setFeedback({ tone: "idle", text: describeGoal(spec) });
    saved.current = false;
  }

  async function save(next: LearningSessionState, stars: number) {
    if (saved.current) return;
    saved.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/learn/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: exercise.id,
          moves: next.studentMoves,
          selections: next.selectedSquares,
          choice: isQuestion ? next.selectedSquares[0] || "" : "",
          incorrectMoves: next.incorrectMoves,
          hintsUsed,
          resetCount,
          durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
          clientStars: stars,
        }),
      });
      if (!response.ok) {
        setFeedback({ tone: "error", text: "Solved, but your progress could not be saved. Check your connection." });
        saved.current = false;
        return;
      }
      const result = await response.json();
      setCompleted(Boolean(result.completed));
      setAwardedStars(Number(result.bestStars || stars));
    } catch {
      setFeedback({ tone: "error", text: "Solved, but your progress could not be saved. Check your connection." });
      saved.current = false;
    } finally {
      setSaving(false);
    }
  }

  function starsFor(next: LearningSessionState) {
    if (next.incorrectMoves === 0 && hintsUsed === 0 && resetCount === 0) return 3;
    if (next.incorrectMoves <= 1 && hintsUsed <= 1) return 2;
    return 1;
  }

  function settle(next: LearningSessionState, solved: boolean, message: string) {
    setState(next);
    setSelected(null);
    if (!solved) {
      setFeedback({ tone: next.status === "failed" ? "error" : "progress", text: message });
      return;
    }
    const stars = starsFor(next);
    setFeedback({ tone: "success", text: exercise.successMessage });
    void save(next, stars);
  }

  function acknowledgeSlide() {
    if (finished) return;
    const next: LearningSessionState = { ...state, status: "solved" };
    setState(next);
    setFeedback({ tone: "success", text: exercise.explanation || "Nice. On to the exercises." });
    void save(next, 0);
  }

  function isPromotionMove(from: string, to: string) {
    if (exercise.rulesMode !== "LEGAL_CHESS") return false;
    const board = parseMovementBoard(state.fen);
    const piece = board.get(from);
    if (!piece || piece.type !== "p") return false;
    return piece.color === "w" ? to.endsWith("8") : to.endsWith("1");
  }

  function playMove(from: string, to: string, promotion?: string) {
    const outcome = applyMove(spec, state, from, to, promotion);
    if (!outcome.ok) {
      setState(outcome.state);
      setSelected(null);
      setFeedback({ tone: "error", text: outcome.reason || exercise.failureMessage });
      return false;
    }
    const progressText = outcome.opponentMove
      ? `Black replied ${outcome.opponentMove.san || `${outcome.opponentMove.from}-${outcome.opponentMove.to}`}. Keep going.`
      : outcome.reason || "Good. Now finish the task.";
    settle(outcome.state, outcome.solved, progressText);
    return true;
  }

  function onPieceDrop(from: string, to: string) {
    if (finished || !isBoardMove) return false;
    if (isPromotionMove(from, to)) {
      setPendingPromotion({ from, to });
      return false;
    }
    return playMove(from, to);
  }

  function onSquareClick(square: string) {
    if (finished) return;

    if (isSelectSquare) {
      const outcome = applySquareSelection(spec, state, square);
      settle(outcome.state, outcome.solved, outcome.reason || "Found one. Keep looking.");
      return;
    }
    if (!isBoardMove) return;

    if (!selected) {
      const piece = parseMovementBoard(state.fen).get(square);
      const side = exercise.sideToMove === "black" ? "b" : "w";
      if (piece && piece.color === side) setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    if (isPromotionMove(selected, square)) {
      setPendingPromotion({ from: selected, to: square });
      return;
    }
    if (!playMove(selected, square)) {
      const piece = parseMovementBoard(state.fen).get(square);
      const side = exercise.sideToMove === "black" ? "b" : "w";
      if (piece && piece.color === side) setSelected(square);
    }
  }

  function chooseOption(option: string) {
    if (finished) return;
    const outcome = applyChoice(spec, state, option);
    settle(outcome.state, outcome.solved, outcome.reason || "Try again.");
  }

  function completePromotion(piece: "q" | "r" | "b" | "n") {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    playMove(from, to, piece);
  }

  const squareStyles = useMemo(() => {
    const styles: Record<string, Record<string, string | number>> = {};
    for (const square of exercise.obstacles) styles[square] = { ...obstacleStyle };
    for (const square of highlightSquares(spec, state)) styles[square] = { ...targetStyle };
    for (const square of state.collectedTargets) styles[square] = { ...collectedStyle };
    if (isSelectSquare) {
      for (const square of state.selectedSquares) styles[square] = { ...collectedStyle };
      if (finished) for (const square of wantedSquares) styles[square] = { ...collectedStyle };
    }
    if (state.lastMove) {
      styles[state.lastMove.from] = { ...(styles[state.lastMove.from] || {}), ...lastMoveStyle };
      styles[state.lastMove.to] = { ...(styles[state.lastMove.to] || {}), ...lastMoveStyle };
    }
    if (selected) {
      styles[selected] = { ...(styles[selected] || {}), ...selectedStyle };
      for (const square of legalDestinations(spec, state, selected)) {
        styles[square] = { ...(styles[square] || {}), ...destinationStyle };
      }
    }
    if (isInformation && demoCurrent?.from && demoCurrent?.to) {
      styles[demoCurrent.from] = { ...lastMoveStyle };
      styles[demoCurrent.to] = { ...lastMoveStyle };
    }
    return styles;
  }, [exercise.obstacles, spec, state, selected, isSelectSquare, wantedSquares, finished, isInformation, demoCurrent]);

  const movesLeft = exercise.maxMoves ? Math.max(0, exercise.maxMoves - state.moveCount) : 0;
  const stepLabel = exercise.opponentScript.length
    ? `Step ${Math.min(state.step + 1, exercise.opponentScript.length)} of ${exercise.opponentScript.length}`
    : "";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[#24152d] p-3 shadow-2xl shadow-brand/20 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 px-1 text-white sm:mb-4 sm:px-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">
              {isInformation ? "Lesson" : exercise.rulesMode === "MOVEMENT_TRAINER" ? "Movement trainer" : "Interactive board"}
            </p>
            <p className="mt-1 text-sm font-semibold text-white/75">
              {isInformation
                ? hasDemo
                  ? "Step through the example"
                  : "Read the points beside the board"
                : isSelectSquare
                  ? "Click the answer on the board"
                  : `${exercise.sideToMove === "black" ? "Black" : "White"} to move`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isInformation ? (
              hasDemo ? (
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                  {demoStep} of {demo.steps.length - 1}
                </span>
              ) : null
            ) : stepLabel ? (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">{stepLabel}</span>
            ) : null}
            {isInformation ? null : exercise.maxMoves ? (
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${movesLeft <= 1 ? "bg-rose-500/25 text-rose-100" : "bg-white/10 text-white/80"}`}>
                {movesLeft} move{movesLeft === 1 ? "" : "s"} left
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                {state.moveCount} move{state.moveCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[760px] rounded-2xl bg-[#140c1b] p-2 shadow-inner sm:p-4">
          <AssignmentChessboard
            maxWidth={760}
            viewportHeightOffset={170}
            position={isInformation ? demoCurrent?.fen || state.fen : state.fen}
            boardOrientation={exercise.orientation}
            onPieceDrop={(source, target) => onPieceDrop(source as string, target as string)}
            onSquareClick={onSquareClick as any}
            customDarkSquareStyle={boardDark}
            customLightSquareStyle={boardLight}
            customSquareStyles={squareStyles}
            arePiecesDraggable={isBoardMove && !finished}
            arePremovesAllowed={false}
            coordinatesClassName="text-white/60"
          />
        </div>

        {isInformation ? (
          hasDemo ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 sm:px-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDemoStep(0)}
                  disabled={demoStep === 0}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-40"
                  aria-label="Back to the starting position"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setDemoStep((value) => Math.max(0, value - 1))}
                  disabled={demoStep === 0}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-40"
                >
                  <SkipBack size={16} /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setDemoStep((value) => Math.min(demo.steps.length - 1, value + 1))}
                  disabled={demoStep >= demo.steps.length - 1}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-black text-brand transition hover:brightness-105 disabled:opacity-40"
                >
                  Next move <SkipForward size={16} />
                </button>
              </div>
              <span className="text-xs font-semibold text-white/60">
                {demoStep === 0 ? "Starting position" : demoCurrent?.label}
              </span>
            </div>
          ) : null
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 sm:px-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-white/20"
            >
              <RotateCcw size={16} /> Start again
            </button>
            <span className="text-xs font-semibold text-white/50">
              {state.incorrectMoves > 0 ? `${state.incorrectMoves} wrong ${state.incorrectMoves === 1 ? "try" : "tries"}` : "No mistakes yet"}
            </span>
          </div>
        )}

        {pendingPromotion ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#140c1b]/85 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
              <p className="text-sm font-black uppercase tracking-[0.14em] text-brand">Choose a piece</p>
              <p className="mt-2 text-sm text-slate-600">Your pawn reaches {pendingPromotion.to}. What should it become?</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {promotionPieces.map((piece) => (
                  <button
                    key={piece.code}
                    type="button"
                    onClick={() => completePromotion(piece.code)}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-brand/40 hover:bg-brand-50"
                  >
                    {piece.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPendingPromotion(null)}
                className="mt-3 w-full rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
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

          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-800">
            {isSelectSquare ? <MousePointerClick size={18} className="mt-0.5 shrink-0 text-brand" /> : <Target size={18} className="mt-0.5 shrink-0 text-brand" />}
            <span>{describeGoal(spec)}</span>
          </div>

          {isInformation && keyPoints.length ? (
            <ul className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4">
              {keyPoints.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700">
                  <BookOpen size={16} className="mt-1 shrink-0 text-brand" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {isInformation && demo.error ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              The worked example for this lesson could not be replayed. The points above still apply.
            </p>
          ) : null}

          {isQuestion ? (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start gap-2 text-sm font-bold text-slate-900">
                <CircleHelp size={18} className="mt-0.5 shrink-0 text-brand" />
                {String(exercise.goalConfig?.prompt || "Choose the best answer.")}
              </div>
              <div className="mt-3 grid gap-2">
                {options.map((option) => {
                  const chosen = state.selectedSquares.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={finished}
                      onClick={() => chooseOption(option)}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-bold transition disabled:cursor-not-allowed ${
                        chosen && finished
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:bg-brand-50"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {isSelectSquare && wantedSquares.length > 1 ? (
            <p className="mt-4 text-xs font-bold text-slate-500">
              Found {state.selectedSquares.length} of {wantedSquares.length}.
            </p>
          ) : null}

          <div
            className={`mt-5 flex items-start gap-3 rounded-2xl p-4 text-sm font-semibold ${
              feedback.tone === "success"
                ? "bg-emerald-50 text-emerald-800"
                : feedback.tone === "error"
                  ? "bg-rose-50 text-rose-800"
                  : feedback.tone === "progress"
                    ? "bg-sky-50 text-sky-900"
                    : "bg-brand-50 text-brand-900"
            }`}
          >
            {feedback.tone === "success" ? (
              <Check size={18} className="mt-0.5 shrink-0" />
            ) : feedback.tone === "error" ? (
              <X size={18} className="mt-0.5 shrink-0" />
            ) : (
              <Lightbulb size={18} className="mt-0.5 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>

          {!isInformation && exercise.hints[0]?.text ? (
            <button
              type="button"
              onClick={() => {
                setShowHint(true);
                if (!showHint) setHintsUsed((value) => value + 1);
              }}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand/15 px-3.5 py-2 text-sm font-bold text-brand transition hover:bg-brand-50"
            >
              <Lightbulb size={16} /> {showHint ? "Hint shown" : "Show hint"}
            </button>
          ) : null}
          {!isInformation && showHint && exercise.hints[0]?.text ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">{exercise.hints[0].text}</p>
          ) : null}
        </div>

        {isInformation && !finished ? (
          <button
            type="button"
            onClick={acknowledgeSlide}
            disabled={saving}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[20px] bg-brand px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-brand/90 disabled:opacity-60"
          >
            {hasDemo && demoStep < demo.steps.length - 1 ? "Skip the example and continue" : "Got it, continue"}
            <ChevronRight size={18} />
          </button>
        ) : null}

        {state.status === "failed" ? (
          <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-rose-900">
            <div className="flex items-center gap-2 text-lg font-black">
              <Flag size={18} /> Out of moves
            </div>
            <p className="mt-1 text-sm">There is a shorter route. Start again and plan the whole path before you move.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-700 px-3.5 py-2 text-sm font-bold text-white"
            >
              <RotateCcw size={16} /> Try again
            </button>
          </div>
        ) : null}

        {finished ? (
          <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <div className="text-lg font-black">{isInformation ? "Lesson read" : "Exercise complete"}</div>
            {isInformation ? null : (
              <div className="mt-1 text-2xl" aria-label={`${awardedStars} out of 3 stars`}>
                {"★".repeat(Math.max(0, awardedStars))}
                <span className="text-emerald-300">{"★".repeat(Math.max(0, 3 - awardedStars))}</span>
              </div>
            )}
            <p className="mt-2 text-sm">{exercise.explanation}</p>
            {!completed && !saving ? <p className="mt-2 text-xs font-bold text-emerald-700">Saving your progress...</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/learn/${exercise.lessonSlug}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-emerald-800"
              >
                <ChevronLeft size={16} /> Lesson
              </Link>
              {exercise.nextExerciseStableKey ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => router.push(`/learn/${exercise.lessonSlug}/${exercise.nextExerciseStableKey}`)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  Next exercise <ChevronRight size={16} />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
