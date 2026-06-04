"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Brain, CheckCircle2, Clock, FileQuestion, Gamepad2, Target } from "lucide-react";
import PuzzleBoard from "@/components/quiz/PuzzleBoard";

const activityMeta: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  solve_position: { label: "Solve Position", icon: <Target size={16} />, tone: "bg-purple-50 text-purple-700" },
  quiz: { label: "Quiz", icon: <FileQuestion size={16} />, tone: "bg-amber-50 text-amber-700" },
  play_computer: { label: "Play With Computer", icon: <Gamepad2 size={16} />, tone: "bg-emerald-50 text-emerald-700" },
  find_best_move: { label: "Find Best Move", icon: <Target size={16} />, tone: "bg-purple-50 text-purple-700" },
  find_combination: { label: "Find Combination", icon: <Target size={16} />, tone: "bg-indigo-50 text-indigo-700" },
  study_pgn: { label: "Study PGN", icon: <BookOpen size={16} />, tone: "bg-sky-50 text-sky-700" },
  analyze_position: { label: "Analyze Position", icon: <Brain size={16} />, tone: "bg-slate-100 text-slate-700" },
  endgame_practice: { label: "Endgame Practice", icon: <Gamepad2 size={16} />, tone: "bg-emerald-50 text-emerald-700" },
  opening_practice: { label: "Opening Practice", icon: <BookOpen size={16} />, tone: "bg-sky-50 text-sky-700" },
};

export default function HomeworkAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const [hw, setHw] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch(`/api/homework/${id}`).then((r) => r.json()).then(setHw).catch(() => {});
  }, [id]);

  const activities = useMemo(() => {
    if (hw?.activities?.length) return hw.activities;
    return (hw?.puzzles || []).map((puzzle: any, index: number) => ({
      _id: puzzle._id,
      type: "solve_position",
      title: `Puzzle ${index + 1}`,
      instructions: puzzle.prompt,
      fen: puzzle.fen,
      solution: puzzle.solution,
      points: puzzle.points,
      difficulty: "beginner",
    }));
  }, [hw]);

  if (!hw) return <div className="rounded-2xl border bg-white p-5 text-slate-600 shadow-sm">Loading assignment...</div>;

  async function submit() {
    const payload = { answers: Object.entries(answers).map(([puzzleId, moves]) => ({ puzzleId, moves })), quizAnswers };
    const res = await fetch(`/api/homework/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return toast.error("Failed to submit");
    const sub = await res.json();
    toast.success(`Submitted! Score: ${sub.totalScore}`);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <header className="mb-5 rounded-3xl bg-brand p-5 text-white shadow-xl shadow-brand-900/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Assignment</div>
            <h1 className="mt-1 text-3xl font-black">{hw.title}</h1>
            {hw.description && <p className="mt-2 max-w-3xl text-sm text-white/75">{hw.description}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Activities" value={activities.length} />
            <MiniStat label="Points" value={activities.reduce((sum: number, item: any) => sum + (Number(item.points) || 0), 0)} />
            <MiniStat label="Due" value={hw.dueAt ? new Date(hw.dueAt).toLocaleDateString("en-IN") : "Open"} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {activities.map((activity: any, index: number) => (
          <ActivityCard
            key={activity._id || `${activity.type}-${index}`}
            activity={activity}
            index={index}
            onSolved={() => setAnswers((current) => ({ ...current, [activity._id]: Array.isArray(activity.solution) ? activity.solution : [] }))}
            quizAnswers={quizAnswers[activity._id] || []}
            setQuizAnswers={(values) => setQuizAnswers((current) => ({ ...current, [activity._id]: values }))}
          />
        ))}
      </div>

      <div className="sticky bottom-4 mt-5 flex justify-end">
        <button onClick={submit} className="rounded-xl bg-brand px-5 py-3 text-sm font-black text-white shadow-xl shadow-brand-900/20">
          Submit assignment
        </button>
      </div>
    </div>
  );
}

function ActivityCard({
  activity,
  index,
  onSolved,
  quizAnswers,
  setQuizAnswers,
}: {
  activity: any;
  index: number;
  onSolved: () => void;
  quizAnswers: string[];
  setQuizAnswers: (values: string[]) => void;
}) {
  const meta = activityMeta[activity.type] || activityMeta.solve_position;
  const solution = Array.isArray(activity.solution) ? activity.solution : [];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${meta.tone}`}>{meta.icon}{meta.label}</span>
          <h2 className="mt-2 text-xl font-black text-brand">{activity.title || `Activity ${index + 1}`}</h2>
          {activity.instructions && <p className="mt-1 text-sm text-slate-600">{activity.instructions}</p>}
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-accent/30 px-3 py-1 text-brand">{activity.points || 0} pts</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{activity.difficulty || "beginner"}</span>
          {!!activity.timeLimitMinutes && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-600"><Clock size={12} /> {activity.timeLimitMinutes}m</span>}
        </div>
      </div>

      {["solve_position", "find_best_move", "find_combination"].includes(activity.type) && (
        <div className="space-y-4">
          {(activity.items?.length ? activity.items : [{ title: activity.title, fen: activity.fen, solution }]).map((item: any, itemIndex: number) => (
            <div key={item.id || itemIndex} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <b className="text-brand">{item.title || `Position ${itemIndex + 1}`}</b>
                <span className="rounded-full bg-accent/30 px-2 py-1 text-xs font-bold text-brand">{item.points ?? activity.points ?? 1} pts</span>
              </div>
              {item.fen && <PuzzleBoard fen={item.fen} solution={Array.isArray(item.solution) ? item.solution : []} onSolved={onSolved} />}
            </div>
          ))}
        </div>
      )}

      {activity.type === "quiz" && <QuizActivity activity={activity} quizAnswers={quizAnswers} setQuizAnswers={setQuizAnswers} />}
      {["play_computer", "endgame_practice", "opening_practice"].includes(activity.type) && <ComputerActivity activity={activity} />}
      {activity.type === "study_pgn" && <PgnStudy activity={activity} />}
      {activity.type === "analyze_position" && <AnalyzeActivity activity={activity} />}
    </section>
  );
}

