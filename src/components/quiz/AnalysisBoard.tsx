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
  Moon,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Sun,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type SideTab = "moves" | "engine" | "pdf";
type ThemeMode = "dark" | "light";
type DialogName = "pgn" | "fen" | "setup" | "settings" | "save" | null;
type PieceCode = "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K";
type SetupTab = "general" | "gamified";

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

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const lightSquare = "#efd6a8";
const darkSquare = "#bd8d62";
const pieceSymbols: Record<PieceCode, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  K: "♔",
};

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

export default function AnalysisBoard({ initialFen, withEngine = true }: { initialFen?: string; withEngine?: boolean }) {
  const gameRef = useRef(new Chess(initialFen || undefined));
  const baseFenRef = useRef(initialFen || startFen);
  const workerRef = useRef<Worker | null>(null);
  const analysisFenRef = useRef(initialFen || gameRef.current.fen());
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [position, setPosition] = useState(initialFen || gameRef.current.fen());
  const [selectedPly, setSelectedPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [tab, setTab] = useState<SideTab>("engine");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [dialog, setDialog] = useState<DialogName>(null);
  const [boardWidth, setBoardWidth] = useState(520);
  const [boardScale, setBoardScale] = useState(100);
  const [engineOn, setEngineOn] = useState(true);
  const [engineRunning, setEngineRunning] = useState(false);
  const [bestMove, setBestMove] = useState("");
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  const [pdfName, setPdfName] = useState("");

  const isDark = theme === "dark";
  const panelClass = isDark ? "border-ink-600 bg-ink-800 text-white" : "border-slate-200 bg-white text-slate-950";
  const mutedText = isDark ? "text-blue-200/75" : "text-slate-500";
  const boardSize = Math.round(boardWidth * (boardScale / 100));

  const moveRows = useMemo<MoveRow[]>(() => {
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
  }, [position]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => setBoardWidth(Math.max(280, Math.min(560, element.clientWidth)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
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

  useEffect(() => {
    if (!engineOn) return;
    const timer = window.setTimeout(() => analyze(true), 120);
    return () => window.clearTimeout(timer);
  }, [position, engineOn]);

  function refreshBoard() {
    setPosition(gameRef.current.fen());
  }

  function analyze(force = false) {
    const worker = workerRef.current;
    if (!worker || (!engineOn && !force)) return;
    analysisFenRef.current = position;
    setEngineRunning(true);
    setBestMove("");
    setEngineLines([]);
    worker.postMessage("ucinewgame");
    worker.postMessage(`position fen ${position}`);
    worker.postMessage("go depth 16");
  }

  function onDrop(source: string, target: string) {
    try {
      if (selectedPly < gameRef.current.history().length) {
        gameRef.current = replayGame(selectedPly);
      }
      const move = gameRef.current.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      setSelectedPly(gameRef.current.history().length);
      setBestMove("");
      setEvalCp(null);
      setTab("engine");
      refreshBoard();
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    gameRef.current = new Chess(initialFen || undefined);
    baseFenRef.current = initialFen || startFen;
    setBestMove("");
    setEvalCp(null);
    setEngineLines([]);
    setSelectedPly(0);
    refreshBoard();
  }

  function loadFen(fen: string) {
    try {
      gameRef.current = new Chess(fen);
      baseFenRef.current = fen;
      setBestMove("");
      setEvalCp(null);
      setEngineLines([]);
      setSelectedPly(0);
      refreshBoard();
      setDialog(null);
      return true;
    } catch {
      return false;
    }
  }

  function loadPgn(pgn: string) {
    try {
      const next = new Chess();
      (next as unknown as { loadPgn: (value: string) => void }).loadPgn(pgn);
      gameRef.current = next;
      baseFenRef.current = startFen;
      setSelectedPly(next.history().length);
      setBestMove("");
      setEvalCp(null);
      setEngineLines([]);
      refreshBoard();
      setDialog(null);
      return true;
    } catch {
      return false;
    }
  }

  function replayGame(ply: number) {
    const history = gameRef.current.history({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>;
    const next = new Chess(baseFenRef.current);
    history.slice(0, ply).forEach((move) => {
      next.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    });
    return next;
  }

  function goToPly(ply: number) {
    const next = replayGame(ply);
    setSelectedPly(ply);
    setPosition(next.fen());
  }

  function goPrevious() {
    goToPly(Math.max(0, selectedPly - 1));
  }

  function goNext() {
    goToPly(Math.min(gameRef.current.history().length, selectedPly + 1));
  }

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
    <div className={["rounded-lg p-4 transition-colors", isDark ? "bg-black text-white" : "bg-white text-slate-950"].join(" ")}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Analysis Board</h1>
          <p className={`mt-1 text-sm ${mutedText}`}>Analyze positions, create annotations, save and share your analyses</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={controlButton(isDark)} onClick={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />} {isDark ? "Light" : "Dark"}
          </button>
          <button className="btn-primary gap-2 px-5" onClick={() => setDialog("pgn")}>
            <ArrowDownToLine size={17} /> Load Game
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1 xl:grid-cols-[minmax(0,1fr)_560px]">
        <section className={`rounded-lg border p-6 ${panelClass}`}>
          <div className="flex justify-center">
            <div className="grid grid-cols-[24px_minmax(0,auto)] gap-2">
              <div className={`grid grid-rows-8 pb-7 pt-1 text-right text-xs font-semibold ${mutedText}`}>
                {ranks.map((rank) => <span key={rank}>{rank}</span>)}
              </div>
              <div>
                <div ref={boardWrapRef} className="relative w-full max-w-[560px]">
                  <Chessboard
                    position={position}
                    onPieceDrop={onDrop}
                    boardOrientation={orientation}
                    boardWidth={boardSize}
                    customDarkSquareStyle={{ backgroundColor: darkSquare }}
                    customLightSquareStyle={{ backgroundColor: lightSquare }}
                  />
                  <button className="absolute -right-10 top-2 rounded-full bg-brand p-2 text-white shadow-lg" aria-label="Board information">
                    <Info size={16} />
                  </button>
                </div>
                <div className={`mt-2 grid grid-cols-8 text-center text-xs font-semibold ${mutedText}`} style={{ width: boardSize }}>
                  {files.map((file) => <span key={file}>{file.toUpperCase()}</span>)}
                </div>
              </div>
            </div>
          </div>

          <div className={`mx-auto mt-4 grid max-w-[560px] grid-cols-1 gap-3 text-sm sm:grid-cols-3 ${mutedText}`}>
            <div><span className={isDark ? "text-white" : "text-slate-950"}>Turn:</span> {gameRef.current.turn() === "w" ? "White" : "Black"}</div>
            <div><span className={isDark ? "text-white" : "text-slate-950"}>Status:</span> {gameRef.current.isGameOver() ? "Complete" : "In Progress"}</div>
            <div><span className={isDark ? "text-white" : "text-slate-950"}>Orientation:</span> {orientation}</div>
          </div>

          <div className={`mt-6 border-t ${isDark ? "border-slate-200/70" : "border-slate-200"}`} />
          <div className="mt-5 flex flex-wrap justify-center gap-2">
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
        </section>

        <aside className={`rounded-lg border p-6 ${panelClass}`}>
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

      {dialog === "pgn" && <PgnDialog isDark={isDark} onClose={() => setDialog(null)} onLoad={loadPgn} />}
      {dialog === "fen" && <FenDialog isDark={isDark} currentFen={gameRef.current.fen()} onClose={() => setDialog(null)} onLoad={loadFen} />}
      {dialog === "setup" && <SetupDialog isDark={isDark} onClose={() => setDialog(null)} onLoad={loadFen} />}
      {dialog === "settings" && <SettingsDialog isDark={isDark} scale={boardScale} onScale={setBoardScale} onClose={() => setDialog(null)} />}
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
  const [newFolder, setNewFolder] = useState("");
  const [title, setTitle] = useState("Analysis Game");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/pgn")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, []);

  const folders = Array.from(new Set(["Beginners Level", ...items.map((item) => item.folder).filter(Boolean) as string[]]));
  const folder = newFolder.trim() || selectedFolder || undefined;

  return (
    <ModalFrame isDark={isDark} title="Chess Games Library" onClose={onClose} width="max-w-[640px]">
      <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 ${isDark ? "text-blue-100" : "text-slate-700"}`}>
        <div className="inline-flex items-center gap-2"><BookOpen size={16} /> Games</div>
        <div className="flex gap-2">
          <input className="input w-[210px]" placeholder="Search games, folders, ..." />
          <button className={controlButton(isDark)}><Plus size={15} /> New Folder</button>
        </div>
      </div>
      <label className="mb-2 block text-sm font-semibold">PGN Title</label>
      <input className="input mb-4" value={title} onChange={(event) => setTitle(event.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        {folders.map((folderName) => (
          <button
            key={folderName}
            className={[
              "flex h-20 items-center gap-4 rounded-lg border px-5 text-left",
              selectedFolder === folderName ? "border-brand bg-brand/10" : isDark ? "border-ink-600 bg-black/20" : "border-slate-200 bg-white",
            ].join(" ")}
            onClick={() => {
              setSelectedFolder(folderName);
              setNewFolder("");
            }}
          >
            <BookOpen size={24} className={isDark ? "text-blue-200" : "text-slate-500"} />
            {folderName}
          </button>
        ))}
      </div>
      <label className="mb-2 mt-5 block text-sm font-semibold">Or create folder</label>
      <input className="input" placeholder="New folder name" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} />
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

function PgnDialog({ isDark, onClose, onLoad }: { isDark: boolean; onClose: () => void; onLoad: (pgn: string) => boolean }) {
  const [pgn, setPgn] = useState("");
  const [error, setError] = useState("");

  return (
    <ModalFrame isDark={isDark} title="Load PGN Game" subtitle="Paste a PGN game or drag-and-drop a PGN file." onClose={onClose} width="max-w-[470px]">
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

function SetupDialog({ isDark, onClose, onLoad }: { isDark: boolean; onClose: () => void; onLoad: (fen: string) => boolean }) {
  const [setupTab, setSetupTab] = useState<SetupTab>("general");
  const [setup, setSetup] = useState<Record<string, PieceCode>>(initialSetup);
  const [selectedPiece, setSelectedPiece] = useState<PieceCode | "delete">("P");
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [castling, setCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [fenInput, setFenInput] = useState("");

  const fen = buildFen(setup, turn, castling);

  function place(square: string) {
    setSetup((current) => {
      const next = { ...current };
      if (selectedPiece === "delete") delete next[square];
      else next[square] = selectedPiece;
      return next;
    });
  }

  return (
    <ModalFrame isDark={isDark} title="Customize Position" onClose={onClose} width="max-w-[746px]">
      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <div>
          <div className={`mb-5 inline-flex rounded-lg p-1 ${isDark ? "bg-black" : "bg-slate-100"}`}>
            <button className={setupTabButton(setupTab === "general", isDark)} onClick={() => setSetupTab("general")}>General</button>
            <button className={setupTabButton(setupTab === "gamified", isDark)} onClick={() => setSetupTab("gamified")}>Gamified Board</button>
          </div>
          <PiecePalette selected={selectedPiece} onPick={setSelectedPiece} dark={setupTab === "general" ? false : true} />
          <SetupGrid setup={setup} onPlace={place} />
          <PiecePalette selected={selectedPiece} onPick={setSelectedPiece} dark={false} white />
        </div>

        <div>
          {setupTab === "general" ? (
            <>
              <div className="mb-5 flex gap-3">
                <input className="input" placeholder="Enter FEN position (e.g., 8/8/8/8/8/8/8/8 w - - 0 1)" value={fenInput} onChange={(event) => setFenInput(event.target.value)} />
                <button className="btn-primary" onClick={() => fenInput.trim() && onLoad(fenInput)}>Load</button>
              </div>
              <MoveSideControl turn={turn} onTurn={setTurn} />
              <CastlingControl castling={castling} onCastling={setCastling} />
            </>
          ) : (
            <GamifiedOptions />
          )}
          <div className="mt-6 flex flex-wrap gap-4">
            <button className={controlButton(isDark)} onClick={() => setSetup(initialSetup)}><RotateCcw size={15} /> Reset</button>
            <button className={controlButton(isDark)} onClick={() => setSetup({})}>⊘ Clear board</button>
          </div>
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <button className="btn-primary" onClick={() => onLoad(fen)}>Load Fen</button>
      </div>
    </ModalFrame>
  );
}

function SettingsDialog({ isDark, scale, onScale, onClose }: { isDark: boolean; scale: number; onScale: (value: number) => void; onClose: () => void }) {
  return (
    <ModalFrame isDark={isDark} title="Analysis Board Settings" onClose={onClose} width="max-w-[456px]">
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
      </div>
    </ModalFrame>
  );
}

function ModalFrame({ isDark, title, subtitle, onClose, width, children }: { isDark: boolean; title: string; subtitle?: string; onClose: () => void; width: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-lg p-5 shadow-2xl ${width} ${isDark ? "bg-ink-800 text-white" : "bg-white text-slate-950"}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
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

function PiecePalette({ selected, onPick, dark, white = false }: { selected: PieceCode | "delete"; onPick: (piece: PieceCode | "delete") => void; dark: boolean; white?: boolean }) {
  const pieces: Array<PieceCode | "delete"> = white ? ["P", "N", "B", "R", "Q", "K", "delete"] : ["p", "n", "b", "r", "q", "k", "delete"];
  return (
    <div className="mb-2 flex gap-1">
      {pieces.map((piece) => (
        <button
          key={piece}
          className={[
            "flex h-9 w-9 items-center justify-center rounded-md text-xl",
            dark ? "bg-black text-white" : "bg-white text-black",
            selected === piece ? "ring-2 ring-brand" : "",
          ].join(" ")}
          onClick={() => onPick(piece)}
        >
          {piece === "delete" ? "⌫" : pieceSymbols[piece]}
        </button>
      ))}
    </div>
  );
}

function SetupGrid({ setup, onPlace }: { setup: Record<string, PieceCode>; onPlace: (square: string) => void }) {
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
              style={{ backgroundColor: (rankIndex + fileIndex) % 2 === 0 ? lightSquare : darkSquare, color: piece && piece === piece.toUpperCase() ? "#fff" : "#111" }}
              onClick={() => onPlace(square)}
            >
              {piece ? pieceSymbols[piece] : ""}
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

function GamifiedOptions() {
  return (
    <div>
      <MoveSideControl turn="w" onTurn={() => undefined} />
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
