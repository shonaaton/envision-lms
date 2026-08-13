"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { BookOpen, Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileQuestion, FileText, Flag, Gamepad2, HelpCircle, Play, RotateCcw, Trophy } from "lucide-react";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";
import { normalizePermissiveFen } from "@/lib/pgnLibrary";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type MoveTrace = {
  moveNumber: number;
  by: "student" | "auto" | "computer" | "hint" | "reset" | "skip";
  san?: string;
  from?: string;
  to?: string;
  note?: string;
};

type BoardResult = { solved: boolean; mistakes: number; hintsUsed: number; timeTakenSeconds: number; skipped?: boolean; moveHistory?: MoveTrace[]; outcome?: string; failed?: boolean };

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

function normalizeBoardResourceFen(value?: string | null) {
  if (!value || value === "start") return "";
  return normalizePermissiveFen(value) || String(value).trim();
}

function buildGame(fen?: string) {
  try {
    if (fen && fen !== "start") return new Chess(fen);
  } catch {
    const normalizedFen = normalizeBoardResourceFen(fen);
    if (normalizedFen) {
      try {
        const chess = new Chess();
        chess.load(normalizedFen, { skipValidation: true });
        return chess;
      } catch {
        // Fall through to the normal starting board.
      }
    }
  }
  return new Chess();
}

function itemFen(item: any) {
  return String(item?.positionFen || item?.fen || "").trim();
}

function previewFen(fen: string) {
  if (!fen || fen === "start") return startFen;
  try {
    return new Chess(fen).fen();
  } catch {
    const normalizedFen = normalizeBoardResourceFen(fen);
    if (normalizedFen) {
      try {
        const chess = new Chess();
        chess.load(normalizedFen, { skipValidation: true });
        return chess.fen();
      } catch {
        // Fall through to a friendly render error.
      }
    }
  }
  return "";
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
    const fen = normalizeBoardResourceFen(extractHeader(pgn, "FEN"));
    return { start: fen || startFen, moves: [], valid: Boolean(fen) };
  }
}

