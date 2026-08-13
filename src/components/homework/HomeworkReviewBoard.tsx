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

function extractHeader(pgn: string, name: string) {
  return pgn.match(new RegExp(`\\[${name}\\s+"([^"]+)"\\]`))?.[1];
}

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
        // Fall back to the starting board.
      }
    }
  }
  return new Chess();
}

function parseExpectedLine(pgn: string) {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const moves = game.history({ verbose: true }) as any[];
    return {
      start: moves[0]?.before || extractHeader(pgn, "FEN") || startFen,
      moves: moves.map((move) => move.san),
    };
  } catch {
    return { start: normalizeFen(extractHeader(pgn, "FEN")) || startFen, moves: [] as string[] };
  }
}

function replayPosition(start: string, history: TraceEntry[], step: number) {
  const game = buildGame(start);
  const visible = history.slice(0, step);
  for (const entry of visible) {
    if (entry.by !== "student" && entry.by !== "auto") continue;
    if (!entry.from || !entry.to) continue;
    if (entry.note?.toLowerCase().includes("incorrect")) continue;
    try {
      const moved = game.move({ from: entry.from, to: entry.to, promotion: "q" });
      if (!moved) continue;
    } catch {
      // Incorrect attempts are stored for review, but they do not advance the actual line.
    }
  }
  return game.fen();
}

function squareStyles(entry?: TraceEntry) {
  if (!entry?.from || !entry?.to) return {};
  const color = entry.note?.toLowerCase().includes("incorrect") ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)";
  return {
    [entry.from]: { backgroundColor: color },
    [entry.to]: { backgroundColor: color },
  };
}

export default function HomeworkReviewBoard({
  item,
  result,
}: {
  item: any;
  result: any;
}) {
  const history = useMemo(() => (Array.isArray(result?.moveHistory) ? result.moveHistory : []) as TraceEntry[], [result]);
  const parsed = useMemo(() => parseExpectedLine(String(item?.pgn || "")), [item?.pgn]);
  const [step, setStep] = useState(history.length ? history.length : 0);
  const activeEntry = step > 0 ? history[step - 1] : undefined;
  const position = useMemo(() => replayPosition(parsed.start, history, step), [parsed.start, history, step]);
  const expectedPreview = parsed.moves.length ? parsed.moves.join(" ") : "No expected line found";

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="rounded-lg bg-[#31210f] p-2">
          <AssignmentChessboard
            maxWidth={300}
            position={position}
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
            <div className="font-semibold text-slate-500">{activeEntry?.san || activeEntry?.note || "Starting position"}</div>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-700 disabled:opacity-40" onClick={() => setStep((value) => Math.min(history.length, value + 1))} disabled={step >= history.length} aria-label="Next move">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">Position</div>
          <div className="mt-1 font-semibold text-slate-950">{item?.title || item?.pgnTitle || "Board question"}</div>
          <div className="mt-1 break-words font-mono text-xs text-slate-500">{parsed.start}</div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <b>Expected line:</b> {expectedPreview}
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {!history.length && <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">No student moves were stored for this item.</div>}
          {history.map((entry, index) => (
            <button
              key={`${entry.by || "move"}-${index}`}
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${step === index + 1 ? "border-brand bg-brand/5" : "border-slate-200 bg-white"}`}
              onClick={() => setStep(index + 1)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{entry.moveNumber || index + 1}</span>
                <span className="font-black text-slate-950">{entry.san || entry.note || "Action"}</span>
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
