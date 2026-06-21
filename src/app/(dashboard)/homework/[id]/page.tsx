"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileQuestion, Gamepad2, HelpCircle, RotateCcw, Trophy } from "lucide-react";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type MoveTrace = {
  moveNumber: number;
  by: "student" | "auto" | "hint" | "reset" | "skip";
  san?: string;
  from?: string;
  to?: string;
  note?: string;
};

type BoardResult = { solved: boolean; mistakes: number; hintsUsed: number; timeTakenSeconds: number; skipped?: boolean; moveHistory?: MoveTrace[] };

function key(activityId: string, itemId: string) {
  return `${activityId}:${itemId}`;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function extractHeader(pgn: string, name: string) {
  return pgn.match(new RegExp(`\\[${name}\\s+"([^"]+)"\\]`))?.[1];
}

function parsePgnPuzzle(pgn: string) {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const moves = game.history({ verbose: true }) as any[];
    const headerFen = extractHeader(pgn, "FEN");
    return {
      start: moves[0]?.before || headerFen || startFen,
      moves: moves.map((move) => ({ san: move.san, from: move.from, to: move.to, promotion: move.promotion || "q" })),
      valid: true,
    };
  } catch {
    const fen = extractHeader(pgn, "FEN");
    return { start: fen || startFen, moves: [], valid: Boolean(fen) };
  }
}

export default function HomeworkAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const [hw, setHw] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [boardResults, setBoardResults] = useState<Record<string, BoardResult>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/homework/${id}`).then((r) => r.json()).then(setHw).catch(() => toast.error("Could not load assignment"));
  }, [id]);

  useEffect(() => {
    if (!hw || hw.mySubmission?.attemptsUsed >= (hw.numberOfAttempts || 1)) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [hw]);

  const activities = useMemo(() => hw?.activities || [], [hw]);
  const maxAttempts = Math.max(1, Number(hw?.numberOfAttempts || 1));
  const attemptsUsed = Number(hw?.mySubmission?.attemptsUsed || 0);
  const attemptsLeft = Math.max(0, maxAttempts - attemptsUsed);
  const timeLimit = Number(hw?.timeLimitMinutes || Math.max(0, ...activities.map((activity: any) => Number(activity.timeLimitMinutes || 0)))) * 60;
  const timeLeft = timeLimit ? Math.max(0, timeLimit - elapsed) : 0;
  const locked = attemptsLeft <= 0 || Boolean(hw?.mySubmission && attemptsLeft <= 0);

  useEffect(() => {
    if (timeLimit && elapsed >= timeLimit && hw && !submitting && attemptsLeft > 0) {
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, timeLimit, hw, submitting, attemptsLeft]);

  if (!hw) return <div className="rounded-2xl border bg-white p-5 text-slate-600 shadow-sm">Loading assignment...</div>;

  if (hw.mySubmission) {
    return <CompletedReport hw={hw} activities={activities} submission={hw.mySubmission} />;
  }

  async function submit() {
    if (submitting || attemptsLeft <= 0) return;
    setSubmitting(true);
    const response = await fetch(`/api/homework/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizAnswers,
        activityResults: boardResults,
        timeTakenSeconds: elapsed,
        metrics: {
          mistakes: Object.values(boardResults).reduce((sum, result) => sum + result.mistakes, 0),
          hintsUsed: Object.values(boardResults).reduce((sum, result) => sum + result.hintsUsed, 0),
        },
      }),
    });
    setSubmitting(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return toast.error(data.error || "Failed to submit");
    }
    const submission = await response.json();
    setHw((current: any) => ({ ...current, mySubmission: submission }));
    toast.success(`Submitted. Score: ${submission.totalScore}, accuracy: ${submission.accuracy}%`);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <header className="mb-5 rounded-3xl bg-brand p-5 text-white shadow-xl shadow-brand-900/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Assignment Attempt</div>
            <h1 className="mt-1 text-3xl font-black">{hw.title}</h1>
            {hw.description && <p className="mt-2 max-w-3xl text-sm text-white/75">{hw.description}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <MiniStat label="Timer" value={timeLimit ? formatTime(timeLeft) : formatTime(elapsed)} />
            <MiniStat label="Attempts" value={`${attemptsLeft}/${maxAttempts}`} />
          </div>
        </div>
      </header>

      {locked && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Attempts are finished for this assignment. Your latest score is shown above.
        </div>
      )}

      <div className="space-y-4">
        {activities.map((activity: any, index: number) => (
          <ActivitySection
            key={activity._id || index}
            activity={activity}
            index={index}
            locked={locked}
            quizAnswers={quizAnswers}
            setQuizAnswers={setQuizAnswers}
            boardResults={boardResults}
            setBoardResults={setBoardResults}
          />
        ))}
      </div>

      <div className="sticky bottom-4 mt-5 flex justify-end">
        <button disabled={locked || submitting} onClick={submit} className="rounded-xl bg-brand px-5 py-3 text-sm font-black text-white shadow-xl shadow-brand-900/20 disabled:cursor-not-allowed disabled:bg-slate-400">
          {submitting ? "Submitting..." : "Submit assignment"}
        </button>
      </div>
    </div>
  );
}