export default function HomeworkAttemptPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const [hw, setHw] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [boardResults, setBoardResults] = useState<Record<string, BoardResult>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/homework/${id}`, { cache: "no-store" }).then((r) => r.json()).then(setHw).catch(() => toast.error("Could not load assignment"));
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
        writtenAnswers,
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
    <div className="min-h-screen bg-slate-50 px-2 py-4 text-slate-950 sm:px-6 sm:py-5 lg:px-8">
      <header className="mb-3 rounded-xl bg-brand px-4 py-3 text-white shadow-lg shadow-brand-900/15">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Assignment Attempt</div>
            <h1 className="mt-0.5 text-xl font-black">{hw.title}</h1>
            {hw.description && <p className="mt-1 max-w-3xl text-xs text-white/75">{hw.description}</p>}
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
            writtenAnswers={writtenAnswers}
            setWrittenAnswers={setWrittenAnswers}
            boardResults={boardResults}
            setBoardResults={setBoardResults}
          />
        ))}
      </div>

      <div className="sticky bottom-3 mt-5 flex justify-end">
        <button disabled={locked || submitting} onClick={submit} className="min-h-11 w-full rounded-xl bg-brand px-5 py-3 text-sm font-black text-white shadow-xl shadow-brand-900/20 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto">
          {submitting ? "Submitting..." : "Submit assignment"}
        </button>
      </div>
    </div>
  );
}

function CompletedReport({ hw, activities, submission }: { hw: any; activities: any[]; submission: any }) {
  return (
    <div className="min-h-screen bg-slate-50 px-2 py-4 text-slate-950 sm:px-6 sm:py-5 lg:px-8">
      <header className="mb-3 rounded-xl bg-brand px-4 py-3 text-white shadow-lg shadow-brand-900/15">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Completed Assignment</div>
            <h1 className="mt-0.5 text-xl font-black">{hw.title}</h1>
            <p className="mt-1 text-xs text-white/75">Review your report, answers, correct solutions, and boards.</p>
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
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Activity {index + 1}</div>
        <h2 className="text-xl font-black text-brand">{activity.title}</h2>
      </div>
      {activity.type === "quiz" && <ReportMcq activity={activity} submission={submission} />}
      {activity.type === "written_answer" && <ReportWrittenAnswers activity={activity} submission={submission} />}
      {isPgnQuiz && <ReportPgnBoards activity={activity} submission={submission} />}
      {activity.type === "play_computer" && <ComputerPlaceholder activity={activity} />}
    </section>
  );
}

function ReportMcq({ activity, submission }: { activity: any; submission: any }) {
  return (
    <div className="space-y-3">
      {(activity.items || []).map((item: any, index: number) => {
        const fen = itemFen(item);
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
            {fen && <FenBox fen={fen} />}
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

function ReportWrittenAnswers({ activity, submission }: { activity: any; submission: any }) {
  return (
    <div className="space-y-3">
      {(activity.items || []).map((item: any, index: number) => {
        const fen = itemFen(item);
        const answer = submission.writtenAnswers?.[key(activity._id, item.id)] || "";
        return (
          <div key={item.id || index} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <b className="text-brand">Question {index + 1}</b>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Coach review</span>
            </div>
            {fen && <FenBox fen={fen} />}
            <div className="mt-2 rounded-xl bg-slate-50 p-3 font-semibold">{item.question}</div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Your answer</div>
              <div className="whitespace-pre-wrap text-slate-800">{answer || "Not answered"}</div>
            </div>
            {(item.expectedAnswer || item.explanation) && (
              <div className="mt-3 rounded-xl bg-accent/20 p-3 text-sm text-brand">
                {item.expectedAnswer && <div><b>Model answer:</b> {item.expectedAnswer}</div>}
                {item.explanation && <div className="mt-1"><b>Explanation:</b> {item.explanation}</div>}
              </div>
            )}
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
    if (!parsed.moves.length) return parsed.start;
    const game = buildGame(parsed.start);
    parsed.moves.slice(0, ply).forEach((move) => game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" }));
    return game.fen();
  }, [parsed.start, parsed.moves, ply]);

  return (
    <div>
      <AssignmentChessboard maxWidth={360} position={position} arePiecesDraggable={false} customDarkSquareStyle={{ backgroundColor: "#b58863" }} customLightSquareStyle={{ backgroundColor: "#f0d9b5" }} />
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
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="text-2xl font-black text-brand">{value}</div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function ActivitySection({ activity, index, locked, quizAnswers, setQuizAnswers, writtenAnswers, setWrittenAnswers, boardResults, setBoardResults }: any) {
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const isPgnQuiz = activity.type === "study_pgn" && activity.source?.kind === "pgn_quiz";
  const isWritten = activity.type === "written_answer";
  const icon = activity.type === "quiz" ? <FileQuestion size={16} /> : isWritten ? <FileText size={16} /> : isPgnQuiz ? <BookOpen size={16} /> : activity.type === "play_computer" ? <Gamepad2 size={16} /> : <Trophy size={16} />;
  const items = activity.items || [];
  const activeItem = items[Math.min(activeItemIndex, Math.max(0, items.length - 1))];
  const hasOneByOneItems = (activity.type === "quiz" || isWritten || isPgnQuiz) && items.length > 0;

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
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">{icon}{isPgnQuiz ? "PGN Homework" : activity.type === "quiz" ? "MCQ" : isWritten ? "Written Answer" : activity.type.replaceAll("_", " ")}</span>
          <h2 className="mt-2 text-xl font-black text-brand">Activity {index + 1}: {activity.title}</h2>
          {activity.instructions && <p className="mt-1 text-sm text-slate-600">{activity.instructions}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
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
          showNext={activity.type !== "quiz"}
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
          }}
          onSubmitAnswer={() => {
            if (activeItemIndex >= items.length - 1) {
              toast.success("Answer saved. Submit assignment when done.");
              return;
            }
            goNext();
          }}
          isLast={activeItemIndex >= items.length - 1}
        />
      )}

      {isWritten && activeItem && (
        <WrittenQuestion
          key={activeItem.id || activeItemIndex}
          item={activeItem}
          index={activeItemIndex}
          locked={locked}
          value={writtenAnswers[key(activity._id, activeItem.id)] || ""}
          onChange={(answer: string) => setWrittenAnswers((current: any) => ({ ...current, [key(activity._id, activeItem.id)]: answer }))}
        />
      )}

      {isPgnQuiz && activeItem && (
        <div className="w-full max-w-[520px]">
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

      {activity.type === "play_computer" && (
        <ComputerAssignmentGame
          activity={activity}
          locked={locked}
          onResult={(result) => setBoardResults((current: any) => ({ ...current, [key(activity._id, "play_computer")]: result }))}
        />
      )}
    </section>
  );
}

function ItemPager({ current, total, timeLabel, onPrevious, onNext, onSkip, showNext = true }: { current: number; total: number; timeLabel: string; onPrevious: () => void; onNext: () => void; onSkip: () => void; showNext?: boolean }) {
  return (
    <div className="mb-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-xs font-bold text-slate-700">Item {current + 1} of {total}</div>
        <div className="text-xs font-semibold text-slate-500">{timeLabel}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300" onClick={onPrevious} disabled={current === 0}>
          <ChevronLeft size={15} /> Previous
        </button>
        <button type="button" className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700" onClick={onSkip}>
          Skip
        </button>
        {showNext && (
          <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300" onClick={onNext} disabled={current >= total - 1}>
            Next <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function McqQuestion({ item, index, value, onChange, onSubmitAnswer, locked, isLast }: any) {
  const fen = itemFen(item);
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-sm text-brand">Question {index + 1}</b>
        <span className="rounded-full bg-accent/30 px-2 py-1 text-xs font-bold text-brand">{item.points || 1} pts</span>
      </div>
      <div className={`grid gap-3 ${fen ? "lg:grid-cols-[298px_minmax(0,1fr)] lg:items-start" : ""}`}>
        {fen && <FenBox fen={fen} />}
        <div className="min-w-0">
          <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-900">{item.question}</div>
          <div className="mt-2 grid gap-2">
            {(item.options || []).map((option: any) => (
              <label key={option.id} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm font-semibold ${value === option.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                <input disabled={locked} type="radio" checked={value === option.id} onChange={() => onChange(option.id)} />
                <span className="min-w-0">{option.text}</span>
              </label>
            ))}
            {!(item.options || []).length && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">No options were added for this MCQ.</div>}
          </div>
          <button
            type="button"
            disabled={locked || !value}
            onClick={onSubmitAnswer}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLast ? "Save Answer" : "Submit Answer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WrittenQuestion({ item, index, value, onChange, locked }: any) {
  const fen = itemFen(item);
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-brand">Question {index + 1}</b>
        <span className="rounded-full bg-accent/30 px-2 py-1 text-xs font-bold text-brand">{item.points || 1} pts</span>
      </div>
      {fen && <FenBox fen={fen} />}
      <div className="mt-2 rounded-xl bg-slate-50 p-4 font-semibold text-slate-900">{item.question}</div>
      <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-500">
        Your answer
        <textarea
          disabled={locked}
          className="mt-2 min-h-32 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100"
          placeholder="Type your answer here..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function PgnBoardTask({ activityId, item, index, locked, onResult, onSolved }: any) {
  const parsed = useMemo(() => parsePgnPuzzle(item.pgn || ""), [item.pgn]);
  const [game, setGame] = useState(() => buildGame(parsed.start));
  const [position, setPosition] = useState(parsed.start);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startedAt] = useState(Date.now());
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState("Make the best move on the board.");
  const [moveHistory, setMoveHistory] = useState<MoveTrace[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const advancedRef = useRef(false);

  useEffect(() => {
    const next = buildGame(parsed.start);
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

  function commitMove(source: string, target: string, promotion: PromotionPiece = "q") {
    if (locked || solved || ply >= parsed.moves.length) return false;
    const expected = parsed.moves[ply];
    const nextGame = buildGame(game.fen());
    const move = nextGame.move({ from: source, to: target, promotion });
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

  function onDrop(source: string, target: string) {
    return commitMove(source, target);
  }

  function onPromotionPieceSelect(piece?: string, from?: string, to?: string) {
    const promotion = promotionFromBoardPiece(piece);
    const move = from && to ? { from, to } : pendingPromotion;
    setPendingPromotion(null);
    if (!promotion || !move) return false;
    return commitMove(move.from, move.to, promotion);
  }

  function hint() {
    if (locked || solved || ply >= parsed.moves.length) return;
    setHintsUsed((value) => value + 1);
    setMoveHistory((current) => [...current, { moveNumber: current.length + 1, by: "hint", san: parsed.moves[ply].san, note: "Hint used" }]);
    setFeedback(`Hint: try ${parsed.moves[ply].san}`);
  }

  function reset() {
    const next = buildGame(parsed.start);
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
      if (isPromotionMove(game, selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
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
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xl shadow-brand-900/10 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <b className="text-brand">{item.title || item.pgnTitle || `PGN ${index + 1}`}</b>
          <div className="text-xs text-slate-500">{parsed.moves.length} moves · mistakes {mistakes} · hints {hintsUsed}</div>
        </div>
        {solved && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Solved</span>}
      </div>
      <div className="rounded-lg bg-[#31210f] p-1.5 shadow-inner sm:p-3">
        <AssignmentChessboard
          maxWidth={440}
          viewportHeightOffset={360}
          coordinatesClassName="text-[#f0d9b5]"
          position={position}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick as any}
          onPromotionPieceSelect={onPromotionPieceSelect as any}
          showPromotionDialog={!!pendingPromotion}
          promotionToSquare={pendingPromotion?.to as any}
          promotionDialogVariant="modal"
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

function ComputerAssignmentGame({
  activity,
  locked,
  onResult,
}: {
  activity: any;
  locked: boolean;
  onResult: (result: BoardResult) => void;
}) {
  const computer = activity.computer || {};
  const levelMatch = String(computer.strength || "").match(/(\d+)(?:\D+(\d+))?/);
  const minLevel = Math.max(1, Number(levelMatch?.[1] || activity.source?.minLevel || 1));
  const maxLevel = Math.max(minLevel, Number(levelMatch?.[2] || activity.source?.maxLevel || minLevel));
  const level = Math.min(12, Math.max(1, Math.round((minLevel + maxLevel) / 2)));
  const depth = Math.max(1, Math.min(4, Math.ceil(level / 3)));
  const playerSide = computer.side === "black" ? "black" : computer.side === "random" ? "white" : "white";
  const playerTurn = playerSide === "white" ? "w" : "b";
  const computerTurn = playerTurn === "w" ? "b" : "w";
  const timeControl = computer.timeControl || {};
  const clockEnabled = timeControl.type && timeControl.type !== "untimed" && Number(timeControl.minutes || 0) > 0;
  const startClockMs = clockEnabled ? Number(timeControl.minutes || 0) * 60_000 : null;
  const gameRef = useRef(buildGame(computer.fen || activity.fen || startFen));
  const workerRef = useRef<Worker | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const [position, setPosition] = useState(gameRef.current.fen());
  const [started, setStarted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState("Start the game when you are ready.");
  const [outcome, setOutcome] = useState("");
  const [mistakes, setMistakes] = useState(0);
  const [moveHistory, setMoveHistory] = useState<MoveTrace[]>([]);
  const moveHistoryRef = useRef<MoveTrace[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [whiteClockMs, setWhiteClockMs] = useState<number | null>(startClockMs);
  const [blackClockMs, setBlackClockMs] = useState<number | null>(startClockMs);
  const [tick, setTick] = useState(0);

  const activityFinished = Boolean(outcome);
  const activityWon = outcome === "victory";
  const isPlayerTurn = started && !thinking && !activityFinished && gameRef.current.turn() === playerTurn && !gameRef.current.isGameOver();
  const elapsedSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;

  useEffect(() => {
    try {
      const worker = new Worker("/stockfish/stockfish.js");
      workerRef.current = worker;
      worker.postMessage("uci");
      worker.onmessage = (event) => {
        const line = typeof event.data === "string" ? event.data : "";
        const bestMove = line.match(/^bestmove\s(\S+)/)?.[1];
        if (!bestMove || gameRef.current.turn() !== computerTurn || gameRef.current.isGameOver()) return;
        if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
        applyComputerMove({ from: bestMove.slice(0, 2), to: bestMove.slice(2, 4), promotion: bestMove[4] || "q" });
      };
    } catch {
      workerRef.current = null;
    }
    return () => {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      workerRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, computerTurn]);

  useEffect(() => {
    if (!clockEnabled || !started || !turnStartedAt || gameRef.current.isGameOver()) return;
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
      const remaining = displayedClockForTurn();
      if (remaining <= 0) finish(gameRef.current.turn() === playerTurn ? "timeout" : "victory");
    }, 250);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockEnabled, started, turnStartedAt, whiteClockMs, blackClockMs, playerTurn]);

  function formatClock(ms: number | null) {
    if (ms === null) return "No clock";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function commitClock() {
    if (!clockEnabled || !turnStartedAt) return;
    const elapsed = Date.now() - turnStartedAt;
    const incrementMs = Math.max(0, Number(timeControl.increment || 0)) * 1000;
    if (gameRef.current.turn() === "w") setWhiteClockMs((value) => value === null ? null : Math.max(0, value - elapsed));
    else setBlackClockMs((value) => value === null ? null : Math.max(0, value - elapsed));
    if (incrementMs > 0) {
      if (gameRef.current.turn() === "w") setWhiteClockMs((value) => value === null ? null : value + incrementMs);
      else setBlackClockMs((value) => value === null ? null : value + incrementMs);
    }
    setTurnStartedAt(Date.now());
  }

  function displayedClockForTurn() {
    const base = gameRef.current.turn() === "w" ? whiteClockMs : blackClockMs;
    if (base === null || !turnStartedAt) return Number.POSITIVE_INFINITY;
    return Math.max(0, base - (Date.now() - turnStartedAt) + tick * 0);
  }

  function displayedClock(side: "w" | "b") {
    const base = side === "w" ? whiteClockMs : blackClockMs;
    if (base === null) return null;
    if (started && turnStartedAt && gameRef.current.turn() === side && !gameRef.current.isGameOver()) {
      return Math.max(0, base - (Date.now() - turnStartedAt) + tick * 0);
    }
    return base;
  }

  function setRecordedHistory(next: MoveTrace[]) {
    moveHistoryRef.current = next;
    setMoveHistory(next);
  }

  function finish(outcome: string, finalMistakes = mistakes, finalHistory = moveHistoryRef.current) {
    setStarted(false);
    setThinking(false);
    setTurnStartedAt(null);
    const failed = outcome !== "victory";
    const reportedMistakes = outcome === "victory" ? 0 : finalMistakes;
    const label = outcome === "victory" ? "You won. Activity completed. Submit the assignment when all activities are done." : outcome === "timeout" ? "Time is over. This activity is 0 points." : outcome === "failed_attempts" ? "5 wrong attempts used. This activity is 0 points." : "Computer won. This activity is 0 points.";
    setOutcome(outcome);
    if (outcome === "victory") setMistakes(0);
    setStatus(label);
    const result = {
      solved: outcome === "victory",
      failed,
      outcome,
      mistakes: reportedMistakes,
      hintsUsed: 0,
      timeTakenSeconds: elapsedSeconds,
      moveHistory: finalHistory,
    };
    onResult(result);
  }

  function checkFinished(finalHistory = moveHistoryRef.current) {
    const game = gameRef.current;
    if (!game.isGameOver()) return false;
    if (game.isCheckmate()) {
      const winner = game.turn() === "w" ? "black" : "white";
      finish(winner === playerSide ? "victory" : "defeat", mistakes, finalHistory);
      return true;
    }
    finish("draw", mistakes, finalHistory);
    return true;
  }

  function requestComputerMove() {
    if (gameRef.current.turn() !== computerTurn || gameRef.current.isGameOver()) return;
    setThinking(true);
    const legal = gameRef.current.moves({ verbose: true }) as any[];
    const fallback = () => {
      if (!legal.length || gameRef.current.turn() !== computerTurn) return;
      const move = legal[Math.floor(Math.random() * legal.length)];
      applyComputerMove({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    };
    fallbackTimerRef.current = window.setTimeout(fallback, 3500);
    const worker = workerRef.current;
    if (!worker) return;
    worker.postMessage("setoption name UCI_LimitStrength value true");
    worker.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, level * 2 - 1))}`);
    worker.postMessage(`position fen ${gameRef.current.fen()}`);
    worker.postMessage(`go depth ${depth}`);
  }

  function applyComputerMove(moveInput: { from: string; to: string; promotion?: string }) {
    try {
      commitClock();
      const move = gameRef.current.move(moveInput);
      if (!move) return;
      const nextHistory: MoveTrace[] = [...moveHistoryRef.current, { moveNumber: moveHistoryRef.current.length + 1, by: "computer", san: move.san, from: move.from, to: move.to, note: "Computer move" }];
      setRecordedHistory(nextHistory);
      setPosition(gameRef.current.fen());
      setThinking(false);
      setStatus("Your turn.");
      if (!checkFinished(nextHistory)) setTurnStartedAt(clockEnabled ? Date.now() : null);
    } catch {
      setThinking(false);
    }
  }

  function startGame() {
    if (activityFinished) return;
    const game = buildGame(computer.fen || activity.fen || startFen);
    gameRef.current = game;
    setPosition(game.fen());
    setMistakes(0);
    setOutcome("");
    setRecordedHistory([]);
    setStarted(true);
    setThinking(false);
    setStartedAt(Date.now());
    setTurnStartedAt(clockEnabled ? Date.now() : null);
    setWhiteClockMs(startClockMs);
    setBlackClockMs(startClockMs);
    setStatus(playerSide === "white" ? "Your turn." : "Computer starts.");
    onResult({ solved: false, mistakes: 0, hintsUsed: 0, timeTakenSeconds: 0, moveHistory: [] });
    if (playerSide === "black") window.setTimeout(requestComputerMove, 250);
  }

  function commitMove(source: string, target: string, promotion: PromotionPiece = "q") {
    if (locked || !isPlayerTurn) return false;
    try {
      commitClock();
      const move = gameRef.current.move({ from: source, to: target, promotion });
      if (!move) throw new Error("Illegal move");
      setSelectedSquare(null);
      const nextHistory: MoveTrace[] = [...moveHistoryRef.current, { moveNumber: moveHistoryRef.current.length + 1, by: "student", san: move.san, from: move.from, to: move.to, note: "Student move" }];
      setRecordedHistory(nextHistory);
      setPosition(gameRef.current.fen());
      setStatus("Computer thinking...");
      if (!checkFinished(nextHistory)) {
        setTurnStartedAt(clockEnabled ? Date.now() : null);
        window.setTimeout(requestComputerMove, 200);
      }
      return true;
    } catch {
      const nextMistakes = mistakes + 1;
      setMistakes(nextMistakes);
      setStatus(nextMistakes >= 5 ? "5 wrong attempts used. This activity failed." : `Illegal move. ${5 - nextMistakes} wrong attempts left.`);
      onResult({ solved: false, failed: false, outcome: "in_progress", mistakes: nextMistakes, hintsUsed: 0, timeTakenSeconds: elapsedSeconds, moveHistory: moveHistoryRef.current });
      if (nextMistakes >= 5) finish("failed_attempts", nextMistakes, moveHistoryRef.current);
      return false;
    }
  }

  function onDrop(source: string, target: string) {
    return commitMove(source, target);
  }

  function onPromotionPieceSelect(piece?: string, from?: string, to?: string) {
    const promotion = promotionFromBoardPiece(piece);
    const move = from && to ? { from, to } : pendingPromotion;
    setPendingPromotion(null);
    if (!promotion || !move) return false;
    return commitMove(move.from, move.to, promotion);
  }

  function onSquareClick(square: string) {
    if (locked || !isPlayerTurn) return;
    const clickedPiece = gameRef.current.get(square as any);
    if (selectedSquare && selectedSquare !== square) {
      if (isPromotionMove(gameRef.current, selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
      if (commitMove(selectedSquare, square)) return;
    }
    if (selectedSquare === square) return setSelectedSquare(null);
    if (clickedPiece && clickedPiece.color === playerTurn) setSelectedSquare(square);
    else setSelectedSquare(null);
  }

  const moveTargets = useMemo(() => {
    if (!selectedSquare || !isPlayerTurn) return [];
    return legalTargetsFromGame(gameRef.current, selectedSquare);
  }, [selectedSquare, isPlayerTurn, position]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedSquare), [moveTargets, selectedSquare]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-brand-900/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700"><Bot size={14} /> Assignment bot</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">Level {minLevel}-{maxLevel}, you play {playerSide}. {clockEnabled ? `Clock ${timeControl.minutes}+${timeControl.increment || 0}` : "No clock"}.</div>
        </div>
        {activityFinished ? (
          <span className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-black ${activityWon ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {activityWon ? "Activity complete" : "Activity marked 0"}
          </span>
        ) : (
          <button type="button" disabled={locked || started} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-black text-white disabled:bg-slate-300" onClick={startGame}><Play size={14} /> Start</button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,420px)_minmax(0,1fr)]">
        <div className="rounded-lg bg-[#31210f] p-2">
          <AssignmentChessboard
            maxWidth={400}
            position={position}
            boardOrientation={playerSide}
            arePiecesDraggable={started && isPlayerTurn}
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick as any}
            onPromotionPieceSelect={onPromotionPieceSelect as any}
            showPromotionDialog={!!pendingPromotion}
            promotionToSquare={pendingPromotion?.to as any}
            promotionDialogVariant="modal"
            customSquareStyles={moveHintStyles as any}
            customDarkSquareStyle={{ backgroundColor: "#b58863" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-lg border px-3 py-2 ${gameRef.current.turn() === "w" && started ? "border-brand bg-brand/5" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-xs font-bold uppercase text-slate-500">White</div>
              <div className="font-black text-slate-950">{playerSide === "white" ? "You" : "Computer"}</div>
              <div className="text-sm font-bold text-brand">{formatClock(displayedClock("w"))}</div>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${gameRef.current.turn() === "b" && started ? "border-brand bg-brand/5" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-xs font-bold uppercase text-slate-500">Black</div>
              <div className="font-black text-slate-950">{playerSide === "black" ? "You" : "Computer"}</div>
              <div className="text-sm font-bold text-brand">{formatClock(displayedClock("b"))}</div>
            </div>
          </div>
          <div className={`rounded-lg px-3 py-2 text-sm font-bold ${status.includes("won") ? "bg-emerald-50 text-emerald-700" : status.includes("failed") || status.includes("over") || status.includes("Computer won") ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"}`}>
            {thinking ? "Computer thinking..." : status}
          </div>
          {!activityWon && <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>{activityFinished ? "Final wrong attempts" : "Wrong attempts"}</span><span>{mistakes}/5</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-red-500" style={{ width: `${Math.min(100, mistakes * 20)}%` }} />
            </div>
          </div>}
          <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
            {!moveHistory.length && <div className="px-2 py-4 text-center text-slate-500">No moves yet.</div>}
            {moveHistory.map((move) => (
              <div key={move.moveNumber} className="flex flex-wrap gap-2 rounded-md bg-white px-2 py-1.5">
                <span className="font-black text-slate-500">{move.moveNumber}</span>
                <span className="font-semibold text-slate-950">{move.san}</span>
                <span className="text-xs uppercase text-slate-400">{move.by}</span>
                <span className="text-xs text-slate-500">{move.from} to {move.to}</span>
              </div>
            ))}
          </div>
          {started && <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700" onClick={() => finish("resigned")}><Flag size={14} /> Resign</button>}
        </div>
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
  const boardFen = previewFen(fen);
  if (!boardFen) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">This position could not be shown on the board.</div>;
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="mx-auto w-full max-w-[278px]">
        <AssignmentChessboard
          maxWidth={260}
          position={boardFen}
          arePiecesDraggable={false}
          customDarkSquareStyle={{ backgroundColor: "#b58863" }}
          customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/10 px-3 py-2">
      <div className="text-sm font-black text-accent">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">{label}</div>
    </div>
  );
}
