"use client";

import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((module) => module.Chessboard), { ssr: false });

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type PgnMove = {
  san: string;
  from: string;
  to: string;
  piece: string;
  color: "w" | "b";
  captured?: string;
  promotion?: string;
  flags?: string;
  before?: string;
};

type MoveRow = {
  number: number;
  white?: PgnMove;
  black?: PgnMove;
  whitePly?: number;
  blackPly?: number;
};

function pgnFen(pgn?: string) {
  return pgn?.match(/\[FEN\s+"([^"]+)"\]/)?.[1] || "start";
}

function pgnHeader(pgn: string | undefined, key: string) {
  return pgn?.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`))?.[1] || "";
}

function pieceName(piece?: string) {
  const names: Record<string, string> = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };
  return piece ? names[piece.toLowerCase()] || piece.toUpperCase() : "Move";
}

function moveNote(move?: PgnMove) {
  if (!move) return "";
  const notes = [`${pieceName(move.piece)} ${move.from}-${move.to}`];
  if (move.captured) notes.push(`captures ${pieceName(move.captured).toLowerCase()}`);
  if (move.promotion) notes.push(`promotes to ${pieceName(move.promotion).toLowerCase()}`);
  if (move.san.includes("+")) notes.push("check");
  if (move.san.includes("#")) notes.push("mate");
  return notes.join(" · ");
}

function parsePgn(pgn?: string, fallbackFen?: string) {
  const fen = pgnHeader(pgn, "FEN") || fallbackFen || "";
  if (!pgn) return { valid: true, start: fen || startFen, final: fen || startFen, moves: [] as PgnMove[] };

  const game = new Chess();
  try {
    game.loadPgn(pgn);
    const moves = game.history({ verbose: true }) as PgnMove[];
    const headers = game.header();
    const start = moves[0]?.before || headers.FEN || startFen;
    return { valid: true, start, final: game.fen(), moves };
  } catch {
    return { valid: false, start: fen || startFen, final: fen || startFen, moves: [] as PgnMove[] };
  }
}

function replayPosition(start: string, moves: PgnMove[], ply: number) {
  if (!moves.length) return start;
  try {
    const game = new Chess(start);
    moves.slice(0, ply).forEach((move) => game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" }));
    return game.fen();
  } catch {
    return start;
  }
}

function buildRows(moves: PgnMove[]) {
  const rows: MoveRow[] = [];
  moves.forEach((move, index) => {
    const rowIndex = Math.floor(index / 2);
    if (!rows[rowIndex]) rows[rowIndex] = { number: rowIndex + 1 };
    if (index % 2 === 0) {
      rows[rowIndex].white = move;
      rows[rowIndex].whitePly = index + 1;
    } else {
      rows[rowIndex].black = move;
      rows[rowIndex].blackPly = index + 1;
    }
  });
  return rows;
}

export default function SessionResourceReview({ resources }: { resources: any[] }) {
  const normalized = useMemo(
    () => resources.map((resource, index) => ({
      ...resource,
      key: resource.loadedAt || `${resource.title}-${index}`,
      fen: resource.fen || pgnFen(resource.pgn),
    })),
    [resources]
  );
  const [active, setActive] = useState(0);
  const [ply, setPly] = useState(0);
  useEffect(() => {
    setPly(0);
  }, [active]);

  if (!normalized.length) {
    return <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No PGN or custom board was recorded for this session.</div>;
  }
  const selected = normalized[Math.min(active, normalized.length - 1)];
  const parsed = parsePgn(selected.pgn, selected.fen === "start" ? "" : selected.fen);
  const moveRows = buildRows(parsed.moves);
  const boardPosition = parsed.moves.length ? replayPosition(parsed.start, parsed.moves, ply) : selected.fen || parsed.final || "start";
  const activeMove = ply > 0 ? parsed.moves[ply - 1] : null;
  const headers = [
    ["Event", pgnHeader(selected.pgn, "Event")],
    ["Date", pgnHeader(selected.pgn, "Date")],
    ["Result", pgnHeader(selected.pgn, "Result")],
    ["Opening", pgnHeader(selected.pgn, "Opening")],
  ].filter(([, value]) => value);
  const goTo = (nextPly: number) => setPly(Math.max(0, Math.min(parsed.moves.length, nextPly)));

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-2">
        {normalized.map((resource, index) => (
          <button
            key={resource.key}
            type="button"
            onClick={() => setActive(index)}
            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${index === active ? "border-brand bg-brand/5 text-brand" : "border-slate-200 bg-white text-slate-700"}`}
          >
            <div className="truncate font-bold">{resource.title || `Board ${index + 1}`}</div>
            <div className="mt-0.5 text-xs capitalize text-slate-500">{resource.type || "position"}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[420px] space-y-3">
          <Chessboard
            id={`session-resource-${selected.key}`}
            position={boardPosition}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: "#b9875f" }}
            customLightSquareStyle={{ backgroundColor: "#f1d9aa" }}
          />
          {parsed.moves.length ? (
            <div className="flex items-center justify-center gap-2">
              <MoveNavButton onClick={() => goTo(0)} disabled={ply === 0} label="First"><ChevronsLeft size={15} /></MoveNavButton>
              <MoveNavButton onClick={() => goTo(ply - 1)} disabled={ply === 0} label="Previous"><ChevronLeft size={15} /></MoveNavButton>
              <span className="min-w-20 text-center text-xs font-bold text-slate-500">{ply}/{parsed.moves.length}</span>
              <MoveNavButton onClick={() => goTo(ply + 1)} disabled={ply === parsed.moves.length} label="Next"><ChevronRight size={15} /></MoveNavButton>
              <MoveNavButton onClick={() => goTo(parsed.moves.length)} disabled={ply === parsed.moves.length} label="Last"><ChevronsRight size={15} /></MoveNavButton>
            </div>
          ) : null}
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-slate-950 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-950">{selected.title || "Classroom board"}</div>
              <div className="mt-1 text-xs capitalize text-slate-500">{selected.type || "position"} · {parsed.moves.length ? `${parsed.moves.length} moves recorded` : "Saved board position"}</div>
            </div>
            {activeMove ? <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">{activeMove.color === "w" ? "White" : "Black"}: {activeMove.san}</span> : null}
          </div>

          {headers.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {headers.map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="mt-0.5 truncate text-xs font-bold text-slate-700" title={value}>{value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {parsed.moves.length ? (
            <>
              <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Selected Move</div>
                <div className="mt-1 text-sm font-bold text-slate-800">{activeMove ? moveNote(activeMove) : "Starting position"}</div>
              </div>
              <div className="mt-4 max-h-72 overflow-y-auto pr-1">
                <div className="grid gap-1 text-sm">
                  {moveRows.map((row) => (
                    <div key={row.number} className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-1">
                      <span className="pt-1 text-xs font-bold text-slate-400">{row.number}.</span>
                      <MoveButton move={row.white} active={ply === row.whitePly} onClick={() => row.whitePly && goTo(row.whitePly)} />
                      <MoveButton move={row.black} active={ply === row.blackPly} onClick={() => row.blackPly && goTo(row.blackPly)} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-bold text-slate-900">No move list was saved for this item.</div>
              <div className="mt-1 text-xs leading-5">This class record contains a board position only, so students and coaches will see the saved position instead of raw PGN text.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MoveNavButton({ children, disabled, label, onClick }: { children: ReactNode; disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
    >
      {children}
    </button>
  );
}

function MoveButton({ move, active, onClick }: { move?: PgnMove; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!move}
      title={move ? moveNote(move) : undefined}
      className={[
        "min-h-10 rounded-lg px-2 py-1 text-left transition",
        move ? "hover:bg-purple-50" : "cursor-default",
        active ? "bg-purple-700 text-white hover:bg-purple-700" : "text-slate-800",
      ].join(" ")}
    >
      {move ? (
        <>
          <span className="block truncate text-xs font-black">{move.san}</span>
          <span className={`block truncate text-[10px] ${active ? "text-purple-100" : "text-slate-500"}`}>{pieceName(move.piece)} · {move.from}-{move.to}</span>
        </>
      ) : null}
    </button>
  );
}
