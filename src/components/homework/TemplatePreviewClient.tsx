"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { CheckCircle2, ChevronLeft, ChevronRight, Edit3, FileQuestion, FileText, Gamepad2 } from "lucide-react";
import { normalizePermissiveFen } from "@/lib/pgnLibrary";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });
const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function key(activityId: string, itemId: string) {
  return `${activityId}:${itemId}`;
}

function itemFen(item: any) {
  return String(item?.positionFen || item?.fen || "").trim();
}

function previewFen(fen: string) {
  if (!fen || fen === "start") return startFen;
  try {
    return new Chess(fen).fen();
  } catch {
    const normalizedFen = normalizePermissiveFen(fen);
    if (normalizedFen) return normalizedFen;
  }
  return "";
}

function extractHeader(pgn: string, name: string) {
  return pgn.match(new RegExp(`\\[${name}\\s+"([^"]+)"\\]`))?.[1];
}

function parsePgn(pgn: string) {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const moves = game.history({ verbose: true }) as any[];
    return {
      start: moves[0]?.before || extractHeader(pgn, "FEN") || startFen,
      moves: moves.map((move) => ({ san: move.san, from: move.from, to: move.to, promotion: move.promotion || "q" })),
    };
  } catch {
    return { start: extractHeader(pgn, "FEN") || startFen, moves: [] };
  }
}

function buildGame(fen?: string) {
  try {
    return fen && fen !== "start" ? new Chess(fen) : new Chess();
  } catch {
    return new Chess();
  }
}

function activityLabel(activity: any) {
  if (activity.type === "quiz") return activity.source?.kind === "fen_mcq" ? "FEN + MCQ" : "MCQ";
  if (activity.type === "written_answer") return activity.source?.kind === "fen_written_answer" ? "FEN + Written" : "Written Answer";
  if (activity.type === "study_pgn") return "PGN Homework";
  if (activity.type === "play_computer") return "Play vs Computer";
  return String(activity.type || "Activity").replaceAll("_", " ");
}

