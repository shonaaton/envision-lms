"use client";

import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AssignmentChessboard from "@/components/homework/AssignmentChessboard";
import { normalizePermissiveFen } from "@/lib/pgnLibrary";

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type TraceEntry = {
  moveNumber?: number;
  by?: string;
  san?: string;
  from?: string;
  to?: string;
  note?: string;
};

function normalizeFen(value?: string | null) {
  if (!value || value === "start") return "";
  return normalizePermissiveFen(value) || String(value).trim();
}

function buildGame(fen?: string) {
  try {
    if (fen && fen !== "start") return new Chess(fen);
  } catch {
    const normalizedFen = normalizeFen(fen);
    if (normalizedFen) {
      try {
        const chess = new Chess();
        chess.load(normalizedFen, { skipValidation: true });
        return chess;
      } catch {
        // Fall back to a normal starting board.
      }
    }
  }
  return new Chess();
}

function replayPosition(start: string, history: TraceEntry[], step: number) {
  const game = buildGame(start);
  for (const entry of history.slice(0, step)) {
    if (entry.by !== "student" && entry.by !== "computer") continue;
    if (!entry.from || !entry.to) continue;
    try {
      game.move({ from: entry.from, to: entry.to, promotion: "q" });
    } catch {
      // Keep replaying valid moves even if an older record contains a bad one.
    }
  }
  return game.fen();
}

function squareStyles(entry?: TraceEntry) {
  if (!entry?.from || !entry?.to) return {};
  const color = entry.by === "student" ? "rgba(16,185,129,0.35)" : "rgba(59,130,246,0.35)";
  return {
    [entry.from]: { backgroundColor: color },
    [entry.to]: { backgroundColor: color },
  };
}

export default function HomeworkComputerReviewBoard({ activity, result }: { activity: any; result: any }) {
  const history = useMemo(() => (Array.isArray(result?.moveHistory) ? result.moveHistory : []) as TraceEntry[], [result]);
  const start = String(activity?.computer?.fen || activity?.fen || startFen);
  const side = activity?.computer?.side === "black" ? "black" : "white";
  const [step, setStep] = useState(history.length);
  const won = Boolean(result?.solved || result?.outcome === "victory");
  const activeEntry = step > 0 ? history[step - 1] : undefined;
  const position = useMemo(() => replayPosition(start, history, step), [start, history, step]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="rounded-lg bg-[#31210f] p-2">
          <AssignmentChessboard
            maxWidth={300}
            position={position}
            boardOrientation={side}
            arePiecesDraggable={false}
            customSquareStyles={squareStyles(activeEntry)}
            customDarkSquareStyle={{ backgroundColor: "#b58863" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-700 disabled:opacity-40" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} aria-label="Previous move">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center text-xs font-bold text-slate-600">
            Move {step} of {history.length}
            <div className="font-semibold text-slate-500">{activeEntry?.san || "Starting position"}</div>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-700 disabled:opacity-40" onClick={() => setStep((value) => Math.min(history.length, value + 1))} disabled={step >= history.length} aria-label="Next move">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Game Result</div>
          <div className="mt-1 font-semibold text-slate-950">{result?.outcome ? String(result.outcome).replaceAll("_", " ") : "No result recorded"}</div>
          <div className="mt-1 break-words font-mono text-xs text-slate-500">{start}</div>
        </div>
        <div className={`grid gap-2 text-center text-xs font-bold ${won ? "grid-cols-2" : "grid-cols-3"}`}>
          <div className="rounded-lg border border-slate-200 bg-white px-2 py-2"><div className="text-brand">{result?.solved ? "Won" : "0 pts"}</div><div className="text-slate-500">Score</div></div>
          {!won && <div className="rounded-lg border border-slate-200 bg-white px-2 py-2"><div className="text-brand">{result?.mistakes || 0}</div><div className="text-slate-500">Wrong</div></div>}
          <div className="rounded-lg border border-slate-200 bg-white px-2 py-2"><div className="text-brand">{result?.timeTakenSeconds || 0}s</div><div className="text-slate-500">Time</div></div>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {!history.length && <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">No moves were stored for this computer game.</div>}
          {history.map((entry, index) => (
            <button
              key={`${entry.by || "move"}-${index}`}
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${step === index + 1 ? "border-brand bg-brand/5" : "border-slate-200 bg-white"}`}
              onClick={() => setStep(index + 1)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{entry.moveNumber || index + 1}</span>
                <span className="font-black text-slate-950">{entry.san || "Move"}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{entry.by || "move"}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {entry.from && entry.to ? `${entry.from} to ${entry.to}` : "No square movement recorded"}
                {entry.note ? ` - ${entry.note}` : ""}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