function CompletedReport({ hw, activities, submission }: { hw: any; activities: any[]; submission: any }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <header className="mb-5 rounded-3xl bg-brand p-5 text-white shadow-xl shadow-brand-900/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Completed Assignment</div>
            <h1 className="mt-1 text-3xl font-black">{hw.title}</h1>
            <p className="mt-2 text-sm text-white/75">Review your report, answers, correct solutions, and boards.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
            <MiniStat label="Score" value={submission.totalScore ?? 0} />
            <MiniStat label="Accuracy" value={`${submission.accuracy ?? 0}%`} />
            <MiniStat label="Time" value={formatTime(submission.timeTakenSeconds || 0)} />
            <MiniStat label="Attempts" value={submission.attemptsUsed || 1} />
          </div>
        </div>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <ReportStat label="Mistakes" value={submission.metrics?.mistakes || 0} />
        <ReportStat label="Hints Used" value={submission.metrics?.hintsUsed || 0} />
        <ReportStat label="Boards Solved" value={`${submission.metrics?.solvedBoards || 0}/${submission.metrics?.totalBoards || 0}`} />
        <ReportStat label="MCQ Correct" value={`${submission.metrics?.correctMcq || 0}/${submission.metrics?.totalMcq || 0}`} />
      </section>

      <div className="space-y-4">
        {activities.map((activity: any, index: number) => (
          <ReportActivity key={activity._id || index} activity={activity} index={index} submission={submission} />
        ))}
      </div>
    </div>
  );
}

function ReportActivity({ activity, index, submission }: { activity: any; index: number; submission: any }) {
  const isPgnQuiz = activity.type === "study_pgn" && activity.source?.kind === "pgn_quiz";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Activity {index + 1}</div>
        <h2 className="text-xl font-black text-brand">{activity.title}</h2>
      </div>
      {activity.type === "quiz" && <ReportMcq activity={activity} submission={submission} />}
      {isPgnQuiz && <ReportPgnBoards activity={activity} submission={submission} />}
      {activity.type === "play_computer" && <ComputerPlaceholder activity={activity} />}
    </section>
  );
}

