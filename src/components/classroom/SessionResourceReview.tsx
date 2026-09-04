"use client";

import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function cleanMoveList(value: any) {
  return Array.isArray(value) ? value.map((move) => String(move || "").trim()).filter(Boolean) : [];
}

function parseMoveList(moves: any, fallbackStartFen?: string, fallbackFinalFen?: string) {
  const rawMoves = cleanMoveList(moves);
  const start = fallbackStartFen && fallbackStartFen !== "start" ? fallbackStartFen : startFen;
  const final = fallbackFinalFen && fallbackFinalFen !== "start" ? fallbackFinalFen : start;
  if (!rawMoves.length) return { valid: true, start, final, moves: [] as PgnMove[], rawMoves };

  try {
    const game = new Chess(start);
    const parsedMoves: PgnMove[] = [];
    for (const moveText of rawMoves) {
      const move = game.move(moveText as any) as PgnMove | null;
      if (!move) break;
      parsedMoves.push(move);
    }
    return { valid: parsedMoves.length === rawMoves.length, start, final: parsedMoves.length ? game.fen() : final, moves: parsedMoves, rawMoves };
  } catch {
    return { valid: false, start, final, moves: [] as PgnMove[], rawMoves };
  }
}

function parseResource(resource: any) {
  const fallbackStartFen = resource?.startFen || resource?.liveStartFen || (resource?.fen === "start" ? "" : resource?.fen);
  // Moves that were actually played on this resource during the class win over the file it was loaded from.
  const liveMoves = cleanMoveList(resource?.liveMoves);
  if (liveMoves.length) {
    const played = parseMoveList(
      liveMoves,
      resource?.liveStartFen || fallbackStartFen,
      resource?.liveFinalFen || resource?.fen
    );
    if (played.moves.length || !resource?.pgn) return { ...played, classMoves: true };
  }
  if (resource?.pgn) return { ...parsePgn(resource.pgn, fallbackStartFen), rawMoves: [] as string[], classMoves: false };
  return { ...parseMoveList(resource?.moves || resource?.moveHistory, fallbackStartFen, resource?.fen), classMoves: false };
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

  const selected = normalized[Math.min(active, Math.max(normalized.length - 1, 0))];
  const parsed = selected ? parseResource(selected) : { valid: true, start: startFen, final: startFen, moves: [] as PgnMove[], rawMoves: [] as string[], classMoves: false };
  const boardPosition = parsed.moves.length ? replayPosition(parsed.start, parsed.moves, ply) : selected.fen || parsed.final || "start";
  const activeMove = ply > 0 ? parsed.moves[ply - 1] : null;
  const previousMove = ply > 1 ? parsed.moves[ply - 2] : null;
  const nextMove = ply < parsed.moves.length ? parsed.moves[ply] : null;
  const rawMoves = parsed.rawMoves || [];
  const recordedMoveCount = rawMoves.length || parsed.moves.length;
  const headers = [
    ["Event", pgnHeader(selected.pgn, "Event")],
    ["Date", pgnHeader(selected.pgn, "Date")],
    ["Result", pgnHeader(selected.pgn, "Result")],
    ["Opening", pgnHeader(selected.pgn, "Opening")],
  ].filter(([, value]) => value);
  const goTo = useCallback((nextPly: number) => setPly(Math.max(0, Math.min(parsed.moves.length, nextPly))), [parsed.moves.length]);
  const goToPgn = useCallback((nextIndex: number) => setActive(Math.max(0, Math.min(normalized.length - 1, nextIndex))), [normalized.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (event.key === "ArrowLeft" && parsed.moves.length) {
        event.preventDefault();
        goTo(ply - 1);
      }
      if (event.key === "ArrowRight" && parsed.moves.length) {
        event.preventDefault();
        goTo(ply + 1);
      }
      if (event.key === "ArrowUp" && normalized.length > 1) {
        event.preventDefault();
        goToPgn(active - 1);
      }
      if (event.key === "ArrowDown" && normalized.length > 1) {
        event.preventDefault();
        goToPgn(active + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, goTo, goToPgn, normalized.length, parsed.moves.length, ply]);

  if (!normalized.length || !selected) {
    return <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No PGN or custom board was recorded for this session.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">PGN Navigation</div>
            <div className="mt-1 truncate text-sm font-black text-slate-950">{selected.title || `Board ${active + 1}`}</div>
            <div className="mt-1 text-xs text-slate-500">
              PGN {active + 1} of {normalized.length} · {selected.type || "position"}
            </div>
          </div>
          {normalized.length > 1 ? (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <PagerButton onClick={() => goToPgn(active - 1)} disabled={active === 0} label="Previous PGN">
                <ChevronLeft size={15} />
                <span>Previous PGN</span>
              </PagerButton>
              <PagerButton onClick={() => goToPgn(active + 1)} disabled={active === normalized.length - 1} label="Next PGN">
                <span>Next PGN</span>
                <ChevronRight size={15} />
              </PagerButton>
            </div>
          ) : null}
        </div>
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
          {parsed.moves.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500 shadow-sm">
              Use left/right arrows to move through the position. Use up/down arrows to switch PGNs.
            </div>
          ) : null}
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-slate-950 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-950">{selected.title || "Classroom board"}</div>
              <div className="mt-1 text-xs capitalize text-slate-500">{selected.type || "position"} · {recordedMoveCount ? `${recordedMoveCount} moves ${parsed.classMoves ? "played in class" : "recorded"}` : "Saved board position"}</div>
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
                <div className="mt-1 text-xs text-slate-500">
                  {activeMove ? `Move ${ply} of ${parsed.moves.length}` : `Move 0 of ${parsed.moves.length}`}
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Move Navigator</div>
                    <div className="mt-1 text-sm font-bold text-slate-900">{activeMove?.san || "Starting position"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MoveNavButton onClick={() => goTo(ply - 1)} disabled={ply === 0} label="Previous move"><ChevronLeft size={15} /></MoveNavButton>
                    <MoveNavButton onClick={() => goTo(ply + 1)} disabled={ply === parsed.moves.length} label="Next move"><ChevronRight size={15} /></MoveNavButton>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MoveSummaryCard label="Previous" move={previousMove} emptyText="You are at the starting position." />
                  <MoveSummaryCard label="Next" move={nextMove} emptyText="You are at the final position." />
                </div>
              </div>
            </>
          ) : rawMoves.length ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-bold text-slate-900">Moves were recorded for this item.</div>
              <div className="mt-1 text-xs leading-5">These classroom moves were saved as raw board moves, so the final position is shown with the recorded list below.</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {rawMoves.map((move: string, index: number) => (
                  <span key={`${move}-${index}`} className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm">
                    {index + 1}. {move}
                  </span>
                ))}
              </div>
            </div>
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

function PagerButton({ children, disabled, label, onClick }: { children: ReactNode; disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition",
        disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MoveSummaryCard({ emptyText, label, move }: { emptyText: string; label: string; move?: PgnMove | null }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      {move ? (
        <>
          <div className="mt-1 text-sm font-bold text-slate-900">{move.san}</div>
          <div className="mt-1 text-xs text-slate-500">{moveNote(move)}</div>
        </>
      ) : (
        <div className="mt-1 text-xs text-slate-500">{emptyText}</div>
      )}
    </div>
  );
}
