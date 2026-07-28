"use client";

import dynamic from "next/dynamic";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, ListTree, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useRouter } from "next/navigation";
import PageLoadingOverlay from "@/components/feedback/PageLoadingOverlay";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const lightSquare = "#efd6a8";
const darkSquare = "#bd8d62";
const movesPerPage = 16;

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
  id?: string;
  href: string;
  title: string;
  white?: string;
  black?: string;
  result?: string;
  opening?: string;
  moveCount?: number;
  sideToMove?: "white" | "black";
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
  folderFiles = [],
  currentFileId,
}: {
  pgn: string;
  backHref: string;
  previousFile: FileNavItem;
  nextFile: FileNavItem;
  folderFiles?: NonNullable<FileNavItem>[];
  currentFileId?: string;
}) {
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const parsed = useMemo(() => parsePgn(pgn), [pgn]);
  const moveRows = useMemo(() => buildRows(parsed.moves), [parsed.moves]);
  const [ply, setPly] = useState(0);
  const [movePage, setMovePage] = useState(0);
  const [boardWidth, setBoardWidth] = useState(620);
  const [navigating, setNavigating] = useState(false);
  const [folderSidebarOpen, setFolderSidebarOpen] = useState(true);
  const [folderQuery, setFolderQuery] = useState("");

  const totalPages = Math.max(1, Math.ceil(parsed.moves.length / movesPerPage));
  const pageStart = movePage * movesPerPage;
  const visibleRows = moveRows.filter((row) => {
    const rowStart = (row.number - 1) * 2;
    return rowStart >= pageStart && rowStart < pageStart + movesPerPage;
  });
  const position = useMemo(() => replayPosition(parsed.start, parsed.moves, ply), [parsed.start, parsed.moves, ply]);
  const activeSideToMove = parsed.start.split(/\s+/)[1] === "b" ? "Black to play" : "White to play";
  const visibleFolderFiles = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    return folderFiles.filter((item) => {
      if (!q) return true;
      return [item.title, item.white, item.black, item.result, item.opening].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }, [folderFiles, folderQuery]);

  useEffect(() => {
    setPly(0);
    setMovePage(0);
  }, [parsed.moves.length, pgn]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => {
      const heightLimit = Math.max(260, window.innerHeight - 360);
      setBoardWidth(Math.max(260, Math.min(540, element.clientWidth - 28, heightLimit)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  function openFile(item: FileNavItem) {
    if (!item) return;
    setNavigating(true);
    router.push(item.href);
  }

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
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <PageLoadingOverlay visible={navigating} message="Opening PGN..." />
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-sm">
        <div ref={boardWrapRef} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden pb-2">
          <div className="flex flex-col items-center gap-2">
            <span className="rounded-md bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-purple-700">{activeSideToMove}</span>
            <BoardWithOutsideCoordinates position={position} boardWidth={boardWidth} />
          </div>
        </div>

        <div className="flex flex-none items-center justify-center gap-2">
          <button className={iconButton} onClick={() => goTo(0)} disabled={ply === 0} aria-label="Go to first position"><ChevronsLeft size={16} /></button>
          <button className={iconButton} onClick={() => goTo(ply - 1)} disabled={ply === 0} aria-label="Previous move"><ChevronLeft size={16} /></button>
          <button className={iconButton} onClick={() => goTo(ply + 1)} disabled={ply === parsed.moves.length} aria-label="Next move"><ChevronRight size={16} /></button>
          <button className={iconButton} onClick={() => goTo(parsed.moves.length)} disabled={ply === parsed.moves.length} aria-label="Go to final position"><ChevronsRight size={16} /></button>
        </div>
        <div className="mt-3 flex flex-none flex-wrap items-center justify-center gap-2">
          <Link href={backHref} className={`${navButton} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            Back to folder
          </Link>
          <button
            type="button"
            onClick={() => openFile(previousFile)}
            className={[
              navButton,
              previousFile ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none border-slate-100 bg-slate-100 text-slate-300",
            ].join(" ")}
            disabled={!previousFile}
            title={previousFile?.title}
          >
            Previous file
          </button>
          <button
            type="button"
            onClick={() => openFile(nextFile)}
            className={[
              navButton,
              nextFile ? "border-brand bg-brand text-white hover:bg-brand-600" : "pointer-events-none border-slate-100 bg-slate-100 text-slate-300",
            ].join(" ")}
            disabled={!nextFile}
            title={nextFile?.title}
          >
            Next file
          </button>
        </div>
      </section>

      <aside className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-sm">
        {folderFiles.length > 1 && (
          <div className="mb-3 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => setFolderSidebarOpen((value) => !value)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-700"
              aria-expanded={folderSidebarOpen}
            >
              <span className="inline-flex items-center gap-2"><ListTree size={16} /> Folder Games</span>
              <span className="text-xs text-slate-400">{folderFiles.findIndex((item) => item.id === currentFileId) + 1 || 1} / {folderFiles.length}</span>
            </button>
            {folderSidebarOpen && (
              <div className="border-t border-slate-200 p-2">
                <label className="relative mb-2 block">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={folderQuery}
                    onChange={(event) => setFolderQuery(event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                    placeholder="Search this folder"
                  />
                </label>
                <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {visibleFolderFiles.map((item, index) => {
                    const active = item.id === currentFileId;
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => !active && openFile(item)}
                        className={[
                          "w-full rounded-md border px-2 py-2 text-left text-xs transition",
                          active ? "border-brand bg-brand/10 text-brand" : "border-slate-100 hover:border-brand/30 hover:bg-brand/5",
                        ].join(" ")}
                        aria-current={active ? "true" : undefined}
                      >
                        <span className="block truncate font-semibold">{index + 1}. {item.title}</span>
                        <span className="mt-0.5 block truncate text-slate-500">{item.white || "White"} vs {item.black || "Black"}{item.result ? ` - ${item.result}` : ""}</span>
                        <span className="mt-0.5 block truncate text-slate-400">{[item.sideToMove === "black" ? "Black to play" : "White to play", item.opening, item.moveCount ? `${item.moveCount} moves` : ""].filter(Boolean).join(" - ")}</span>
                      </button>
                    );
                  })}
                  {!visibleFolderFiles.length && <div className="rounded-md border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">No games match that search.</div>}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700">Move List</div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <button className={iconButton} onClick={() => setMovePage((page) => Math.max(0, page - 1))} disabled={movePage === 0} aria-label="Previous moves page"><ChevronLeft size={16} /></button>
            <span className="min-w-10 text-center">{movePage + 1}/{totalPages}</span>
            <button className={iconButton} onClick={() => setMovePage((page) => Math.min(totalPages - 1, page + 1))} disabled={movePage >= totalPages - 1} aria-label="Next moves page"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
          <div className="grid gap-y-0.5 text-sm">
            {visibleRows.length ? visibleRows.map((row) => (
              <div key={row.number} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1">
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
        "min-h-7 truncate rounded px-2 text-left text-xs font-medium transition",
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

function BoardWithOutsideCoordinates({ position, boardWidth }: { position: string; boardWidth: number }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "18px auto", gridTemplateRows: "auto 18px" }}>
      <div className="grid text-[11px] font-semibold text-slate-400" style={{ height: boardWidth, gridTemplateRows: "repeat(8, 1fr)" }} aria-hidden="true">
        {["8", "7", "6", "5", "4", "3", "2", "1"].map((rank) => (
          <span key={rank} className="flex items-center justify-center">{rank}</span>
        ))}
      </div>
      <div className="overflow-hidden rounded-sm">
        <Chessboard
          position={position}
          arePiecesDraggable={false}
          boardWidth={boardWidth}
          showBoardNotation={false}
          customDarkSquareStyle={{ backgroundColor: darkSquare }}
          customLightSquareStyle={{ backgroundColor: lightSquare }}
        />
      </div>
      <div aria-hidden="true" />
      <div className="grid text-[11px] font-semibold text-slate-400" style={{ width: boardWidth, gridTemplateColumns: "repeat(8, 1fr)" }} aria-hidden="true">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((file) => (
          <span key={file} className="flex items-center justify-center">{file}</span>
        ))}
      </div>
    </div>
  );
}