function QuizActivity({ activity, quizAnswers, setQuizAnswers }: { activity: any; quizAnswers: string[]; setQuizAnswers: (values: string[]) => void }) {
  const items = activity.items?.length ? activity.items : [activity.quiz || {}];
  function toggle(questionId: string, optionId: string, multiple: boolean) {
    const id = `${questionId}:${optionId}`;
    if (multiple) setQuizAnswers(quizAnswers.includes(id) ? quizAnswers.filter((item) => item !== id) : [...quizAnswers, id]);
    else setQuizAnswers([...quizAnswers.filter((item) => !item.startsWith(`${questionId}:`)), id]);
  }
  return (
    <div className="space-y-3">
      {items.map((quiz: any, index: number) => {
        const questionId = quiz.id || `question-${index}`;
        const multiple = Boolean(quiz.multipleCorrect);
        return (
          <div key={questionId} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <b className="text-brand">{quiz.title || `Question ${index + 1}`}</b>
              <span className="rounded-full bg-accent/30 px-2 py-1 text-xs font-bold text-brand">{quiz.points || 1} pts</span>
            </div>
            {quiz.positionFen && <FenBox fen={quiz.positionFen} />}
            <div className="mt-2 rounded-xl bg-slate-50 p-4 font-semibold text-slate-900">{quiz.question || "Answer the question."}</div>
            <div className="mt-2 grid gap-2">
              {(quiz.options || []).map((option: any) => {
                const answerId = `${questionId}:${option.id}`;
                return (
                  <label key={option.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold">
                    <input type={multiple ? "checkbox" : "radio"} checked={quizAnswers.includes(answerId)} onChange={() => toggle(questionId, option.id, multiple)} />
                    {option.text}
                  </label>
                );
              })}
            </div>
            {quiz.explanation && <p className="mt-2 rounded-xl bg-accent/20 p-3 text-sm text-brand">{quiz.explanation}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ComputerActivity({ activity }: { activity: any }) {
  const computer = activity.computer || {};
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {activity.fen && <FenBox fen={activity.fen} />}
      <InfoGrid
        items={[
          ["Strength", `${computer.strength || "Beginner"}${computer.rating ? ` (${computer.rating})` : ""}`],
          ["Side", computer.side || "white"],
          ["Objective", computer.objective || "Win the Game"],
          ["Time", computer.timeControl?.type === "untimed" ? "Untimed" : `${computer.timeControl?.minutes || 0}+${computer.timeControl?.increment || 0}`],
          ["Completion", computer.completion || "Game Finished"],
          ["Moves", computer.requiredMoves ? String(computer.requiredMoves) : "Any"],
        ]}
      />
      <div className="md:col-span-2 rounded-xl border border-dashed border-brand/25 bg-brand/5 p-4 text-sm text-slate-600">
        <CheckCircle2 className="mb-2 text-brand" size={18} />
        This activity is configured for computer practice. The game board/runtime can be connected next to launch directly from here.
      </div>
    </div>
  );
}

function PgnStudy({ activity }: { activity: any }) {
  const items = activity.items?.length ? activity.items : [{ pgnTitle: activity.pgnTitle, pgn: activity.pgn, source: activity.source }];
  return (
    <div className="space-y-3">
      {items.map((item: any, index: number) => (
        <div key={item.id || index} className="rounded-xl border border-slate-200 p-3">
          <InfoGrid items={[["PGN", item.pgnTitle || item.title || `PGN ${index + 1}`], ["Source", item.source?.folder || "Library"], ["Task", "Review and study"]]} />
          <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-white">{item.pgn || "No PGN text attached."}</pre>
        </div>
      ))}
    </div>
  );
}

function AnalyzeActivity({ activity }: { activity: any }) {
  return (
    <div className="space-y-3">
      {activity.fen && <FenBox fen={activity.fen} />}
      <textarea className="input h-28 resize-none" placeholder="Write your evaluation, candidate moves, and plan..." />
    </div>
  );
}

function FenBox({ fen }: { fen: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">{fen}</div>;
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">{label}</span>
          <b className="text-right text-slate-900">{value}</b>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3">
      <div className="text-lg font-black text-accent">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">{label}</div>
    </div>
  );
}