function ReportMcq({ activity, submission }: { activity: any; submission: any }) {
  return (
    <div className="space-y-3">
      {(activity.items || []).map((item: any, index: number) => {
        const selected = submission.quizAnswers?.[key(activity._id, item.id)];
        const selectedOption = (item.options || []).find((option: any) => option.id === selected);
        const correctOption = (item.options || []).find((option: any) => option.correct);
        const correct = selectedOption?.id === correctOption?.id;
        return (
          <div key={item.id || index} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <b className="text-brand">Question {index + 1}</b>
              <span className={`rounded-full px-2 py-1 text-xs font-bold ${correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{correct ? "Correct" : "Review"}</span>
            </div>
            {item.positionFen && <FenBox fen={item.positionFen} />}
            <div className="mt-2 rounded-xl bg-slate-50 p-3 font-semibold">{item.question}</div>
            <div className="mt-3 grid gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 px-3 py-2"><b>Your answer:</b> {selectedOption?.text || "Not answered"}</div>
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800"><b>Correct answer:</b> {correctOption?.text || "-"}</div>
              {item.explanation && <div className="rounded-lg bg-accent/20 px-3 py-2 text-brand"><b>Explanation:</b> {item.explanation}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportPgnBoards({ activity, submission }: { activity: any; submission: any }) {
  return (
    <div className="space-y-4">
      {(activity.items || []).map((item: any, index: number) => {
        const result = submission.activityResults?.[key(activity._id, item.id)] || {};
        return (
          <div key={item.id || index} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="text-brand">{item.title || item.pgnTitle || `PGN ${index + 1}`}</b>
                <div className="text-xs text-slate-500">Mistakes {result.mistakes || 0} - Hints {result.hintsUsed || 0}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-bold ${result.solved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{result.solved ? "Solved" : "Review"}</span>
            </div>
            <ReviewPgnBoard pgn={item.pgn || ""} />
            <MoveHistoryTrace history={result.moveHistory || []} />
          </div>
        );
      })}
    </div>
  );
}

function ReviewPgnBoard({ pgn }: { pgn: string }) {
  const parsed = useMemo(() => parsePgnPuzzle(pgn), [pgn]);
  const [ply, setPly] = useState(0);
  const position = useMemo(() => {
    const game = new Chess(parsed.start);
    parsed.moves.slice(0, ply).forEach((move) => game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" }));
    return game.fen();
  }, [parsed.start, parsed.moves, ply]);

  return (
    <div>
      <Chessboard position={position} arePiecesDraggable={false} boardWidth={360} customDarkSquareStyle={{ backgroundColor: "#b58863" }} customLightSquareStyle={{ backgroundColor: "#f0d9b5" }} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={() => setPly((value) => Math.max(0, value - 1))}>Previous</button>
        <span className="text-sm font-bold text-slate-600">{ply}/{parsed.moves.length}</span>
        <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={() => setPly((value) => Math.min(parsed.moves.length, value + 1))}>Next</button>
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-black text-brand">{value}</div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function ActivitySection({ activity, index, locked, quizAnswers, setQuizAnswers, boardResults, setBoardResults }: any) {
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const isPgnQuiz = activity.type === "study_pgn" && activity.source?.kind === "pgn_quiz";
  const icon = activity.type === "quiz" ? <FileQuestion size={16} /> : isPgnQuiz ? <BookOpen size={16} /> : activity.type === "play_computer" ? <Gamepad2 size={16} /> : <Trophy size={16} />;
  const items = activity.items || [];
  const activeItem = items[Math.min(activeItemIndex, Math.max(0, items.length - 1))];
  const hasOneByOneItems = (activity.type === "quiz" || isPgnQuiz) && items.length > 0;

  useEffect(() => {
    setActiveItemIndex(0);
  }, [activity._id, items.length]);

  function goNext() {
    setActiveItemIndex((value) => Math.min(items.length - 1, value + 1));
  }

  function skipCurrent() {
    if (isPgnQuiz && activeItem) {
      setBoardResults((current: any) => ({
        ...current,
        [key(activity._id, activeItem.id)]: { solved: false, skipped: true, mistakes: 0, hintsUsed: 0, timeTakenSeconds: 0, moveHistory: [{ moveNumber: 1, by: "skip", note: "Skipped by student" }] },
      }));
    }
    goNext();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">{icon}{isPgnQuiz ? "PGN Quiz" : activity.type === "quiz" ? "MCQ" : activity.type.replaceAll("_", " ")}</span>
          <h2 className="mt-2 text-xl font-black text-brand">Activity {index + 1}: {activity.title}</h2>
          {activity.instructions && <p className="mt-1 text-sm text-slate-600">{activity.instructions}</p>}
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-accent/30 px-3 py-1 text-brand">{activity.points || 0} pts each</span>
          {!!activity.timeLimitMinutes && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{activity.timeLimitMinutes} min</span>}
        </div>
      </div>

      {hasOneByOneItems && (
        <ItemPager
          current={activeItemIndex}
          total={items.length}
          timeLabel={activity.timeLimitMinutes ? `${activity.timeLimitMinutes} min for this activity` : "No item time limit"}
          onPrevious={() => setActiveItemIndex((value) => Math.max(0, value - 1))}
          onNext={goNext}
          onSkip={skipCurrent}
        />
      )}

      {activity.type === "quiz" && activeItem && (
        <McqQuestion
          key={activeItem.id || activeItemIndex}
          activityId={activity._id}
          item={activeItem}
          index={activeItemIndex}
          locked={locked}
          value={quizAnswers[key(activity._id, activeItem.id)] || ""}
          onChange={(optionId: string) => {
            setQuizAnswers((current: any) => ({ ...current, [key(activity._id, activeItem.id)]: optionId }));
            window.setTimeout(goNext, 250);
          }}
        />
      )}

      {isPgnQuiz && activeItem && (
        <div className="max-w-[520px]">
          <PgnBoardTask
            key={activeItem.id || activeItemIndex}
            activityId={activity._id}
            item={activeItem}
            index={activeItemIndex}
            locked={locked}
            onResult={(result: BoardResult) => setBoardResults((current: any) => ({ ...current, [key(activity._id, activeItem.id)]: result }))}
            onSolved={goNext}
          />
        </div>
      )}

      {activity.type === "play_computer" && <ComputerPlaceholder activity={activity} />}
    </section>
  );
}

function ItemPager({ current, total, timeLabel, onPrevious, onNext, onSkip }: { current: number; total: number; timeLabel: string; onPrevious: () => void; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div>
        <div className="text-sm font-bold text-slate-700">Item {current + 1} of {total}</div>
        <div className="text-xs font-semibold text-slate-500">{timeLabel}</div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300" onClick={onPrevious} disabled={current === 0}>
          <ChevronLeft size={15} /> Previous
        </button>
        <button type="button" className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700" onClick={onSkip}>
          Skip
        </button>
        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300" onClick={onNext} disabled={current >= total - 1}>
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function McqQuestion({ activityId, item, index, value, onChange, locked }: any) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-brand">Question {index + 1}</b>
        <span className="rounded-full bg-accent/30 px-2 py-1 text-xs font-bold text-brand">{item.points || 1} pts</span>
      </div>
      {item.positionFen && <FenBox fen={item.positionFen} />}
      <div className="mt-2 rounded-xl bg-slate-50 p-4 font-semibold text-slate-900">{item.question}</div>
      <div className="mt-2 grid gap-2">
        {(item.options || []).map((option: any) => (
          <label key={option.id} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${value === option.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
            <input disabled={locked} type="radio" checked={value === option.id} onChange={() => onChange(option.id)} />
            {option.text}
          </label>
        ))}
      </div>
    </div>
  );
}

function PgnBoardTask({ activityId, item, index, locked, onResult, onSolved }: any) {
  const parsed = useMemo(() => parsePgnPuzzle(item.pgn || ""), [item.pgn]);
  const [game, setGame] = useState(() => new Chess(parsed.start));
  const [position, setPosition] = useState(parsed.start);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startedAt] = useState(Date.now());
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState("Make the best move on the board.");
  const [moveHistory, setMoveHistory] = useState<MoveTrace[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const advancedRef = useRef(false);

  useEffect(() => {
    const next = new Chess(parsed.start);
    setGame(next);
    setPosition(parsed.start);
    setPly(0);
    setMistakes(0);
    setHintsUsed(0);
    setMoveHistory([]);
    setSolved(parsed.moves.length === 0);
    setFeedback(parsed.moves.length === 0 ? "No moves found in this PGN." : "Make the best move on the board.");
    setSelectedSquare(null);
    advancedRef.current = false;
  }, [parsed.start, parsed.moves.length]);

  useEffect(() => {
    onResult({ solved, mistakes, hintsUsed, timeTakenSeconds: Math.round((Date.now() - startedAt) / 1000), moveHistory });
    if (solved && !advancedRef.current) {
      advancedRef.current = true;
      window.setTimeout(onSolved, 650);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, mistakes, hintsUsed, startedAt, moveHistory]);

  function applyAutoReply(nextGame: Chess, nextPly: number) {
    if (nextPly >= parsed.moves.length) {
      setSolved(true);
      return nextPly;
    }
    const reply = parsed.moves[nextPly];
    const move = nextGame.move({ from: reply.from, to: reply.to, promotion: reply.promotion || "q" });
    if (!move) return nextPly;
    setMoveHistory((current) => [...current, { moveNumber: current.length + 1, by: "auto", san: move.san, from: reply.from, to: reply.to, note: "Automatic reply" }]);
    const updatedPly = nextPly + 1;
    if (updatedPly >= parsed.moves.length) setSolved(true);
    return updatedPly;
  }

  function onDrop(source: string, target: string) {
    if (locked || solved || ply >= parsed.moves.length) return false;
    const expected = parsed.moves[ply];
    const nextGame = new Chess(game.fen());
    const move = nextGame.move({ from: source, to: target, promotion: "q" });
    if (!move) return false;
    if (move.san !== expected.san) {
      setMistakes((value) => value + 1);
      setMoveHistory((current) => [...current, { moveNumber: current.length + 1, by: "student", san: move.san, from: source, to: target, note: "Incorrect attempt" }]);
      setFeedback("Try again. That move is not the expected continuation.");
      return false;
    }
    setMoveHistory((current) => [...current, { moveNumber: current.length + 1, by: "student", san: move.san, from: source, to: target, note: "Correct move" }]);
    let nextPly = ply + 1;
    nextPly = applyAutoReply(nextGame, nextPly);
    setGame(nextGame);
    setPosition(nextGame.fen());
    setPly(nextPly);
    setSelectedSquare(null);
    setFeedback(nextPly >= parsed.moves.length ? "Solved. Moving to the next item..." : "Correct. Continue from the new position.");
    return true;
  }

  function hint() {
    if (locked || solved || ply >= parsed.moves.length) return;
    setHintsUsed((value) => value + 1);
    setMoveHistory((current) => [...current, { moveNumber: current.length + 1, by: "hint", san: parsed.moves[ply].san, note: "Hint used" }]);
    setFeedback(`Hint: try ${parsed.moves[ply].san}`);
  }

  function reset() {
    const next = new Chess(parsed.start);
    setGame(next);
    setPosition(parsed.start);
    setPly(0);
    setMistakes(0);
    setHintsUsed(0);
    setMoveHistory((current) => [...current, { moveNumber: current.length + 1, by: "reset", note: "Board reset" }]);
    setSolved(parsed.moves.length === 0);
    setFeedback("Make the best move on the board.");
    setSelectedSquare(null);
  }

  const moveTargets = useMemo(() => {
    if (!selectedSquare || locked || solved || ply >= parsed.moves.length) return [];
    return legalTargetsFromGame(game, selectedSquare);
  }, [selectedSquare, locked, solved, ply, parsed.moves.length, game]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedSquare), [moveTargets, selectedSquare]);

  function onSquareClick(square: string) {
    if (locked || solved || ply >= parsed.moves.length) return;
    const clickedPiece = game.get(square as any);
    if (selectedSquare && selectedSquare !== square) {
      const moved = onDrop(selectedSquare, square);
      if (moved) return;
    }
    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }
    if (clickedPiece && clickedPiece.color === game.turn()) {
      setSelectedSquare(square);
      return;
    }
    setSelectedSquare(null);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-brand-900/10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <b className="text-brand">{item.title || item.pgnTitle || `PGN ${index + 1}`}</b>
          <div className="text-xs text-slate-500">{parsed.moves.length} moves · mistakes {mistakes} · hints {hintsUsed}</div>
        </div>
        {solved && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Solved</span>}
      </div>
      <div className="rounded-2xl bg-[#31210f] p-3 shadow-inner">
        <Chessboard
          position={position}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick as any}
          boardWidth={440}
          customSquareStyles={moveHintStyles as any}
          customDarkSquareStyle={{ backgroundColor: "#b58863" }}
          customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
        />
      </div>
      <div className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${feedback.startsWith("Try") ? "bg-red-50 text-red-700" : feedback.startsWith("Hint") ? "bg-amber-50 text-amber-700" : solved ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}`}>
        {feedback}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={hint}><HelpCircle size={14} className="mr-1 inline" /> Hint</button>
        <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={reset}><RotateCcw size={14} className="mr-1 inline" /> Reset</button>
      </div>
    </div>
  );
}

function ComputerPlaceholder({ activity }: { activity: any }) {
  const computer = activity.computer || {};
  return (
    <div className="rounded-xl border border-dashed border-brand/25 bg-brand/5 p-4 text-sm text-slate-700">
      <Gamepad2 className="mb-2 text-brand" size={18} />
      Play vs Computer is recorded for coach review. Settings: {computer.strength || "Level 1-3"}, color {computer.side || "random"}.
    </div>
  );
}

function MoveHistoryTrace({ history }: { history: MoveTrace[] }) {
  if (!history.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Move History</div>
      <div className="space-y-2 text-sm">
        {history.map((entry, index) => (
          <div key={`${entry.by}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{entry.moveNumber}</span>
            <span className="font-semibold text-slate-900">{entry.san || entry.note || "Action"}</span>
            <span className="text-xs uppercase tracking-wide text-slate-400">{entry.by}</span>
            {entry.from && entry.to && <span className="text-xs text-slate-500">{entry.from} to {entry.to}</span>}
            {entry.note && entry.san && <span className="text-xs text-slate-500">{entry.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FenBox({ fen }: { fen: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">{fen}</div>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3">
      <div className="text-lg font-black text-accent">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">{label}</div>
    </div>
  );
}
