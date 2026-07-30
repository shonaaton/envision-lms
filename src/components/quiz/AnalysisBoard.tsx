"use client";

import dynamic from "next/dynamic";
import {
  ArrowDownToLine,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  FileText,
  Grid3X3,
  Info,
  Maximize2,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";
import { normalizePermissiveFen } from "@/lib/pgnLibrary";
import PgnLibraryPicker, { type PgnLibraryGame } from "@/components/pgn/PgnLibraryPicker";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type SideTab = "moves" | "engine" | "pdf";
type DialogName = "pgn" | "fen" | "setup" | "settings" | "save" | null;
type PieceCode = "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K";
type SetupTab = "general" | "gamified";
type PieceTheme = "classic" | "alpha" | "neo";
type BoardTheme = "walnut" | "green" | "blue" | "purple" | "slate";
type GamifiedObjectId = "coin" | "star" | "gem" | "target" | "treasure" | "apple" | "burger" | "bear" | "puppy" | "trophy" | "smile" | "fire" | "gift" | "shield" | "key" | "puzzle" | "rocket" | "monster" | "dragon" | "barrier" | "wall" | "rock" | "log";
type SetupSelection = PieceCode | "delete" | GamifiedObjectId;

type MoveRow = {
  number: number;
  white: string;
  black: string;
  whitePly: number;
  blackPly?: number;
};

type EngineLine = {
  multipv: number;
  eval: string;
  variation: string;
};

type PgnLibraryItem = {
  _id: string;
  title: string;
  folder?: string;
};

type GamifiedObject = {
  id: GamifiedObjectId;
  label: string;
  icon: string;
  group: "Food" | "Toys" | "Animals" | "Rewards" | "Emoji" | "Blocks";
};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const boardThemes: Record<BoardTheme, { name: string; light: string; dark: string }> = {
  walnut: { name: "Walnut", light: "#efd6a8", dark: "#bd8d62" },
  green: { name: "Tournament", light: "#eeeed2", dark: "#769656" },
  blue: { name: "Ocean", light: "#d9e9f6", dark: "#5b8db8" },
  purple: { name: "Academy", light: "#f0dcf6", dark: "#7b3f98" },
  slate: { name: "Slate", light: "#d8dee9", dark: "#64748b" },
};
const gamifiedObjects: GamifiedObject[] = [
  { id: "burger", label: "Burger", icon: "\uD83C\uDF54", group: "Food" },
  { id: "apple", label: "Apple", icon: "\uD83C\uDF4E", group: "Food" },
  { id: "bear", label: "Teddy", icon: "\uD83E\uDDF8", group: "Toys" },
  { id: "puppy", label: "Puppy", icon: "\uD83D\uDC36", group: "Animals" },
  { id: "coin", label: "Coin", icon: "\uD83E\uDE99", group: "Rewards" },
  { id: "star", label: "Star", icon: "\u2B50", group: "Rewards" },
  { id: "gem", label: "Gem", icon: "\uD83D\uDC8E", group: "Rewards" },
  { id: "target", label: "Target", icon: "\uD83C\uDFAF", group: "Rewards" },
  { id: "treasure", label: "Treasure", icon: "\uD83C\uDF81", group: "Rewards" },
  { id: "trophy", label: "Trophy", icon: "\uD83C\uDFC6", group: "Rewards" },
  { id: "fire", label: "Fire", icon: "\uD83D\uDD25", group: "Rewards" },
  { id: "gift", label: "Gift Box", icon: "\uD83C\uDF81", group: "Rewards" },
  { id: "shield", label: "Shield", icon: "\uD83D\uDEE1", group: "Rewards" },
  { id: "key", label: "Key", icon: "\uD83D\uDDDD", group: "Rewards" },
  { id: "puzzle", label: "Puzzle", icon: "\uD83E\uDDE9", group: "Toys" },
  { id: "rocket", label: "Rocket", icon: "\uD83D\uDE80", group: "Toys" },
  { id: "monster", label: "Monster", icon: "\uD83D\uDC7E", group: "Animals" },
  { id: "dragon", label: "Dragon", icon: "\uD83D\uDC09", group: "Animals" },
  { id: "smile", label: "Smile", icon: "\uD83D\uDE0A", group: "Emoji" },
  { id: "barrier", label: "Barrier", icon: "\uD83D\uDEA7", group: "Blocks" },
  { id: "wall", label: "Wall", icon: "\uD83E\uDDF1", group: "Blocks" },
  { id: "rock", label: "Rock", icon: "\uD83E\uDEA8", group: "Blocks" },
  { id: "log", label: "Log", icon: "\uD83E\uDEB5", group: "Blocks" },
];
const initialSetup: Record<string, PieceCode> = {
  a8: "r", b8: "n", c8: "b", d8: "q", e8: "k", f8: "b", g8: "n", h8: "r",
  a7: "p", b7: "p", c7: "p", d7: "p", e7: "p", f7: "p", g7: "p", h7: "p",
  a2: "P", b2: "P", c2: "P", d2: "P", e2: "P", f2: "P", g2: "P", h2: "P",
  a1: "R", b1: "N", c1: "B", d1: "Q", e1: "K", f1: "B", g1: "N", h1: "R",
};

const sampleEngineLines = [
  { eval: "+0.33", moves: "e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7" },
  { eval: "+0.32", moves: "Nf3" },
  { eval: "+0.27", moves: "d4 d5 c4 e6 Nf3 Nf6 g3 c5" },
];

function normalizeFolderPath(value?: string | null) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function folderLabel(path: string) {
  const normalized = normalizeFolderPath(path);
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

function getImmediateChildPath(basePath: string, candidatePath: string) {
  const base = normalizeFolderPath(basePath);
  const candidate = normalizeFolderPath(candidatePath);
  if (!candidate) return "";
  if (!base) return candidate.includes("/") ? candidate.split("/")[0] : candidate;
  if (candidate === base || !candidate.startsWith(`${base}/`)) return "";
  const rest = candidate.slice(base.length + 1);
  return `${base}/${rest.split("/")[0]}`;
}

function folderBreadcrumbs(path: string) {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean);
  return parts.map((part, index) => ({
    path: parts.slice(0, index + 1).join("/"),
    name: part,
  }));
}

function pieceGlyph(piece: PieceCode) {
  const glyphs: Record<PieceCode, string> = {
    p: "\u265F",
    n: "\u265E",
    b: "\u265D",
    r: "\u265C",
    q: "\u265B",
    k: "\u265A",
    P: "\u2659",
    N: "\u2658",
    B: "\u2657",
    R: "\u2656",
    Q: "\u2655",
    K: "\u2654",
  };
  return glyphs[piece];
}

function extractFenHeader(pgn: string) {
  return pgn.match(/\[FEN\s+"([^"]+)"\]/)?.[1];
}

function normalizeBoardResourceFen(value?: string | null) {
  if (!value || value === "start") return "";
  return normalizePermissiveFen(value) || String(value).trim();
}

function buildAnalysisGame(fen?: string) {
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

export default function AnalysisBoard({ initialFen, withEngine = true }: { initialFen?: string; withEngine?: boolean }) {
  const initialPosition = normalizeBoardResourceFen(initialFen) || initialFen || startFen;
  const gameRef = useRef(buildAnalysisGame(initialPosition));
  const baseFenRef = useRef(initialPosition);
  const workerRef = useRef<Worker | null>(null);
  const analysisFenRef = useRef(initialPosition || gameRef.current.fen());
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [position, setPosition] = useState(initialPosition || gameRef.current.fen());
  const [selectedPly, setSelectedPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [tab, setTab] = useState<SideTab>("engine");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [boardWidth, setBoardWidth] = useState(520);
  const [boardScale, setBoardScale] = useState(100);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>("walnut");
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>("classic");
  const [engineOn, setEngineOn] = useState(true);
  const [engineRunning, setEngineRunning] = useState(false);
  const [bestMove, setBestMove] = useState("");
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  const [pdfName, setPdfName] = useState("");
  const [gamifiedBoardObjects, setGamifiedBoardObjects] = useState<Record<string, GamifiedObjectId>>({});
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [libraryQueue, setLibraryQueue] = useState<PgnLibraryGame[]>([]);
  const [libraryQueueIndex, setLibraryQueueIndex] = useState(0);

  const isDark = false;
  const panelClass = "border-slate-200 bg-white text-slate-950";
  const mutedText = "text-slate-500";
  const squareTheme = boardThemes[boardTheme];
  const boardSize = Math.round(boardWidth * (boardScale / 100));
  const customPieces = useMemo(() => createCustomPieces(pieceTheme), [pieceTheme]);

  const moveRows: MoveRow[] = (() => {
    const verbose = gameRef.current.history({ verbose: true }) as Array<{ san: string; color: "w" | "b" }>;
    const rows: MoveRow[] = [];
    verbose.forEach((move, index) => {
      const rowIndex = Math.floor(index / 2);
      if (!rows[rowIndex]) rows[rowIndex] = { number: rowIndex + 1, white: "", black: "", whitePly: rowIndex * 2 + 1 };
      if (move.color === "w") {
        rows[rowIndex].white = move.san;
        rows[rowIndex].whitePly = index + 1;
      } else {
        rows[rowIndex].black = move.san;
        rows[rowIndex].blackPly = index + 1;
      }
    });
    return rows;
  })();

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => {
      const isMobile = window.innerWidth < 768;
      const heightLimit = typeof window === "undefined" ? 560 : window.innerHeight - (isMobile ? 270 : 330);
      setBoardWidth(Math.max(isMobile ? 245 : 280, Math.min(isMobile ? window.innerWidth - 58 : 540, element.clientWidth, heightLimit)));
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

  useEffect(() => {
    if (!withEngine) return;
    try {
      const worker = new Worker("/stockfish/stockfish.js");
      workerRef.current = worker;
      worker.postMessage("uci");
      worker.postMessage("setoption name MultiPV value 3");
      worker.onmessage = (event) => {
        const line = typeof event.data === "string" ? event.data : "";
        const best = line.match(/^bestmove\s(\S+)/);
        const info = line.match(/\bmultipv\s+(\d+).*?\bscore\s+(cp|mate)\s+(-?\d+).*?\bpv\s+(.+)$/);
        const cp = line.match(/score cp (-?\d+)/);
        if (info) {
          const multipv = Number(info[1]);
          const evalText = info[2] === "mate" ? `M${info[3]}` : formatEval(Number(info[3]));
          const variation = formatPv(analysisFenRef.current, info[4]);
          setEngineLines((current) => {
            const next = current.filter((item) => item.multipv !== multipv);
            return [...next, { multipv, eval: evalText, variation }].sort((a, b) => a.multipv - b.multipv).slice(0, 3);
          });
        }
        if (best) {
          setBestMove(best[1]);
          setEngineRunning(false);
        }
        if (cp) setEvalCp(parseInt(cp[1], 10));
      };
    } catch {
      // Analysis board still works without engine assets.
    }
    return () => workerRef.current?.terminate();
  }, [withEngine]);

  function refreshBoard() {
    setPosition(gameRef.current.fen());
  }

  const analyze = useCallback((force = false) => {
    const worker = workerRef.current;
    if (!worker || (!engineOn && !force)) return;
    analysisFenRef.current = position;
    setEngineRunning(true);
    setBestMove("");
    setEngineLines([]);
    worker.postMessage("ucinewgame");
    worker.postMessage(`position fen ${position}`);
    worker.postMessage("go depth 16");
  }, [engineOn, position]);

  function commitMove(source: string, target: string, promotion: PromotionPiece = "q") {
    try {
      if (selectedPly < gameRef.current.history().length) {
        gameRef.current = replayGame(selectedPly);
      }
      const move = gameRef.current.move({ from: source, to: target, promotion });
      if (!move) return false;
      setSelectedSquare(null);
      setSelectedPly(gameRef.current.history().length);
      setBestMove("");
      setEvalCp(null);
      setTab("engine");
      setGamifiedBoardObjects((current) => {
        if (!current[target]) return current;
        const next = { ...current };
        delete next[target];
        return next;
      });
      refreshBoard();
      return true;
    } catch {
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

  const moveTargets = useMemo(() => {
    if (!selectedSquare) return [];
    return legalTargetsFromGame(gameRef.current, selectedSquare);
  }, [selectedSquare]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedSquare), [moveTargets, selectedSquare]);

  function onSquareClick(square: string) {
    const clickedPiece = gameRef.current.get(square as any);
    if (selectedSquare && selectedSquare !== square) {
      if (isPromotionMove(gameRef.current, selectedSquare, square)) {
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
    if (clickedPiece && clickedPiece.color === gameRef.current.turn()) {
      setSelectedSquare(square);
      return;
    }
    setSelectedSquare(null);
  }

  function reset() {
    const resetFen = normalizeBoardResourceFen(initialFen) || initialFen || startFen;
    gameRef.current = buildAnalysisGame(resetFen);
    baseFenRef.current = resetFen;
    setBestMove("");
    setEvalCp(null);
    setEngineLines([]);
    setGamifiedBoardObjects({});
    setSelectedPly(0);
    setSelectedSquare(null);
    refreshBoard();
  }

  function loadFen(fen: string, gamifiedObjects?: Record<string, GamifiedObjectId>) {
    try {
      gameRef.current = new Chess(fen);
      baseFenRef.current = fen;
      setBestMove("");
      setEvalCp(null);
      setEngineLines([]);
      setGamifiedBoardObjects(gamifiedObjects || {});
      setSelectedPly(0);
      setSelectedSquare(null);
      refreshBoard();
      setDialog(null);
      return true;
    } catch {
      const normalizedFen = normalizeBoardResourceFen(fen);
      if (!normalizedFen) return false;
      gameRef.current = buildAnalysisGame(normalizedFen);
      baseFenRef.current = normalizedFen;
      setBestMove("");
      setEvalCp(null);
      setEngineLines([]);
      setGamifiedBoardObjects(gamifiedObjects || {});
      setSelectedPly(0);
      setSelectedSquare(null);
      setPosition(normalizedFen);
      setDialog(null);
      return true;
    }
  }

  function loadPgn(pgn: string) {
    try {
      const next = new Chess();
      (next as unknown as { loadPgn: (value: string) => void }).loadPgn(pgn);
      const history = next.history({ verbose: true }) as Array<{ before?: string }>;
      gameRef.current = next;
      baseFenRef.current = history[0]?.before || normalizeBoardResourceFen(extractFenHeader(pgn)) || startFen;
      setSelectedPly(history.length);
      setBestMove("");
      setEvalCp(null);
      setEngineLines([]);
      setGamifiedBoardObjects({});
      refreshBoard();
      setDialog(null);
      return true;
    } catch {
      const fen = normalizeBoardResourceFen(extractFenHeader(pgn));
      if (!fen) return false;
      gameRef.current = buildAnalysisGame(fen);
      baseFenRef.current = fen;
      setSelectedPly(0);
      setBestMove("");
      setEvalCp(null);
      setEngineLines([]);
      setGamifiedBoardObjects({});
      setPosition(fen);
      setDialog(null);
      return true;
    }
  }

  function loadPgnCollection(games: PgnLibraryGame[], index = 0) {
    const safeIndex = Math.max(0, Math.min(games.length - 1, index));
    const game = games[safeIndex];
    if (!game) return false;
    if (!loadPgn(game.pgn)) return false;
    setLibraryQueue(games);
    setLibraryQueueIndex(safeIndex);
    toast.success(games.length > 1 ? `Loaded ${safeIndex + 1} of ${games.length}: ${game.title}` : `Loaded ${game.title}`);
    return true;
  }

  function loadAdjacentQueuedPgn(direction: 1 | -1) {
    if (libraryQueue.length < 2) return;
    const nextIndex = Math.max(0, Math.min(libraryQueue.length - 1, libraryQueueIndex + direction));
    if (nextIndex === libraryQueueIndex) return;
    loadPgnCollection(libraryQueue, nextIndex);
  }

  function replayGame(ply: number) {
    const history = gameRef.current.history({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>;
    const next = buildAnalysisGame(baseFenRef.current);
    history.slice(0, ply).forEach((move) => {
      try {
        next.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      } catch {
        // Stop replaying if a permissive board has no legal continuation.
      }
    });
    return next;
  }

  const goToPly = useCallback((ply: number) => {
    const next = replayGame(ply);
    setSelectedPly(ply);
    setPosition(next.fen());
  }, []);

  function goPrevious() {
    goToPly(Math.max(0, selectedPly - 1));
  }

  function goNext() {
    goToPly(Math.min(gameRef.current.history().length, selectedPly + 1));
  }

  const goPreviousMemo = useCallback(() => {
    goToPly(Math.max(0, selectedPly - 1));
  }, [goToPly, selectedPly]);

  const goNextMemo = useCallback(() => {
    goToPly(Math.min(gameRef.current.history().length, selectedPly + 1));
  }, [goToPly, selectedPly]);

  useEffect(() => {
    if (!engineOn) return;
    const timer = window.setTimeout(() => analyze(true), 120);
    return () => window.clearTimeout(timer);
  }, [analyze, engineOn]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (dialog) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPreviousMemo();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNextMemo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, goNextMemo, goPreviousMemo]);

  async function saveCurrentPgn(title: string, folder?: string) {
    const pgn = gameRef.current.pgn() || `[Event "${title}"]\n[FEN "${gameRef.current.fen()}"]\n[SetUp "1"]\n\n*`;
    try {
      const response = await fetch("/api/pgn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, pgn, folder, visibility: "private" }),
      });
      if (!response.ok) throw new Error("Could not save this PGN.");
      toast.success("Saved to PGN library");
      setDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this PGN.");
    }
  }

  return (
    <div className={["flex min-h-[calc(100dvh-76px)] flex-col overflow-y-auto rounded-xl p-2 transition-colors sm:p-3 md:h-[calc(100vh-92px)] md:min-h-[640px] md:overflow-hidden", isDark ? "bg-black text-white" : "bg-white text-slate-950"].join(" ")}>
      <div className="mb-2 flex flex-none flex-col gap-2 sm:flex-row sm:items-start sm:justify-between md:mb-3 md:gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl">Analysis Board</h1>
          <p className={`mt-0.5 text-xs sm:mt-1 sm:text-sm ${mutedText}`}>Analyze positions, create annotations, save and share your analyses</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary gap-2 px-5" onClick={() => setDialog("pgn")}>
            <ArrowDownToLine size={17} /> Load Game
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-2 md:min-h-0 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className={`order-1 min-h-[430px] overflow-auto rounded-lg border p-2 sm:p-4 md:min-h-0 xl:order-1 ${panelClass}`}>
          <div className="flex justify-center">
            <div className="grid grid-cols-[18px_minmax(0,auto)] gap-1 sm:grid-cols-[24px_minmax(0,auto)] sm:gap-2">
              <div className={`grid grid-rows-8 pb-7 pt-1 text-right text-[11px] font-semibold sm:text-xs ${mutedText}`}>
                {ranks.map((rank) => <span key={rank}>{rank}</span>)}
              </div>
              <div>
                <div ref={boardWrapRef} className="relative w-full max-w-[540px]">
                  <Chessboard
                    position={position}
                    onPieceDrop={onDrop}
                    onSquareClick={onSquareClick as any}
                    onPromotionPieceSelect={onPromotionPieceSelect as any}
                    showPromotionDialog={!!pendingPromotion}
                    promotionToSquare={pendingPromotion?.to as any}
                    promotionDialogVariant="modal"
                    boardOrientation={orientation}
                    boardWidth={boardSize}
                    snapToCursor
                    animationDuration={120}
                    customSquareStyles={moveHintStyles as any}
                    customDarkSquareStyle={{ backgroundColor: squareTheme.dark }}
                    customLightSquareStyle={{ backgroundColor: squareTheme.light }}
                    customDropSquareStyle={{ boxShadow: "inset 0 0 0 5px rgba(90, 19, 114, 0.35)" }}
                    customPieces={customPieces}
                  />
                  <GamifiedBoardOverlay objects={gamifiedBoardObjects} boardWidth={boardSize} orientation={orientation} />
                  <button className="absolute right-2 top-2 rounded-full bg-brand p-2 text-white shadow-lg sm:-right-10" aria-label="Board information">
                    <Info size={16} />
                  </button>
                </div>
                <div className={`mt-1.5 grid grid-cols-8 text-center text-[11px] font-semibold sm:mt-2 sm:text-xs ${mutedText}`} style={{ width: boardSize }}>
                  {files.map((file) => <span key={file}>{file.toUpperCase()}</span>)}
                </div>
              </div>
            </div>
          </div>

          <div className={`mx-auto mt-3 grid max-w-[560px] grid-cols-3 gap-2 text-xs sm:mt-4 sm:gap-3 sm:text-sm ${mutedText}`}>
            <div><span className={isDark ? "text-white" : "text-slate-950"}>Turn:</span> {gameRef.current.turn() === "w" ? "White" : "Black"}</div>
            <div><span className={isDark ? "text-white" : "text-slate-950"}>Status:</span> {gameRef.current.isGameOver() ? "Complete" : "In Progress"}</div>
            <div><span className={isDark ? "text-white" : "text-slate-950"}>Orientation:</span> {orientation}</div>
          </div>

          <div className={`mt-4 border-t ${isDark ? "border-slate-200/70" : "border-slate-200"}`} />
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:gap-2">
            <button className={controlButton(isDark)} onClick={() => setOrientation(orientation === "white" ? "black" : "white")}><Maximize2 size={15} /> Flip</button>
            <button className={controlButton(isDark)} onClick={reset}><RotateCcw size={15} /> Reset</button>
            <button className={controlButton(isDark)} onClick={() => setDialog("fen")}><Clipboard size={15} /> FEN</button>
            <button className={controlButton(isDark)} onClick={() => setDialog("pgn")}><FileText size={15} /> PGN</button>
            <button className={controlButton(isDark)} onClick={() => setDialog("setup")}><Grid3X3 size={15} /> Setup board</button>
            <button className={controlButton(isDark)} onClick={() => setDialog("settings")}><Settings size={15} /> Settings</button>
            <button
              className={engineOn ? "btn-primary gap-2" : controlButton(isDark)}
              onClick={() => {
                const next = !engineOn;
                setEngineOn(next);
                setTab("engine");
                if (next) window.setTimeout(() => analyze(true), 0);
                else setEngineRunning(false);
              }}
            >
              <Zap size={15} /> {engineOn ? "Stop Engine" : "Start Engine"}
            </button>
            <button className="btn-primary gap-2" onClick={() => setDialog("save")}><Save size={15} /> Save</button>
          </div>
          {libraryQueue.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-sm text-purple-900">
              <span className="max-w-[280px] truncate font-semibold">{libraryQueueIndex + 1} / {libraryQueue.length}: {libraryQueue[libraryQueueIndex]?.title}</span>
              <button className="rounded-md border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-40" onClick={() => loadAdjacentQueuedPgn(-1)} disabled={libraryQueueIndex === 0}>Previous PGN</button>
              <button className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" onClick={() => loadAdjacentQueuedPgn(1)} disabled={libraryQueueIndex >= libraryQueue.length - 1}>Next PGN</button>
            </div>
          )}
        </section>

        <aside className={`order-2 min-h-[320px] overflow-auto rounded-lg border p-3 sm:p-4 md:min-h-0 xl:order-2 ${panelClass}`}>
          <TabBar active={tab} isDark={isDark} onChange={setTab} />
          {tab === "moves" && <MovesPanel rows={moveRows} isDark={isDark} selectedPly={selectedPly} onSelect={goToPly} onPrevious={goPrevious} onNext={goNext} canPrevious={selectedPly > 0} canNext={selectedPly < gameRef.current.history().length} />}
          {tab === "engine" && (
            <EnginePanel
              isDark={isDark}
              engineOn={engineOn}
              running={engineRunning}
              bestMove={bestMove}
              evalCp={evalCp}
              lines={engineLines}
              onToggle={() => {
                const next = !engineOn;
                setEngineOn(next);
                if (next) window.setTimeout(() => analyze(true), 0);
                else setEngineRunning(false);
              }}
            />
          )}
          {tab === "pdf" && (
            <PdfPanel
              isDark={isDark}
              pdfName={pdfName}
              inputRef={pdfInputRef}
              onPick={(file) => setPdfName(file?.name || "")}
            />
          )}
        </aside>
      </div>

      {dialog === "pgn" && <PgnDialog isDark={isDark} onClose={() => setDialog(null)} onLoad={loadPgn} onLoadCollection={loadPgnCollection} />}
      {dialog === "fen" && <FenDialog isDark={isDark} currentFen={gameRef.current.fen()} onClose={() => setDialog(null)} onLoad={loadFen} />}
      {dialog === "setup" && <SetupDialog isDark={isDark} currentFen={position} boardTheme={boardTheme} pieceTheme={pieceTheme} initialGamifiedObjects={gamifiedBoardObjects} onClose={() => setDialog(null)} onLoad={loadFen} />}
      {dialog === "settings" && <SettingsDialog isDark={isDark} scale={boardScale} boardTheme={boardTheme} pieceTheme={pieceTheme} onScale={setBoardScale} onBoardTheme={setBoardTheme} onPieceTheme={setPieceTheme} onClose={() => setDialog(null)} />}
      {dialog === "save" && <SaveDialog isDark={isDark} onClose={() => setDialog(null)} onSave={saveCurrentPgn} />}
    </div>
  );
}

function formatEval(cp: number) {
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

function formatPv(fen: string, pv: string) {
  const game = new Chess(fen);
  const san: string[] = [];
  pv.split(/\s+/).slice(0, 8).forEach((uci) => {
    try {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
      if (move) san.push(move.san);
    } catch {
      // Ignore unreadable engine continuation moves.
    }
  });
  return san.join(" ") || pv;
}

function pieceCodeToBoardPiece(piece: PieceCode) {
  return `${piece === piece.toUpperCase() ? "w" : "b"}${piece.toUpperCase()}`;
}

function boardPieceToPieceCode(piece: string): PieceCode {
  const color = piece[0];
  const kind = piece[1] as Uppercase<PieceCode>;
  return (color === "w" ? kind : kind.toLowerCase()) as PieceCode;
}

function setupToBoardPosition(setup: Record<string, PieceCode>) {
  return Object.entries(setup).reduce<Record<string, string>>((position, [square, piece]) => {
    position[square] = pieceCodeToBoardPiece(piece);
    return position;
  }, {});
}

function parseFenSetup(fen: string) {
  const [board = "", turn = "w", rights = "-"] = fen.split(/\s+/);
  const setup: Record<string, PieceCode> = {};

  board.split("/").forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      const empty = Number(char);
      if (Number.isInteger(empty) && empty > 0) {
        fileIndex += empty;
        continue;
      }
      const file = files[fileIndex];
      const rank = ranks[rankIndex];
      if (file && rank) setup[`${file}${rank}`] = char as PieceCode;
      fileIndex += 1;
    }
  });

  return {
    setup,
    turn: turn === "b" ? "b" as const : "w" as const,
    castling: {
      K: rights.includes("K"),
      Q: rights.includes("Q"),
      k: rights.includes("k"),
      q: rights.includes("q"),
    },
  };
}

function pieceThemeClass(theme: PieceTheme, piece: PieceCode) {
  if (theme === "alpha") return piece === piece.toUpperCase() ? "text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_0.75)]" : "text-slate-950";
  if (theme === "neo") return piece === piece.toUpperCase() ? "text-slate-50 [text-shadow:_0_2px_0_rgb(15_23_42)]" : "text-slate-900";
  return piece === piece.toUpperCase() ? "text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_0.9)]" : "text-black";
}

function renderPieceFace(piece: PieceCode, theme: PieceTheme, sizeClass = "text-3xl") {
  if (theme === "classic") {
    return <span className={`${sizeClass} font-serif leading-none ${pieceThemeClass(theme, piece)}`}>{pieceGlyph(piece)}</span>;
  }
  if (theme === "alpha") {
    return <span className={`${sizeClass} font-serif font-bold leading-none ${pieceThemeClass(theme, piece)}`}>{pieceGlyph(piece)}</span>;
  }
  return <span className={`${sizeClass} font-sans font-black leading-none ${pieceThemeClass(theme, piece)}`}>{pieceGlyph(piece)}</span>;
}

function createCustomPieces(theme: PieceTheme) {
  if (theme === "classic") return undefined;
  const pieces: PieceCode[] = ["P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"];
  return pieces.reduce<Record<string, (props: { squareWidth?: number }) => JSX.Element>>((acc, piece) => {
    acc[pieceCodeToBoardPiece(piece)] = ({ squareWidth }) => (
      <div className="flex h-full w-full items-center justify-center" style={{ fontSize: Math.max(24, Math.round((squareWidth || 64) * 0.72)) }}>
        {renderPieceFace(piece, theme, "")}
      </div>
    );
    return acc;
  }, {});
}

function isPieceCode(value: SetupSelection): value is PieceCode {
  return ["p", "n", "b", "r", "q", "k", "P", "N", "B", "R", "Q", "K"].includes(value);
}

function isGamifiedObjectId(value: SetupSelection): value is GamifiedObjectId {
  return gamifiedObjects.some((object) => object.id === value);
}

function getGamifiedObject(id: GamifiedObjectId) {
  return gamifiedObjects.find((object) => object.id === id)!;
}

function controlButton(isDark: boolean) {
  return [
    "btn gap-2 border",
    isDark ? "border-ink-600 bg-transparent text-white hover:bg-white/5" : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  ].join(" ");
}

function TabBar({ active, isDark, onChange }: { active: SideTab; isDark: boolean; onChange: (tab: SideTab) => void }) {
  return (
    <div className={`mb-8 inline-flex rounded-lg p-1 ${isDark ? "bg-black" : "bg-slate-100"}`}>
      {(["moves", "engine", "pdf"] as SideTab[]).map((tab) => (
        <button
          key={tab}
          className={[
            "rounded-md px-6 py-2 text-sm font-medium capitalize",
            active === tab ? (isDark ? "bg-ink-700 text-white shadow" : "bg-white text-slate-950 shadow") : (isDark ? "text-blue-200/80" : "text-slate-600"),
          ].join(" ")}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function MovesPanel({
  rows,
  isDark,
  selectedPly,
  onSelect,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: {
  rows: MoveRow[];
  isDark: boolean;
  selectedPly: number;
  onSelect: (ply: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
}) {
  return (
    <div className={`rounded-lg ${isDark ? "bg-transparent" : "bg-slate-50"}`}>
      <div className={`flex items-center justify-between border-b px-4 py-4 text-lg font-semibold ${isDark ? "border-ink-600 text-white" : "border-slate-100 text-slate-950"}`}>
        Move History
        <Copy size={16} className={isDark ? "text-blue-200/70" : "text-slate-500"} />
      </div>
      {rows.length ? (
        <div className="max-h-[360px] overflow-y-auto p-4 text-sm">
          {rows.map((row) => (
            <div key={row.number} className="grid grid-cols-[28px_1fr_1fr] gap-2 py-1">
              <span className={isDark ? "pt-2 text-blue-200/70" : "pt-2 text-slate-500"}>{row.number}.</span>
              <MoveButton label={row.white} active={selectedPly === row.whitePly} isDark={isDark} onClick={() => onSelect(row.whitePly)} />
              <MoveButton label={row.black} active={selectedPly === row.blackPly} isDark={isDark} onClick={() => row.blackPly && onSelect(row.blackPly)} />
            </div>
          ))}
        </div>
      ) : (
        <div className={`flex min-h-[115px] items-center justify-center text-sm ${isDark ? "text-blue-200/70" : "text-slate-500"}`}>No moves recorded yet</div>
      )}
      <div className="flex justify-center gap-2 pb-4">
        <button className={`rounded-md px-4 py-3 ${canPrevious ? isDark ? "bg-ink-700 text-white" : "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-300"}`} onClick={onPrevious} disabled={!canPrevious}><ChevronLeft size={18} /></button>
        <button className={`rounded-md px-4 py-3 ${canNext ? isDark ? "bg-ink-700 text-white" : "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-300"}`} onClick={onNext} disabled={!canNext}><ChevronRight size={18} /></button>
      </div>
      <div className={`mx-5 border-t py-4 text-sm ${isDark ? "border-ink-600 text-blue-200/70" : "border-slate-100 text-slate-500"}`}>
        <button className="inline-flex items-center gap-2"><BookOpen size={15} /> Add game description</button>
      </div>
    </div>
  );
}

function MoveButton({ label, active, isDark, onClick }: { label?: string; active: boolean; isDark: boolean; onClick: () => void }) {
  if (!label) return <span />;
  return (
    <button
      className={[
        "rounded px-3 py-2 text-left font-medium transition",
        active ? "bg-black text-white" : isDark ? "bg-ink-700 text-blue-100 hover:bg-ink-600" : "bg-blue-100 text-blue-700 hover:bg-blue-200",
      ].join(" ")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function EnginePanel({
  isDark,
  engineOn,
  running,
  bestMove,
  evalCp,
  lines,
  onToggle,
}: {
  isDark: boolean;
  engineOn: boolean;
  running: boolean;
  bestMove: string;
  evalCp: number | null;
  lines: EngineLine[];
  onToggle: () => void;
}) {
  const visibleLines = lines.length
    ? lines.map((line) => ({ eval: line.eval, moves: line.variation }))
    : bestMove
      ? [{ eval: evalCp !== null ? formatEval(evalCp) : "0.00", moves: bestMove }, ...sampleEngineLines.slice(1)]
      : sampleEngineLines;

  return (
    <div>
      <div className={`mb-6 flex items-center justify-between border-b pb-4 ${isDark ? "border-ink-600" : "border-slate-100"}`}>
        <div className="flex items-center gap-3">
          <button
            className={`relative h-6 w-12 rounded-full ${engineOn ? "bg-brand" : isDark ? "bg-ink-600" : "bg-slate-200"}`}
            onClick={onToggle}
            aria-label="Toggle analysis engine"
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${engineOn ? "left-7" : "left-1"}`} />
          </button>
          <span>Analysis Engine</span>
          <Settings size={15} className={isDark ? "text-blue-200/70" : "text-slate-500"} />
        </div>
        <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">{running ? "Running" : engineOn ? "Ready" : "Off"}</span>
      </div>
      <div className="space-y-4">
        {visibleLines.map((line, index) => (
          <div key={index} className={`rounded-lg border p-4 shadow-sm ${isDark ? "border-ink-600 bg-black/20" : "border-slate-100 bg-white"}`}>
            <div className="mb-3 font-semibold">{line.eval}</div>
            <div className={isDark ? "text-blue-200/80" : "text-blue-900/70"}>{line.moves}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaveDialog({ isDark, onClose, onSave }: { isDark: boolean; onClose: () => void; onSave: (title: string, folder?: string) => Promise<void> }) {
  const [items, setItems] = useState<PgnLibraryItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [title, setTitle] = useState("Analysis Game");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/pgn", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, []);

  const folders = useMemo(() => {
    const paths = new Set<string>();
    items.forEach((item) => {
      const path = normalizeFolderPath(item.folder);
      if (!path) return;
      paths.add(path);
      let parent = path;
      while (parent.includes("/")) {
        parent = parent.split("/").slice(0, -1).join("/");
        if (parent) paths.add(parent);
      }
    });
    return Array.from(paths).sort((a, b) => a.localeCompare(b));
  }, [items]);
  const visibleFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return folders
      .map((path) => ({ path, name: folderLabel(path) }))
      .filter((folder) => getImmediateChildPath(activeFolder || "", folder.path) === folder.path)
      .filter((folder) => !q || folder.name.toLowerCase().includes(q));
  }, [activeFolder, folders, query]);
  const folder = newFolder.trim() ? (activeFolder ? `${activeFolder}/${newFolder.trim()}` : newFolder.trim()) : selectedFolder || activeFolder || undefined;

  return (
    <ModalFrame isDark={isDark} title="Chess Games Library" onClose={onClose} width="max-w-[640px]">
      <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 ${isDark ? "text-blue-100" : "text-slate-700"}`}>
        <div className="inline-flex items-center gap-2"><BookOpen size={16} /> Games</div>
        <div className="flex gap-2">
          <input className="input w-[210px]" placeholder={activeFolder ? "Search inside folder" : "Search folders"} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${isDark ? "bg-black/20" : "bg-slate-50"}`}>
        <button className={`inline-flex items-center gap-1 ${activeFolder ? "text-blue-600" : "font-semibold text-slate-900"}`} onClick={() => { setActiveFolder(null); setSelectedFolder(""); }}>
          <BookOpen size={14} /> Library
        </button>
        {activeFolder && folderBreadcrumbs(activeFolder).map((item) => (
          <span key={item.path} className="contents">
            <ChevronRight size={14} className={isDark ? "text-blue-200/40" : "text-slate-400"} />
            <button className={`${item.path === activeFolder ? "font-semibold text-slate-900" : "text-blue-600"}`} onClick={() => { setActiveFolder(item.path); setSelectedFolder(item.path); }}>
              {item.name}
            </button>
          </span>
        ))}
      </div>
      <label className="mb-2 block text-sm font-semibold">PGN Title</label>
      <input className="input mb-4" value={title} onChange={(event) => setTitle(event.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleFolders.map((folder) => (
          <button
            key={folder.path}
            className={[
              "flex h-20 items-center gap-4 rounded-lg border px-5 text-left",
              selectedFolder === folder.path ? "border-brand bg-brand/10" : isDark ? "border-ink-600 bg-black/20" : "border-slate-200 bg-white",
            ].join(" ")}
            onClick={() => {
              setSelectedFolder(folder.path);
              setActiveFolder(folder.path);
              setNewFolder("");
            }}
          >
            <BookOpen size={24} className={isDark ? "text-blue-200" : "text-slate-500"} />
            {folder.name}
          </button>
        ))}
      </div>
      {!visibleFolders.length && <div className={`rounded-lg border border-dashed p-4 text-sm ${isDark ? "border-ink-600 text-blue-200/70" : "border-slate-200 text-slate-500"}`}>No folders found here.</div>}
      <label className="mb-2 mt-5 block text-sm font-semibold">Or create folder</label>
      <input className="input" placeholder={activeFolder ? `New folder inside ${folderLabel(activeFolder)}` : "New folder name"} value={newFolder} onChange={(event) => setNewFolder(event.target.value)} />
      <p className={`mt-4 text-sm ${isDark ? "text-blue-200/70" : "text-slate-500"}`}>Select the folder or PGN where you want to save the game</p>
      <div className="mt-6 flex justify-end gap-3">
        <button className={controlButton(isDark)} onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          disabled={saving || !title.trim()}
          onClick={() => {
            setSaving(true);
            onSave(title.trim(), folder).finally(() => setSaving(false));
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalFrame>
  );
}

function PdfPanel({
  isDark,
  pdfName,
  inputRef,
  onPick,
}: {
  isDark: boolean;
  pdfName: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (file?: File) => void;
}) {
  if (pdfName) {
    return (
      <div>
        <div className={`mb-5 flex items-center justify-between px-3 py-3 ${isDark ? "bg-black/30" : "bg-slate-50"}`}>
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <FileText size={16} className="text-emerald-500" />
            <span className="truncate">{pdfName}</span>
          </div>
          <button className="text-sm font-medium text-red-400" onClick={() => onPick(undefined)}>Clear</button>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <button className={controlButton(isDark)}><Grid3X3 size={15} /> Take Snap</button>
          <button className={controlButton(isDark)}><ChevronLeft size={15} /></button>
          <span className="rounded-md border px-4 py-2 text-sm">1 / 1</span>
          <button className={controlButton(isDark)}><ChevronRight size={15} /></button>
          <button className={controlButton(isDark)}>−</button>
          <span className="text-sm font-semibold">100%</span>
          <button className={controlButton(isDark)}>+</button>
        </div>
        <div className={`flex h-[420px] items-center justify-center overflow-hidden rounded-lg border ${isDark ? "border-ink-600 bg-black" : "border-slate-200 bg-slate-100"}`}>
          <div className={`max-w-[360px] text-center text-sm ${isDark ? "text-blue-200/70" : "text-slate-500"}`}>
            PDF preview is ready for the capture workflow. Accurate diagram-to-FEN extraction can be added later with a dedicated detection pass.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mt-12 flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center ${isDark ? "border-ink-600 bg-black text-white" : "border-slate-200 bg-slate-50 text-slate-950"}`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => onPick(event.target.files?.[0])}
      />
      <div className={`mb-5 rounded-full p-5 ${isDark ? "bg-ink-700 text-gray-300" : "bg-white text-slate-500 shadow"}`}>
        <Upload size={28} />
      </div>
      <div className="text-lg font-semibold">Drop your PDF here</div>
      <div className={isDark ? "mt-2 text-blue-200/70" : "mt-2 text-slate-500"}>or click to browse files</div>
      <div className={isDark ? "mt-8 text-xs text-blue-200/60" : "mt-8 text-xs text-slate-400"}>Supports PDF files up to 50MB</div>
    </div>
  );
}

function PgnDialog({
  isDark,
  onClose,
  onLoad,
  onLoadCollection,
}: {
  isDark: boolean;
  onClose: () => void;
  onLoad: (pgn: string) => boolean;
  onLoadCollection: (games: PgnLibraryGame[]) => boolean;
}) {
  const [pgn, setPgn] = useState("");
  const [error, setError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);

  function loadLibraryGame(games: PgnLibraryGame[]) {
    if (!games.length) return;
    if (onLoadCollection(games)) {
      onClose();
    } else {
      setError("That library selection could not be loaded.");
    }
  }

  return (
    <ModalFrame isDark={isDark} title="Load PGN Game" subtitle="Load from the master library, paste a PGN, or upload a PGN file." onClose={onClose} width="max-w-[520px]">
      <button
        type="button"
        onClick={() => setLibraryOpen(true)}
        className="mb-4 flex w-full items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-left text-sm font-semibold text-purple-800 hover:bg-purple-100"
      >
        <span className="inline-flex items-center gap-2"><BookOpen size={16} /> Load from master PGN library</span>
        <ChevronRight size={16} />
      </button>
      <label className={`mb-5 flex h-[118px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-sm ${isDark ? "border-ink-600 text-blue-200/70" : "border-slate-200 text-slate-500"}`}>
        Drag & Drop a PGN file here
        <span className="mt-2">or click to browse</span>
        <input
          type="file"
          accept=".pgn"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            file.text().then(setPgn).catch(() => setError("Could not read that PGN file."));
          }}
        />
      </label>
      <label className="mb-2 block text-sm font-semibold">Or paste PGN text</label>
      <textarea className="input min-h-[116px] resize-y" placeholder="Paste PGN here..." value={pgn} onChange={(event) => setPgn(event.target.value)} />
      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
      <div className="mt-6 flex justify-end gap-3">
        <button className={controlButton(isDark)} onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => pgn.trim() && (onLoad(pgn) || setError("That PGN could not be loaded."))}>Load Position</button>
      </div>
      <PgnLibraryPicker open={libraryOpen} mode="multiple" onClose={() => setLibraryOpen(false)} onSelect={loadLibraryGame} />
    </ModalFrame>
  );
}

function FenDialog({ isDark, currentFen, onClose, onLoad }: { isDark: boolean; currentFen: string; onClose: () => void; onLoad: (fen: string) => boolean }) {
  const [fen, setFen] = useState("");
  const [error, setError] = useState("");

  return (
    <ModalFrame isDark={isDark} title="Load FEN Position" subtitle="Enter a FEN string to load a specific board position." onClose={onClose} width="max-w-[460px]">
      <div className="mb-8">
        <div className="mb-1 flex items-center justify-between text-sm font-semibold">
          Current Position
          <button className="inline-flex items-center gap-2 text-xs" onClick={() => navigator.clipboard?.writeText(currentFen)}><Copy size={14} /> Copy</button>
        </div>
        <div className={isDark ? "mb-4 text-xs text-blue-200/70" : "mb-4 text-xs text-slate-500"}>FEN notation of the current board state</div>
        <div className="break-all font-mono text-xs">{currentFen}</div>
      </div>
      <label className="mb-2 block text-sm font-semibold">Load New Position</label>
      <input className="input" placeholder="e.g. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" value={fen} onChange={(event) => setFen(event.target.value)} />
      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
      <div className="mt-16 flex justify-end gap-3">
        <button className={controlButton(isDark)} onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => fen.trim() && (onLoad(fen) || setError("That FEN could not be loaded."))}>Load Position</button>
      </div>
    </ModalFrame>
  );
}

function SetupDialog({
  isDark,
  currentFen,
  boardTheme,
  pieceTheme,
  initialGamifiedObjects,
  onClose,
  onLoad,
}: {
  isDark: boolean;
  currentFen: string;
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  initialGamifiedObjects: Record<string, GamifiedObjectId>;
  onClose: () => void;
  onLoad: (fen: string, gamifiedObjects?: Record<string, GamifiedObjectId>) => boolean;
}) {
  const current = useMemo(() => parseFenSetup(currentFen), [currentFen]);
  const [setupTab, setSetupTab] = useState<SetupTab>("general");
  const [setup, setSetup] = useState<Record<string, PieceCode>>(current.setup);
  const [gamifiedSetup, setGamifiedSetup] = useState<Record<string, GamifiedObjectId>>(initialGamifiedObjects);
  const [selectedItem, setSelectedItem] = useState<SetupSelection>("P");
  const [draggedObjectSquare, setDraggedObjectSquare] = useState<string | null>(null);
  const [turn, setTurn] = useState<"w" | "b">(current.turn);
  const [castling, setCastling] = useState(current.castling);
  const [fenInput, setFenInput] = useState("");

  const fen = buildFen(setup, turn, castling);
  const setupPieceTheme = pieceTheme;
  const setupBoardTheme = boardTheme;
  const setupCustomPieces = useMemo(() => createCustomPieces(setupPieceTheme), [setupPieceTheme]);

  function place(square: string) {
    if (setupTab === "gamified") {
      if (isGamifiedObjectId(selectedItem)) {
        setSetup((currentSetup) => {
          const nextSetup = { ...currentSetup };
          delete nextSetup[square];
          return nextSetup;
        });
      }
      setGamifiedSetup((currentObjects) => {
        const next = { ...currentObjects };
        if (selectedItem === "delete") delete next[square];
        else if (isGamifiedObjectId(selectedItem)) next[square] = selectedItem;
        return next;
      });
      return;
    }

    setSetup((currentSetup) => {
      const next = { ...currentSetup };
      if (selectedItem === "delete") delete next[square];
      else if (isPieceCode(selectedItem)) next[square] = selectedItem;
      return next;
    });
    if (isPieceCode(selectedItem)) {
      setGamifiedSetup((currentObjects) => {
        const nextObjects = { ...currentObjects };
        delete nextObjects[square];
        return nextObjects;
      });
    }
  }

  function moveSetupPiece(sourceSquare: string, targetSquare: string, piece: string) {
    setSetup((currentSetup) => {
      const next = { ...currentSetup };
      delete next[sourceSquare];
      next[targetSquare] = boardPieceToPieceCode(piece);
      return next;
    });
    setGamifiedSetup((currentObjects) => {
      const nextObjects = { ...currentObjects };
      delete nextObjects[targetSquare];
      return nextObjects;
    });
    return true;
  }

  function deleteSetupPiece(sourceSquare: string) {
    setSetup((currentSetup) => {
      const next = { ...currentSetup };
      delete next[sourceSquare];
      return next;
    });
  }

  function moveGamifiedObject(targetSquare: string) {
    setSetup((currentSetup) => {
      const nextSetup = { ...currentSetup };
      delete nextSetup[targetSquare];
      return nextSetup;
    });
    setGamifiedSetup((currentObjects) => {
      const next = { ...currentObjects };
      if (draggedObjectSquare && currentObjects[draggedObjectSquare]) {
        next[targetSquare] = currentObjects[draggedObjectSquare];
        delete next[draggedObjectSquare];
      } else if (isGamifiedObjectId(selectedItem)) {
        next[targetSquare] = selectedItem;
      }
      return next;
    });
    setDraggedObjectSquare(null);
  }

  function deleteGamifiedObject(square: string) {
    setGamifiedSetup((currentObjects) => {
      const next = { ...currentObjects };
      delete next[square];
      return next;
    });
  }

  function loadFenIntoSetup(value: string) {
    try {
      const parsed = parseFenSetup(new Chess(value).fen());
      setSetup(parsed.setup);
      setTurn(parsed.turn);
      setCastling(parsed.castling);
      return true;
    } catch {
      const normalizedFen = normalizeBoardResourceFen(value);
      if (!normalizedFen) return false;
      const parsed = parseFenSetup(normalizedFen);
      setSetup(parsed.setup);
      setTurn(parsed.turn);
      setCastling(parsed.castling);
      return true;
    }
  }

  function resetToStart() {
    const parsed = parseFenSetup(startFen);
    setSetup(parsed.setup);
    setTurn(parsed.turn);
    setCastling(parsed.castling);
    setGamifiedSetup({});
  }

  function resetToCurrent() {
    setSetup(current.setup);
    setTurn(current.turn);
    setCastling(current.castling);
    setGamifiedSetup({});
  }

  return (
    <ModalFrame isDark={isDark} title="Customize Position" onClose={onClose} width="max-w-[900px]">
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div>
          <div className={`mb-5 inline-flex rounded-lg p-1 ${isDark ? "bg-black" : "bg-slate-100"}`}>
            <button className={setupTabButton(setupTab === "general", isDark)} onClick={() => setSetupTab("general")}>Chess Pieces</button>
            <button className={setupTabButton(setupTab === "gamified", isDark)} onClick={() => setSetupTab("gamified")}>Gamified Objects</button>
          </div>
          <PiecePalette selected={selectedItem} onPick={setSelectedItem} dark={setupTab === "gamified"} pieceTheme={setupPieceTheme} />
          <div className="relative touch-none overflow-hidden rounded-md">
            <Chessboard
              id="analysis-setup-board"
              position={setupToBoardPosition(setup)}
              boardWidth={300}
              onPieceDrop={moveSetupPiece}
              onPieceDropOffBoard={deleteSetupPiece}
              onSquareClick={(square) => place(square)}
              dropOffBoardAction="trash"
              snapToCursor
              animationDuration={120}
              customDarkSquareStyle={{ backgroundColor: boardThemes[setupBoardTheme].dark }}
              customLightSquareStyle={{ backgroundColor: boardThemes[setupBoardTheme].light }}
              customDropSquareStyle={{ boxShadow: "inset 0 0 0 5px rgba(90, 19, 114, 0.35)" }}
              customPieces={setupCustomPieces}
            />
            {setupTab === "gamified" && (
              <GamifiedObjectLayer
                objects={gamifiedSetup}
                selected={selectedItem}
                boardWidth={300}
                onPlace={moveGamifiedObject}
                onDelete={deleteGamifiedObject}
                onDragStart={setDraggedObjectSquare}
                onDragEnd={() => setDraggedObjectSquare(null)}
              />
            )}
          </div>
          <PiecePalette selected={selectedItem} onPick={setSelectedItem} dark={false} white pieceTheme={setupPieceTheme} />
          <button
            className={[
              "mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold transition",
              selectedItem === "delete" ? "border-red-400 bg-red-50 text-red-700" : isDark ? "border-ink-600 text-blue-100 hover:bg-white/5" : "border-slate-300 text-slate-600 hover:bg-slate-50",
            ].join(" ")}
            onClick={() => setSelectedItem("delete")}
          >
            <Trash2 size={17} /> Delete {setupTab === "gamified" ? "objects" : "pieces"}
          </button>
          <div className={`mt-2 text-xs ${isDark ? "text-blue-200/70" : "text-slate-500"}`}>
            {setupTab === "gamified"
              ? "Select an object and tap a square, or drag objects between squares. Select delete and tap an object to remove it."
              : "Drag pieces on the board, drag pieces off the board to remove them, or select delete and tap squares."}
          </div>
        </div>

        <div>
          {setupTab === "general" ? (
            <>
              <div className="mb-5 flex gap-3">
                <input className="input" placeholder="Enter FEN position (e.g., 8/8/8/8/8/8/8/8 w - - 0 1)" value={fenInput} onChange={(event) => setFenInput(event.target.value)} />
                <button className="btn-primary" onClick={() => fenInput.trim() && !loadFenIntoSetup(fenInput) && toast.error("Invalid FEN")}>Load</button>
              </div>
              <MoveSideControl turn={turn} onTurn={setTurn} />
              <CastlingControl castling={castling} onCastling={setCastling} />
            </>
          ) : (
            <GamifiedOptions turn={turn} onTurn={setTurn} selected={selectedItem} onSelect={setSelectedItem} />
          )}
          <div className="mt-6 flex flex-wrap gap-4">
            <button className={controlButton(isDark)} onClick={resetToStart}><RotateCcw size={15} /> Start position</button>
            <button className={controlButton(isDark)} onClick={resetToCurrent}>Current position</button>
            <button className={controlButton(isDark)} onClick={() => { setSetup({}); setGamifiedSetup({}); }}>Clear board</button>
          </div>
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <button className="btn-primary" onClick={() => onLoad(fen, gamifiedSetup)}>Load Position</button>
      </div>
    </ModalFrame>
  );
}

function SettingsDialog({
  isDark,
  scale,
  boardTheme,
  pieceTheme,
  onScale,
  onBoardTheme,
  onPieceTheme,
  onClose,
}: {
  isDark: boolean;
  scale: number;
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  onScale: (value: number) => void;
  onBoardTheme: (value: BoardTheme) => void;
  onPieceTheme: (value: PieceTheme) => void;
  onClose: () => void;
}) {
  return (
    <ModalFrame isDark={isDark} title="Analysis Board Settings" onClose={onClose} width="max-w-[560px]">
      <div className="mt-8">
        <div className={isDark ? "mb-4 text-sm font-semibold text-gray-400" : "mb-4 text-sm font-semibold text-slate-500"}>Chessboard Size</div>
        <div className="relative">
          <input
            type="range"
            min={50}
            max={125}
            step={25}
            value={scale}
            onChange={(event) => onScale(Number(event.target.value))}
            className="w-full accent-brand"
          />
          <div className="absolute -top-9 rounded-md bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700" style={{ left: `calc(${((scale - 50) / 75) * 100}% - 24px)` }}>{scale}%</div>
        </div>
        <div className={`mt-1 flex justify-between text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
          <span>Compact (50%)</span>
          <span className="text-blue-500">Default (100%)</span>
          <span>Large (125%)</span>
        </div>
        <p className={`mt-5 text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>Adjust the chessboard size to fit your screen perfectly</p>

        <div className="mt-8">
          <div className={isDark ? "mb-3 text-sm font-semibold text-gray-400" : "mb-3 text-sm font-semibold text-slate-500"}>Piece Style</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["classic", "alpha", "neo"] as PieceTheme[]).map((theme) => (
              <button
                key={theme}
                className={[
                  "rounded-lg border p-3 text-left transition",
                  pieceTheme === theme ? "border-brand bg-brand/10" : isDark ? "border-ink-600 bg-black/20" : "border-slate-200 bg-white",
                ].join(" ")}
                onClick={() => onPieceTheme(theme)}
              >
                <div className="mb-2 flex items-center gap-2">
                  {renderPieceFace("K", theme, "text-3xl")}
                  {renderPieceFace("q", theme, "text-3xl")}
                </div>
                <div className="text-sm font-semibold capitalize">{theme}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <div className={isDark ? "mb-3 text-sm font-semibold text-gray-400" : "mb-3 text-sm font-semibold text-slate-500"}>Board Colors</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.entries(boardThemes) as Array<[BoardTheme, { name: string; light: string; dark: string }]>).map(([key, theme]) => (
              <button
                key={key}
                className={[
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition",
                  boardTheme === key ? "border-brand bg-brand/10" : isDark ? "border-ink-600 bg-black/20" : "border-slate-200 bg-white",
                ].join(" ")}
                onClick={() => onBoardTheme(key)}
              >
                <span className="grid h-9 w-9 grid-cols-2 overflow-hidden rounded">
                  <span style={{ backgroundColor: theme.light }} />
                  <span style={{ backgroundColor: theme.dark }} />
                  <span style={{ backgroundColor: theme.dark }} />
                  <span style={{ backgroundColor: theme.light }} />
                </span>
                <span className="text-sm font-semibold">{theme.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({ isDark, title, subtitle, onClose, width, children }: { isDark: boolean; title: string; subtitle?: string; onClose: () => void; width: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-xl p-4 shadow-2xl ${width} ${isDark ? "bg-ink-800 text-white" : "bg-white text-slate-950"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {subtitle && <p className={`mt-2 text-sm ${isDark ? "text-blue-200/75" : "text-slate-500"}`}>{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function setupTabButton(active: boolean, isDark: boolean) {
  return [
    "rounded-md px-7 py-2 text-sm font-semibold",
    active ? (isDark ? "bg-ink-700 text-white" : "bg-white text-slate-950 shadow") : (isDark ? "text-blue-200/70" : "text-slate-500"),
  ].join(" ");
}

function GamifiedBoardOverlay({
  objects,
  boardWidth,
  orientation,
}: {
  objects: Record<string, GamifiedObjectId>;
  boardWidth: number;
  orientation: "white" | "black";
}) {
  const squareSize = boardWidth / 8;
  const visibleRanks = orientation === "white" ? ranks : [...ranks].reverse();
  const visibleFiles = orientation === "white" ? files : [...files].reverse();

  if (!Object.keys(objects).length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-8 grid-rows-8">
      {visibleRanks.flatMap((rank) =>
        visibleFiles.map((file) => {
          const square = `${file}${rank}`;
          const object = objects[square] ? getGamifiedObject(objects[square]) : null;
          return (
            <div key={square} className="flex items-center justify-center">
              {object && (
                <span
                  className="flex items-center justify-center rounded-full bg-white/95 shadow-lg ring-2 ring-black/10"
                  style={{ width: squareSize * 0.62, height: squareSize * 0.62, fontSize: squareSize * 0.34 }}
                  title={object.label}
                >
                  {object.icon}
                </span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

function GamifiedObjectLayer({
  objects,
  selected,
  boardWidth,
  onPlace,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  objects: Record<string, GamifiedObjectId>;
  selected: SetupSelection;
  boardWidth: number;
  onPlace: (square: string) => void;
  onDelete: (square: string) => void;
  onDragStart: (square: string) => void;
  onDragEnd: () => void;
}) {
  const squareSize = boardWidth / 8;

  return (
    <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
      {ranks.flatMap((rank) =>
        files.map((file) => {
          const square = `${file}${rank}`;
          const object = objects[square] ? getGamifiedObject(objects[square]) : null;
          return (
            <button
              key={square}
              className="relative flex items-center justify-center"
              onClick={(event) => {
                event.stopPropagation();
                if (selected === "delete" && object) {
                  onDelete(square);
                  return;
                }
                if (isGamifiedObjectId(selected)) onPlace(square);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPlace(square);
              }}
              aria-label={object ? `${object.label} on ${square}` : `Place object on ${square}`}
            >
              {object && (
                <span
                  draggable
                  className="flex cursor-grab items-center justify-center rounded-full bg-white/90 shadow-lg ring-2 ring-black/10 active:cursor-grabbing"
                  style={{ width: squareSize * 0.68, height: squareSize * 0.68, fontSize: squareSize * 0.38 }}
                  title={object.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selected === "delete") onDelete(square);
                    if (isGamifiedObjectId(selected)) onPlace(square);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onDelete(square);
                  }}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    onDragStart(square);
                  }}
                  onDragEnd={onDragEnd}
                >
                  {object.icon}
                </span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}

function PiecePalette({ selected, onPick, dark, pieceTheme, white = false }: { selected: SetupSelection; onPick: (piece: SetupSelection) => void; dark: boolean; pieceTheme: PieceTheme; white?: boolean }) {
  const pieces: Array<PieceCode | "delete"> = white ? ["P", "N", "B", "R", "Q", "K", "delete"] : ["p", "n", "b", "r", "q", "k", "delete"];
  return (
    <div className="mb-2 flex gap-1">
      {pieces.map((piece) => (
        <button
          key={piece}
          className={[
            "flex h-9 w-9 items-center justify-center rounded-md border text-xl shadow-sm transition",
            piece === "delete"
              ? dark ? "border-slate-700 bg-black text-white hover:bg-slate-900" : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
              : piece === piece.toUpperCase()
                ? "border-slate-700 bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
            selected === piece ? "ring-2 ring-brand" : "",
          ].join(" ")}
          onClick={() => onPick(piece)}
        >
          {piece === "delete" ? <span className="text-xs font-semibold">Del</span> : renderPieceFace(piece, pieceTheme, "text-2xl")}
        </button>
      ))}
    </div>
  );
}

function SetupGrid({ setup, onPlace, boardTheme, pieceTheme }: { setup: Record<string, PieceCode>; onPlace: (square: string) => void; boardTheme: BoardTheme; pieceTheme: PieceTheme }) {
  const theme = boardThemes[boardTheme];
  return (
    <div className="grid h-[300px] w-[300px] grid-cols-8 grid-rows-8">
      {ranks.flatMap((rank, rankIndex) =>
        files.map((file, fileIndex) => {
          const square = `${file}${rank}`;
          const piece = setup[square];
          return (
            <button
              key={square}
              className="flex items-center justify-center text-3xl"
              style={{ backgroundColor: (rankIndex + fileIndex) % 2 === 0 ? theme.light : theme.dark }}
              onClick={() => onPlace(square)}
            >
              {piece ? renderPieceFace(piece, pieceTheme, "text-3xl") : ""}
            </button>
          );
        }),
      )}
    </div>
  );
}

function MoveSideControl({ turn, onTurn }: { turn: "w" | "b"; onTurn: (turn: "w" | "b") => void }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-sm font-semibold">white/black to move:</div>
      <div className="inline-flex rounded-md border border-ink-600/40">
        <button className={`rounded-l-md px-4 py-2 text-sm ${turn === "w" ? "bg-brand text-white" : ""}`} onClick={() => onTurn("w")}>White</button>
        <button className={`rounded-r-md px-4 py-2 text-sm ${turn === "b" ? "bg-brand text-white" : ""}`} onClick={() => onTurn("b")}>Black</button>
      </div>
    </div>
  );
}

function CastlingControl({ castling, onCastling }: { castling: { K: boolean; Q: boolean; k: boolean; q: boolean }; onCastling: (value: { K: boolean; Q: boolean; k: boolean; q: boolean }) => void }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold">White:</div>
      <label className="mr-4"><input type="checkbox" checked={castling.K} onChange={(event) => onCastling({ ...castling, K: event.target.checked })} className="mr-2 accent-brand" />O-O</label>
      <label><input type="checkbox" checked={castling.Q} onChange={(event) => onCastling({ ...castling, Q: event.target.checked })} className="mr-2 accent-brand" />O-O-O</label>
      <div className="font-semibold">Black:</div>
      <label className="mr-4"><input type="checkbox" checked={castling.k} onChange={(event) => onCastling({ ...castling, k: event.target.checked })} className="mr-2 accent-brand" />O-O</label>
      <label><input type="checkbox" checked={castling.q} onChange={(event) => onCastling({ ...castling, q: event.target.checked })} className="mr-2 accent-brand" />O-O-O</label>
    </div>
  );
}

function GamifiedOptions({
  turn,
  onTurn,
  selected,
  onSelect,
}: {
  turn: "w" | "b";
  onTurn: (turn: "w" | "b") => void;
  selected: SetupSelection;
  onSelect: (selection: SetupSelection) => void;
}) {
  const groups: GamifiedObject["group"][] = ["Food", "Toys", "Animals", "Rewards", "Emoji"];
  const gameObjects = gamifiedObjects.filter((object) => object.group !== "Blocks");
  const blockObjects = gamifiedObjects.filter((object) => object.group === "Blocks");

  return (
    <div>
      <MoveSideControl turn={turn} onTurn={onTurn} />
      <div className="mb-4 font-semibold">Gamified Icons</div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {groups.map((group) => {
          const groupObject = gamifiedObjects.find((object) => object.group === group)!;
          return (
            <button
              key={group}
              className="rounded-md px-2 py-2 text-center text-sm transition hover:bg-brand/10"
              onClick={() => onSelect(groupObject.id)}
            >
              <span className="mb-1 block text-2xl">{groupObject.icon}</span>
              {group}
            </button>
          );
        })}
      </div>
      <div className="mb-5 border-t border-slate-300/60 pt-4">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {gameObjects.map((object) => (
            <GamifiedObjectButton
              key={object.id}
              object={object}
              active={selected === object.id}
              onSelect={() => onSelect(object.id)}
            />
          ))}
        </div>
      </div>
      <div className="mb-4 border-t border-slate-300/60 pt-4 font-semibold">Blocks Icons</div>
      <div className="grid grid-cols-4 gap-3">
        {blockObjects.map((object) => (
          <GamifiedObjectButton
            key={object.id}
            object={object}
            active={selected === object.id}
            onSelect={() => onSelect(object.id)}
          />
        ))}
      </div>
    </div>
  );
}

function GamifiedObjectButton({ object, active, onSelect }: { object: GamifiedObject; active: boolean; onSelect: () => void }) {
  return (
    <button
      className={[
        "flex min-h-20 flex-col items-center justify-center rounded-lg border px-2 py-3 text-center text-sm transition",
        active ? "border-brand bg-brand/10 text-brand shadow-sm" : "border-slate-200 hover:border-brand/50 hover:bg-brand/5",
      ].join(" ")}
      onClick={onSelect}
      title={object.label}
    >
      <span className="text-3xl leading-none">{object.icon}</span>
      <span className="mt-2 text-xs font-semibold">{object.label}</span>
    </button>
  );
}

function LegacyGamifiedOptions({ turn, onTurn }: { turn: "w" | "b"; onTurn: (turn: "w" | "b") => void }) {
  return (
    <div>
      <MoveSideControl turn={turn} onTurn={onTurn} />
      <div className="mb-4 font-semibold">Gamified Icons</div>
      <div className="mb-4 grid grid-cols-5 gap-4 text-center text-sm">
        {["🍔 Food", "🧸 Toys", "🐶 Animals", "🏆 Rewards", "😊 Emoji"].map((item) => <div key={item}>{item}</div>)}
      </div>
      <div className="mb-4 border-t border-slate-300/60 pt-4 font-semibold">Blocks Icons</div>
      <div className="grid grid-cols-4 gap-5 text-3xl">
        <span>🚧</span><span>🧱</span><span>🪨</span><span>🪵</span>
      </div>
    </div>
  );
}

function buildFen(setup: Record<string, PieceCode>, turn: "w" | "b", castling: { K: boolean; Q: boolean; k: boolean; q: boolean }) {
  const board = ranks.map((rank) => {
    let row = "";
    let empty = 0;
    files.forEach((file) => {
      const piece = setup[`${file}${rank}`];
      if (!piece) {
        empty += 1;
        return;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      row += piece;
    });
    return row + (empty ? empty : "");
  }).join("/");
  const rights = `${castling.K ? "K" : ""}${castling.Q ? "Q" : ""}${castling.k ? "k" : ""}${castling.q ? "q" : ""}` || "-";
  return `${board} ${turn} ${rights} - 0 1`;
}
