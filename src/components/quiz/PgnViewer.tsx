"use client";

import dynamic from "next/dynamic";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, ListTree, Loader2, Pencil, RotateCcw, Save, Search, Trash2, Waypoints } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PageLoadingOverlay from "@/components/feedback/PageLoadingOverlay";
import { normalizePermissiveFen } from "@/lib/pgnLibrary";
import { buildMoveHintStyles, canSelectPieceForTurn, legalTargetsFromGame } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";
import type { LichessPgnNode, LichessPgnTree } from "@/lib/lichessPgn";
import {
  appendPgnMove,
  countPgnMovesLostBySideChange,
  deletePgnNode,
  isPgnVariationPath,
  loadPermissivePosition,
  parsePgnTree,
  pgnAnnotationNags,
  pgnChildrenAtPath,
  pgnMainlinePath,
  pgnNodeAtPath,
  pgnPositionAtPath,
  pgnSideToMoveAt,
  promotePgnLine,
  readPgnComment,
  serializePgnTree,
  setPgnComment,
  setPgnStartSide,
  togglePgnNag,
  type PgnEditorPath,
  type PgnEditorSide,
} from "@/lib/pgnEditor";
import { cn } from "@/lib/utils";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

const lightSquare = "#efd6a8";
const darkSquare = "#bd8d62";
const movesPerPage = 16;

type MoveEntry = { node: LichessPgnNode; path: PgnEditorPath };

