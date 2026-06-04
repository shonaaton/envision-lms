"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { BookOpen, CheckCircle2, Clock, FileQuestion, Gamepad2, HelpCircle, RotateCcw, Trophy } from "lucide-react";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type BoardResult = { solved: boolean; mistakes: number; hintsUsed: number; timeTakenSeconds: number };

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
          <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
            <MiniStat label="Timer" value={timeLimit ? formatTime(timeLeft) : formatTime(elapsed)} />
            <MiniStat label="Attempts" value={`${attemptsLeft}/${maxAttempts}`} />
            <MiniStat label="Score" value={hw.mySubmission?.totalScore ?? "-"} />
            <MiniStat label="Accuracy" value={hw.mySubmission ? `${hw.mySubmission.accuracy}%` : "-"} />
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

function ActivitySection({ activity, index, locked, quizAnswers, setQuizAnswers, boardResults, setBoardResults }: any) {
  const isPgnQuiz = activity.type === "study_pgn" && activity.source?.kind === "pgn_quiz";
  const icon = activity.type === "quiz" ? <FileQuestion size={16} /> : isPgnQuiz ? <BookOpen size={16} /> : activity.type === "play_computer" ? <Gamepad2 size={16} /> : <Trophy size={16} />;
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

      {activity.type === "quiz" && (
        <div className="space-y-3">
          {(activity.items || []).map((item: any, itemIndex: number) => (
            <McqQuestion key={item.id || itemIndex} activityId={activity._id} item={item} index={itemIndex} locked={locked} value={quizAnswers[key(activity._id, item.id)] || ""} onChange={(optionId: string) => setQuizAnswers((current: any) => ({ ...current, [key(activity._id, item.id)]: optionId }))} />
          ))}
        </div>
      )}

      {isPgnQuiz && (
        <div className="grid gap-4 xl:grid-cols-2">
          {(activity.items || []).map((item: any, itemIndex: number) => (
            <PgnBoardTask key={item.id || itemIndex} activityId={activity._id} item={item} index={itemIndex} locked={locked} onResult={(result: BoardResult) => setBoardResults((current: any) => ({ ...current, [key(activity._id, item.id)]: result }))} />
          ))}
        </div>
      )}

      {activity.type === "play_computer" && <ComputerPlaceholder activity={activity} />}
    </section>
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

function PgnBoardTask({ activityId, item, index, locked, onResult }: any) {
  const parsed = useMemo(() => parsePgnPuzzle(item.pgn || ""), [item.pgn]);
  const [game, setGame] = useState(() => new Chess(parsed.start));
  const [position, setPosition] = useState(parsed.start);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startedAt] = useState(Date.now());
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    const next = new Chess(parsed.start);
    setGame(next);
    setPosition(parsed.start);
    setPly(0);
    setMistakes(0);
    setHintsUsed(0);
    setSolved(parsed.moves.length === 0);
  }, [parsed.start, parsed.moves.length]);

  useEffect(() => {
    onResult({ solved, mistakes, hintsUsed, timeTakenSeconds: Math.round((Date.now() - startedAt) / 1000) });
  }, [solved, mistakes, hintsUsed, startedAt, onResult]);

  function applyAutoReply(nextGame: Chess, nextPly: number) {
    if (nextPly >= parsed.moves.length) {
      setSolved(true);
      return nextPly;
    }
    const reply = parsed.moves[nextPly];
    const move = nextGame.move({ from: reply.from, to: reply.to, promotion: reply.promotion || "q" });
    if (!move) return nextPly;
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
      toast.error("Try again");
      return false;
    }
    let nextPly = ply + 1;
    nextPly = applyAutoReply(nextGame, nextPly);
    setGame(nextGame);
    setPosition(nextGame.fen());
    setPly(nextPly);
    return true;
  }

  function hint() {
    if (locked || solved || ply >= parsed.moves.length) return;
    setHintsUsed((value) => value + 1);
    toast.info(`Hint: try ${parsed.moves[ply].san}`);
  }

  function reset() {
    const next = new Chess(parsed.start);
    setGame(next);
    setPosition(parsed.start);
    setPly(0);
    setMistakes(0);
    setHintsUsed(0);
    setSolved(parsed.moves.length === 0);
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <b className="text-brand">{item.title || item.pgnTitle || `PGN ${index + 1}`}</b>
          <div className="text-xs text-slate-500">{parsed.moves.length} moves · mistakes {mistakes} · hints {hintsUsed}</div>
        </div>
        {solved && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Solved</span>}
      </div>
      <Chessboard
        position={position}
        onPieceDrop={onDrop}
        boardWidth={360}
        customDarkSquareStyle={{ backgroundColor: "#5a1372" }}
        customLightSquareStyle={{ backgroundColor: "#fde75a" }}
      />
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