export default function TemplatePreviewClient({ template }: { template: any }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const totals = useMemo(() => {
    let total = 0;
    let correct = 0;
    for (const activity of template.activities || []) {
      if (activity.type !== "quiz") continue;
      for (const item of activity.items || []) {
        total += 1;
        const selected = answers[key(activity._id || activity.title, item.id)];
        if ((item.options || []).some((option: any) => option.id === selected && option.correct)) correct += 1;
      }
    }
    return { total, correct };
  }, [answers, template.activities]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <header className="mb-3 rounded-xl bg-brand px-4 py-3 text-white shadow-lg shadow-brand-900/15">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Student Preview</div>
            <h1 className="mt-0.5 text-xl font-black">{template.title}</h1>
            <p className="mt-1 max-w-3xl text-xs text-white/75">{template.description || "Solve this template exactly like a student would see it."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/homework-templates/${template._id}/edit`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/20"><Edit3 size={14} /> Edit</Link>
            <button onClick={() => setChecked(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-black text-brand"><CheckCircle2 size={14} /> Check MCQs</button>
          </div>
        </div>
      </header>

      {checked && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          MCQ preview score: {totals.correct}/{totals.total}
        </div>
      )}

      <div className="space-y-4">
        {(template.activities || []).map((activity: any, activityIndex: number) => (
          <section key={activity._id || activityIndex} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-black text-purple-700">{activityIcon(activity)}{activityLabel(activity)}</span>
                <h2 className="mt-1.5 text-lg font-black text-brand">Activity {activityIndex + 1}: {activity.title}</h2>
                {activity.instructions && <p className="mt-0.5 text-xs text-slate-600">{activity.instructions}</p>}
              </div>
              <span className="rounded-full bg-accent/30 px-3 py-1 text-xs font-bold text-brand">{activity.points || 0} pts</span>
            </div>
            {activity.type === "quiz" && <QuizPreview activity={activity} answers={answers} setAnswers={setAnswers} checked={checked} />}
            {activity.type === "written_answer" && <WrittenPreview activity={activity} />}
            {activity.type === "study_pgn" && <PgnPreview activity={activity} />}
            {activity.type === "play_computer" && <ComputerPreview activity={activity} />}
          </section>
        ))}
      </div>
    </div>
  );
}

function activityIcon(activity: any) {
  if (activity.type === "quiz") return <FileQuestion size={16} />;
  if (activity.type === "written_answer") return <FileText size={16} />;
  return <Gamepad2 size={16} />;
}

function FenBox({ fen }: { fen: string }) {
  const boardFen = previewFen(fen);
  if (!boardFen) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">This position could not be shown on the board.</div>;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="mx-auto max-w-full overflow-hidden rounded-lg border border-slate-200" style={{ width: 260 }}>
        <Chessboard position={boardFen} arePiecesDraggable={false} boardWidth={260} customDarkSquareStyle={{ backgroundColor: "#b58863" }} customLightSquareStyle={{ backgroundColor: "#f0d9b5" }} />
      </div>
    </div>
  );
}

function QuizPreview({ activity, answers, setAnswers, checked }: { activity: any; answers: Record<string, string>; setAnswers: (next: Record<string, string>) => void; checked: boolean }) {
  const items = activity.items || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedKey, setSavedKey] = useState("");
  const item = items[Math.min(activeIndex, Math.max(0, items.length - 1))];
  if (!item) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">No questions were added for this activity.</div>;
  const answerKey = key(activity._id || activity.title, item.id);
  const selected = answers[answerKey] || "";
  const correct = (item.options || []).some((option: any) => option.id === selected && option.correct);
  const hasOptions = (item.options || []).length > 0;
  const submitLabel = activeIndex >= items.length - 1 ? (savedKey === answerKey ? "Answer Saved" : "Save Answer") : "Submit Answer";

  function submitAnswer() {
    if (!selected) return;
    if (activeIndex >= items.length - 1) {
      setSavedKey(answerKey);
      return;
    }
    setSavedKey("");
    setActiveIndex((value) => Math.min(items.length - 1, value + 1));
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm text-brand">Question {activeIndex + 1} of {items.length}</b>
        <div className="flex items-center gap-2">
          {checked && <span className={`rounded-full px-2 py-1 text-xs font-bold ${correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{correct ? "Correct" : "Review"}</span>}
          <button type="button" className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300" onClick={() => setActiveIndex((value) => Math.max(0, value - 1))} disabled={activeIndex === 0}>Previous</button>
        </div>
      </div>
      <div className={`grid gap-3 ${itemFen(item) ? "lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start" : ""}`}>
        {itemFen(item) && <FenBox fen={itemFen(item)} />}
        <div className="min-w-0">
          <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-900">{item.question}</div>
          <div className="mt-2 grid gap-2">
            {hasOptions ? (item.options || []).map((option: any) => (
              <label key={option.id} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm font-semibold ${selected === option.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                <input type="radio" checked={selected === option.id} onChange={() => {
                  setSavedKey("");
                  setAnswers({ ...answers, [answerKey]: option.id });
                }} />
                <span className="min-w-0">{option.text}</span>
              </label>
            )) : <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">No options were added for this MCQ.</div>}
          </div>
          <button
            type="button"
            disabled={!selected}
            onClick={submitAnswer}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function WrittenPreview({ activity }: { activity: any }) {
  return (
    <div className="space-y-3">
      {(activity.items || []).map((item: any, index: number) => (
        <div key={item.id || index} className="rounded-xl border border-slate-200 p-3">
          <b className="text-brand">Question {index + 1}</b>
          {itemFen(item) && <FenBox fen={itemFen(item)} />}
          <div className="mt-2 rounded-xl bg-slate-50 p-4 font-semibold text-slate-900">{item.question}</div>
          <textarea className="mt-3 min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-brand" placeholder="Type your answer here..." />
        </div>
      ))}
    </div>
  );
}

function PgnPreview({ activity }: { activity: any }) {
  return (
    <div className="space-y-4">
      {(activity.items || []).map((item: any, index: number) => <PgnBoard key={item.id || index} item={item} index={index} />)}
    </div>
  );
}

function PgnBoard({ item, index }: { item: any; index: number }) {
  const parsed = useMemo(() => parsePgn(item.pgn || ""), [item.pgn]);
  const [ply, setPly] = useState(0);
  const position = useMemo(() => {
    const game = buildGame(parsed.start);
    parsed.moves.slice(0, ply).forEach((move) => game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" }));
    return game.fen();
  }, [parsed, ply]);
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <b className="text-brand">{item.title || item.pgnTitle || `PGN ${index + 1}`}</b>
      <div className="mt-3 max-w-[360px]">
        <Chessboard position={position} arePiecesDraggable={false} boardWidth={320} customDarkSquareStyle={{ backgroundColor: "#b58863" }} customLightSquareStyle={{ backgroundColor: "#f0d9b5" }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={() => setPly((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /> Previous</button>
        <span className="text-sm font-bold text-slate-600">{ply}/{parsed.moves.length}</span>
        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={() => setPly((value) => Math.min(parsed.moves.length, value + 1))}>Next <ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

function ComputerPreview({ activity }: { activity: any }) {
  return <div className="rounded-xl border border-dashed border-brand/25 bg-brand/5 p-4 text-sm text-slate-700">Play vs Computer settings: {activity.computer?.strength || "Level 1-3"}, color {activity.computer?.side || "random"}.</div>;
}