type MoveRow = {
  key: string;
  number: number;
  white?: MoveEntry;
  black?: MoveEntry;
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

function pathKey(path: PgnEditorPath) {
  return path.join(".");
}

function nagSymbols(node: LichessPgnNode) {
  return node.nags.map((nag) => pgnAnnotationNags.find((item) => item.nag === nag)?.label || "").join("");
}

function mainlineEntries(tree: LichessPgnTree) {
  const entries: MoveEntry[] = [];
  const path: PgnEditorPath = [];
  let children = tree.children;
  while (children.length) {
    path.push(0);
    entries.push({ node: children[0], path: [...path] });
    children = children[0].children;
  }
  return entries;
}

function buildRows(entries: MoveEntry[]) {
  const rows: MoveRow[] = [];
  entries.forEach((entry) => {
    const parts = String(entry.node.fenBefore || "").split(/\s+/);
    const number = Number(parts[5]) || 1;
    const isWhiteMove = parts[1] !== "b";
    const last = rows[rows.length - 1];
    const reuse = last && last.number === number && !(isWhiteMove ? last.white : last.black);
    if (!reuse) rows.push({ key: `${number}-${rows.length}`, number });
    const row = rows[rows.length - 1];
    if (isWhiteMove) row.white = entry;
    else row.black = entry;
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
  canEdit = false,
}: {
  pgn: string;
  backHref: string;
  previousFile: FileNavItem;
  nextFile: FileNavItem;
  folderFiles?: NonNullable<FileNavItem>[];
  currentFileId?: string;
  canEdit?: boolean;
}) {
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const savedPgn = useMemo(() => serializePgnTree(parsePgnTree(pgn)), [pgn]);
  const [tree, setTree] = useState<LichessPgnTree>(() => parsePgnTree(pgn));
  const [path, setPath] = useState<PgnEditorPath>([]);
  const [movePage, setMovePage] = useState(0);
  const [boardWidth, setBoardWidth] = useState(620);
  const [navigating, setNavigating] = useState(false);
  const [folderSidebarOpen, setFolderSidebarOpen] = useState(true);
  const [folderQuery, setFolderQuery] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"board" | "files" | "moves">("board");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const validStart = useMemo(() => Boolean(normalizePermissiveFen(tree.initialFen)), [tree.initialFen]);
  const entries = useMemo(() => mainlineEntries(tree), [tree]);
  const rows = useMemo(() => buildRows(entries), [entries]);
  const activeNode = useMemo(() => pgnNodeAtPath(tree, path), [tree, path]);
  const position = useMemo(() => pgnPositionAtPath(tree, path), [tree, path]);
  const boardGame = useMemo(() => loadPermissivePosition(position), [position]);
  const startSide = pgnSideToMoveAt(tree.initialFen);
  const currentPathKey = pathKey(path);
  const currentPgn = useMemo(() => serializePgnTree(tree), [tree]);
  const dirty = currentPgn !== savedPgn;
  const savedComment = useMemo(() => readPgnComment(tree, path), [tree, path]);

  const totalPages = Math.max(1, Math.ceil(rows.length / (movesPerPage / 2)));
  const visibleRows = rows.slice(movePage * (movesPerPage / 2), (movePage + 1) * (movesPerPage / 2));
  const visibleFolderFiles = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    return folderFiles.filter((item) => {
      if (!q) return true;
      return [item.title, item.white, item.black, item.result, item.opening].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }, [folderFiles, folderQuery]);

  useEffect(() => {
    setTree(parsePgnTree(pgn));
    setPath([]);
    setMovePage(0);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setEditing(false);
  }, [pgn]);

  useEffect(() => {
    setCommentDraft(savedComment);
  }, [savedComment]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => {
      const heightOffset = window.innerWidth < 768 ? 310 : 360;
      const heightLimit = Math.max(240, window.innerHeight - heightOffset);
      setBoardWidth(Math.max(240, Math.min(540, element.clientWidth - 28, heightLimit)));
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

  const goTo = useCallback((nextPath: PgnEditorPath) => {
    setPath(nextPath);
    setSelectedSquare(null);
    setPendingPromotion(null);
    const mainlineDepth = nextPath.every((index) => index === 0) ? nextPath.length : 0;
    if (mainlineDepth) setMovePage(Math.floor((mainlineDepth - 1) / movesPerPage));
  }, []);

  function confirmLeave() {
    return !dirty || window.confirm("You have unsaved changes to this PGN. Leave without saving?");
  }

  function openFile(item: FileNavItem) {
    if (!item || !confirmLeave()) return;
    setNavigating(true);
    router.push(item.href);
  }

  function stepBack() {
    goTo(path.slice(0, -1));
  }

  function stepForward() {
    const children = pgnChildrenAtPath(tree, path);
    if (children.length) goTo([...path, 0]);
  }

  function commitMove(from: string, to: string, promotion: PromotionPiece = "q") {
    const result = appendPgnMove(tree, path, { from, to, promotion });
    if (!result) return false;
    setTree(result.tree);
    goTo(result.path);
    if (result.created && result.path[result.path.length - 1] > 0) toast.success("Variation added");
    return true;
  }

  function onPieceDrop(source: string, target: string) {
    if (!editing) return false;
    if (isPromotionMove(boardGame, source, target)) {
      setPendingPromotion({ from: source, to: target });
      return false;
    }
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
    if (!editing) return;
    if (selectedSquare && selectedSquare !== square) {
      if (isPromotionMove(boardGame, selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
        setSelectedSquare(null);
        return;
      }
      if (commitMove(selectedSquare, square)) return;
    }
    const piece = boardGame.get(square as never);
    setSelectedSquare(piece && canSelectPieceForTurn(piece.color, boardGame.turn()) ? square : null);
  }

  function changeStartSide(side: PgnEditorSide) {
    if (side === startSide) return;
    const lost = countPgnMovesLostBySideChange(tree, side);
    if (lost > 0 && !window.confirm(`Switching to ${side} to play makes ${lost} recorded ${lost === 1 ? "move" : "moves"} illegal. They will be removed. Continue?`)) return;
    const result = setPgnStartSide(tree, side);
    if (!result) return toast.error("This position cannot be flipped");
    setTree(result.tree);
    goTo([]);
    toast.success(`${side === "black" ? "Black" : "White"} to play`);
  }

  function deleteCurrent() {
    if (!path.length) return;
    const label = activeNode?.san || "this move";
    if (!window.confirm(`Delete ${label} and every move after it?`)) return;
    const result = deletePgnNode(tree, path);
    setTree(result.tree);
    goTo(result.path);
  }

  function makeMainLine() {
    const result = promotePgnLine(tree, path);
    setTree(result.tree);
    goTo(result.path);
    toast.success("Promoted to the main line");
  }

  function saveComment() {
    setTree(setPgnComment(tree, path, commentDraft));
  }

  function toggleAnnotation(nag: number) {
    if (!path.length) return;
    setTree(togglePgnNag(tree, path, nag));
  }

  function discardChanges() {
    if (!window.confirm("Discard all unsaved changes to this PGN?")) return;
    setTree(parsePgnTree(pgn));
    goTo([]);
  }

  async function save() {
    if (!currentFileId || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/pgn/${currentFileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn: currentPgn }),
      });
      if (!response.ok) throw new Error("Save failed");
      toast.success("PGN saved");
      router.refresh();
    } catch {
      toast.error("Could not save this PGN");
    } finally {
      setSaving(false);
    }
  }

  const moveHintStyles = useMemo(
    () => (editing && selectedSquare ? buildMoveHintStyles(legalTargetsFromGame(boardGame, selectedSquare), selectedSquare) : {}),
    [boardGame, editing, selectedSquare],
  );

  const iconButton = "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300";
  const navButton = "inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition";
  const toolButton = "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300";

  if (!validStart) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-6 text-sm text-red-700">
        This PGN could not be loaded. Please check that the file contains a valid game or a valid FEN setup tag.
      </div>
    );
  }

  const mobileTabs = [
    { id: "board" as const, label: "Board" },
    { id: "files" as const, label: "Files", count: folderFiles.length },
    { id: "moves" as const, label: "Moves", count: entries.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <PageLoadingOverlay visible={navigating} message="Opening PGN..." />
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 lg:hidden">
        {mobileTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMobilePanel(item.id)}
            className={cn(
              "flex min-h-9 items-center justify-center gap-1 rounded-md px-2 text-xs font-black transition",
              mobilePanel === item.id ? "bg-white text-brand shadow-sm" : "text-slate-600"
            )}
          >
            {item.label}
            {typeof item.count === "number" && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{item.count > 99 ? "99+" : item.count}</span>}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className={cn("min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-sm lg:flex", mobilePanel === "board" ? "flex" : "hidden")}>
        <div ref={boardWrapRef} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden pb-2">
          <div className="flex flex-col items-center gap-2">
            <span className="rounded-md bg-purple-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-purple-700">
              {pgnSideToMoveAt(position) === "black" ? "Black to play" : "White to play"}
            </span>
            <BoardWithOutsideCoordinates boardWidth={boardWidth}>
              <Chessboard
                position={position}
                arePiecesDraggable={editing}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick as any}
                onPromotionPieceSelect={onPromotionPieceSelect as any}
                showPromotionDialog={!!pendingPromotion}
                promotionToSquare={pendingPromotion?.to as any}
                promotionDialogVariant="modal"
                boardWidth={boardWidth}
                showBoardNotation={false}
                animationDuration={editing ? 0 : 200}
                customSquareStyles={moveHintStyles as any}
                customDarkSquareStyle={{ backgroundColor: darkSquare }}
                customLightSquareStyle={{ backgroundColor: lightSquare }}
              />
            </BoardWithOutsideCoordinates>
          </div>
        </div>

        <div className="flex flex-none items-center justify-center gap-2">
          <button className={iconButton} onClick={() => goTo([])} disabled={!path.length} aria-label="Go to first position"><ChevronsLeft size={16} /></button>
          <button className={iconButton} onClick={stepBack} disabled={!path.length} aria-label="Previous move"><ChevronLeft size={16} /></button>
          <button className={iconButton} onClick={stepForward} disabled={!pgnChildrenAtPath(tree, path).length} aria-label="Next move"><ChevronRight size={16} /></button>
          <button className={iconButton} onClick={() => goTo(pgnMainlinePath(tree))} disabled={!entries.length} aria-label="Go to final position"><ChevronsRight size={16} /></button>
        </div>

        {canEdit && (
          <div className="mt-3 flex-none rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { setEditing((value) => !value); setSelectedSquare(null); }}
                className={cn(toolButton, editing && "border-brand bg-brand text-white hover:bg-brand-600")}
              >
                <Pencil size={13} /> {editing ? "Editing" : "Edit moves"}
              </button>
              {dirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Unsaved changes</span>}
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={discardChanges} disabled={!dirty || saving} className={toolButton}><RotateCcw size={13} /> Discard</button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || saving || !currentFileId}
                  className={cn(toolButton, "border-brand bg-brand text-white hover:bg-brand-600 disabled:border-slate-100 disabled:bg-slate-100")}
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                </button>
              </div>
            </div>

            {editing && (
              <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Start position</span>
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                    {(["white", "black"] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => changeStartSide(side)}
                        className={cn(
                          "min-h-8 px-3 text-xs font-semibold transition",
                          startSide === side ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {side === "white" ? "White to play" : "Black to play"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={deleteCurrent} disabled={!path.length} className={cn(toolButton, "hover:border-red-200 hover:bg-red-50 hover:text-red-700")}>
                    <Trash2 size={13} /> Delete move
                  </button>
                  <button type="button" onClick={makeMainLine} disabled={!isPgnVariationPath(path)} className={toolButton}>
                    <Waypoints size={13} /> Make main line
                  </button>
                  <div className="flex items-center gap-1">
                    {pgnAnnotationNags.map((item) => (
                      <button
                        key={item.nag}
                        type="button"
                        title={item.title}
                        onClick={() => toggleAnnotation(item.nag)}
                        disabled={!path.length}
                        className={cn(
                          "min-h-8 min-w-8 rounded-md border border-slate-200 bg-white px-1.5 text-xs font-bold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300",
                          activeNode?.nags.includes(item.nag) && "border-brand bg-brand text-white hover:bg-brand-600",
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    onBlur={saveComment}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveComment(); } }}
                    placeholder={path.length ? `Comment on ${activeNode?.san || "this move"}` : "Comment on the starting position"}
                    className="h-9 flex-1 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                  />
                  <button type="button" onClick={saveComment} disabled={commentDraft.trim() === savedComment.trim()} className={toolButton}>Apply</button>
                </div>

                <p className="text-[11px] text-slate-500">
                  Play a move on the board to extend this line. Playing a different move from a position that already has one creates a variation.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-none flex-wrap items-center justify-center gap-2">
          <Link
            href={backHref}
            onClick={(event) => { if (!confirmLeave()) event.preventDefault(); }}
            className={`${navButton} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
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

      <aside className={cn("min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-sm lg:block", mobilePanel === "files" || mobilePanel === "moves" ? "block" : "hidden")}>
        <div className={cn("lg:block", mobilePanel === "files" ? "block" : "hidden")}>
        {folderFiles.length > 1 ? (
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
        ) : (
          <div className="mb-3 rounded-md border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No other PGNs in this folder.</div>
        )}
        </div>

        <div className={cn("lg:block", mobilePanel === "moves" ? "block" : "hidden")}>
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
              <Fragment key={row.key}>
                <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1">
                  <span className="text-slate-400">{row.number}.</span>
                  <MoveButton entry={row.white} activeKey={currentPathKey} onSelect={goTo} />
                  <MoveButton entry={row.black} activeKey={currentPathKey} onSelect={goTo} />
                </div>
                {[row.white, row.black].filter(Boolean).flatMap((entry) => {
                  const parentPath = entry!.path.slice(0, -1);
                  return pgnChildrenAtPath(tree, parentPath).slice(1).map((_, index) => (
                    <div key={`${pathKey(parentPath)}-v${index + 1}`} className="ml-7 border-l-2 border-slate-200 pl-2 text-xs leading-6 text-slate-600">
                      <VariationLine tree={tree} startPath={[...parentPath, index + 1]} activeKey={currentPathKey} onSelect={goTo} />
                    </div>
                  ));
                })}
              </Fragment>
            )) : (
              <div className="py-6 text-center text-sm text-slate-500">No moves in this PGN.</div>
            )}
          </div>
        </div>
        </div>
      </aside>
      </div>
    </div>
  );
}

function VariationLine({
  tree,
  startPath,
  activeKey,
  onSelect,
}: {
  tree: LichessPgnTree;
  startPath: PgnEditorPath;
  activeKey: string;
  onSelect: (path: PgnEditorPath) => void;
}) {
  const items: ReactNode[] = [];
  let path = startPath;
  let node = pgnNodeAtPath(tree, path);
  let forceNumber = true;

  while (node) {
    const parts = String(node.fenBefore || "").split(/\s+/);
    const fullMove = parts[5] || "1";
    const prefix = parts[1] !== "b" ? `${fullMove}.` : forceNumber ? `${fullMove}...` : "";
    const key = pathKey(path);
    const selected = key === activeKey;
    const movePath = path;

    items.push(
      <button
        key={`m${key}`}
        type="button"
        onClick={() => onSelect(movePath)}
        className={cn("mr-1 rounded px-1 font-medium transition hover:bg-brand-50", selected && "bg-brand text-white hover:bg-brand")}
      >
        {prefix ? `${prefix} ` : ""}{node.san}{nagSymbols(node)}
      </button>,
    );
    forceNumber = false;

    const children = node.children;
    children.slice(1).forEach((_, index) => {
      const altPath = [...path, index + 1];
      items.push(
        <span key={`n${pathKey(altPath)}`} className="mr-1 text-slate-400">
          (<VariationLine tree={tree} startPath={altPath} activeKey={activeKey} onSelect={onSelect} />)
        </span>,
      );
      forceNumber = true;
    });

    if (!children.length) break;
    path = [...path, 0];
    node = children[0];
  }

  return <>{items}</>;
}

function MoveButton({ entry, activeKey, onSelect }: { entry?: MoveEntry; activeKey: string; onSelect: (path: PgnEditorPath) => void }) {
  const active = Boolean(entry && pathKey(entry.path) === activeKey);
  return (
    <button
      className={[
        "min-h-7 truncate rounded px-2 text-left text-xs font-medium transition",
        entry ? "hover:bg-brand-50" : "cursor-default",
        active ? "bg-brand text-white hover:bg-brand" : "text-slate-700",
      ].join(" ")}
      onClick={() => entry && onSelect(entry.path)}
      disabled={!entry}
    >
      {entry ? `${entry.node.san}${nagSymbols(entry.node)}` : ""}
    </button>
  );
}

function BoardWithOutsideCoordinates({ boardWidth, children }: { boardWidth: number; children: ReactNode }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "18px auto", gridTemplateRows: "auto 18px" }}>
      <div className="grid text-[11px] font-semibold text-slate-400" style={{ height: boardWidth, gridTemplateRows: "repeat(8, 1fr)" }} aria-hidden="true">
        {["8", "7", "6", "5", "4", "3", "2", "1"].map((rank) => (
          <span key={rank} className="flex items-center justify-center">{rank}</span>
        ))}
      </div>
      <div className="overflow-hidden rounded-sm">{children}</div>
      <div aria-hidden="true" />
      <div className="grid text-[11px] font-semibold text-slate-400" style={{ width: boardWidth, gridTemplateColumns: "repeat(8, 1fr)" }} aria-hidden="true">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((file) => (
          <span key={file} className="flex items-center justify-center">{file}</span>
        ))}
      </div>
    </div>
  );
}
