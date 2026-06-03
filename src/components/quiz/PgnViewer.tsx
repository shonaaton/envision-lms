"use client";

import dynamic from "next/dynamic";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const lightSquare = "#efd6a8";
const darkSquare = "#bd8d62";
const movesPerPage = 18;

type PgnMove = {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  before?: string;
};

type MoveRow = {
  number: number;
  white?: PgnMove;
  black?: PgnMove;
  whitePly?: number;
  blackPly?: number;
};

type FileNavItem = {
  href: string;
  title: string;
} | null;

function extractHeader(pgn: string, key: string) {
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return match?.[1];
}

function parsePgn(pgn: string) {
  const game = new Chess();
  try {
    game.loadPgn(pgn);
  } catch {
    const fen = extractHeader(pgn, "FEN");
    if (fen) {
      try {
        const position = new Chess(fen).fen();
        return { valid: true, start: position, final: position, moves: [] as PgnMove[] };
      } catch {
        return { valid: false, start: startFen, final: startFen, moves: [] as PgnMove[] };
      }
    }
    return { valid: false, start: startFen, final: startFen, moves: [] as PgnMove[] };
  }

  const moves = game.history({ verbose: true }) as PgnMove[];
  const headers = game.header();
  const start = moves[0]?.before || headers.FEN || game.fen() || startFen;
  return { valid: true, start, final: game.fen(), moves };
}

function replayPosition(start: string, moves: PgnMove[], ply: number) {
  const game = new Chess(start);
  moves.slice(0, ply).forEach((move) => {
    game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
  });
  return game.fen();
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

export default function PgnViewer({
  pgn,
  backHref,
  previousFile,
  nextFile,
}: {
  pgn: string;
  backHref: string;
  previousFile: FileNavItem;
  nextFile: FileNavItem;
}) {
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const parsed = useMemo(() => parsePgn(pgn), [pgn]);
  const moveRows = useMemo(() => buildRows(parsed.moves), [parsed.moves]);
  const [ply, setPly] = useState(0);
  const [movePage, setMovePage] = useState(0);
  const [boardWidth, setBoardWidth] = useState(480);

  const totalPages = Math.max(1, Math.ceil(parsed.moves.length / movesPerPage));
  const pageStart = movePage * movesPerPage;
  const visibleRows = moveRows.filter((row) => {
    const rowStart = (row.number - 1) * 2;
    return rowStart >= pageStart && rowStart < pageStart + movesPerPage;
  });
  const position = useMemo(() => replayPosition(parsed.start, parsed.moves, ply), [parsed.start, parsed.moves, ply]);

  useEffect(() => {
    setPly(0);
    setMovePage(0);
  }, [parsed.moves.length, pgn]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => setBoardWidth(Math.max(280, Math.min(480, element.clientWidth)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function goTo(nextPly: number) {
    const safePly = Math.max(0, Math.min(parsed.moves.length, nextPly));
    setPly(safePly);
    setMovePage(safePly > 0 ? Math.floor((safePly - 1) / movesPerPage) : 0);
  }

  const iconButton = "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300";
  const navButton = "inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition";

  if (!parsed.valid) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-6 text-sm text-red-700">
        This PGN could not be loaded. Please check that the file contains a valid game or a valid FEN setup tag.
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,820px)_minmax(280px,1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-sm">
        <div ref={boardWrapRef} className="mx-auto max-w-[480px]">
          <Chessboard
            position={position}
            arePiecesDraggable={false}
            boardWidth={boardWidth}
            customDarkSquareStyle={{ backgroundColor: darkSquare }}
            customLightSquareStyle={{ backgroundColor: lightSquare }}
          />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button className={iconButton} onClick={() => goTo(0)} disabled={ply === 0} aria-label="Go to first position"><ChevronsLeft size={16} /></button>
          <button className={iconButton} onClick={() => goTo(ply - 1)} disabled={ply === 0} aria-label="Previous move"><ChevronLeft size={16} /></button>
          <button className={iconButton} onClick={() => goTo(ply + 1)} disabled={ply === parsed.moves.length} aria-label="Next move"><ChevronRight size={16} /></button>
          <button className={iconButton} onClick={() => goTo(parsed.moves.length)} disabled={ply === parsed.moves.length} aria-label="Go to final position"><ChevronsRight size={16} /></button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Link href={backHref} className={`${navButton} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            Back to folder
          </Link>
          <Link
            href={previousFile?.href || "#"}
            className={[
              navButton,
              previousFile ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-100 bg-slate-100 text-slate-300",
            ].join(" ")}
            aria-disabled={!previousFile}
            title={previousFile?.title}
          >
            Previous file
          </Link>
          <Link
            href={nextFile?.href || "#"}
            className={[
              navButton,
              nextFile ? "border-brand bg-brand text-white hover:bg-brand-600" : "pointer-events-none border-slate-100 bg-slate-100 text-slate-300",
            ].join(" ")}
            aria-disabled={!nextFile}
            title={nextFile?.title}
          >
            Next file
          </Link>
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 text-slate-950 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700">Move List</div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <button className={iconButton} onClick={() => setMovePage((page) => Math.max(0, page - 1))} disabled={movePage === 0} aria-label="Previous moves page"><ChevronLeft size={16} /></button>
            <span className="min-w-16 text-center">{movePage + 1} / {totalPages}</span>
            <button className={iconButton} onClick={() => setMovePage((page) => Math.min(totalPages - 1, page + 1))} disabled={movePage >= totalPages - 1} aria-label="Next moves page"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="max-h-[520px] overflow-y-auto pr-1">
          <div className="grid gap-y-1 text-sm">
            {visibleRows.length ? visibleRows.map((row) => (
              <div key={row.number} className="grid grid-cols-[34px_1fr_1fr] items-center gap-2">
                <span className="text-slate-400">{row.number}.</span>
                <MoveButton label={row.white?.san} active={ply === row.whitePly} onClick={() => row.whitePly && goTo(row.whitePly)} />
                <MoveButton label={row.black?.san} active={ply === row.blackPly} onClick={() => row.blackPly && goTo(row.blackPly)} />
              </div>
            )) : (
              <div className="py-6 text-center text-sm text-slate-500">No moves in this PGN.</div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function MoveButton({ label, active, onClick }: { label?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={[
        "min-h-8 rounded px-2 text-left font-medium transition",
        label ? "hover:bg-brand-50" : "cursor-default",
        active ? "bg-brand text-white hover:bg-brand" : "text-slate-700",
      ].join(" ")}
      onClick={onClick}
      disabled={!label}
    >
      {label || ""}
    </button>
  );
}
