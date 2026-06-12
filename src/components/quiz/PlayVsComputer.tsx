"use client";

import dynamic from "next/dynamic";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Flag,
  History,
  Play,
  RotateCcw,
  Shield,
  Shuffle,
  Trophy,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type PlayerColor = "white" | "black" | "random";
type GameStatus = "idle" | "playing" | "ended";
type GameResult = "Victory" | "Draw" | "Defeat" | "Abandoned";

type MoveRow = {
  number: number;
  white: string;
  black: string;
};

type GameRecord = {
  id: number;
  user: string;
  date: string;
  color: "white" | "black";
  difficulty: string;
  result: GameResult;
  moves: number;
};

const levelToElo = [300, 400, 500, 650, 800, 950, 1100, 1250, 1400, 1600, 1800, 2000];
const timeControls = ["No Clock", "5 min", "10 min", "15 min", "30 min"];

const seededHistory: GameRecord[] = [
  { id: 1, user: "Sayantan Chandra", date: "Jun 4, 2026 2:27 AM", color: "white", difficulty: "Beginner", result: "Abandoned", moves: 0 },
  { id: 2, user: "Diya Yashika Janga", date: "Jun 3, 2026 5:00 PM", color: "white", difficulty: "Beginner", result: "Draw", moves: 13 },
];

export default function PlayVsComputer({ depth = 8 }: { depth?: number }) {
  const gameRef = useRef(new Chess());
  const workerRef = useRef<Worker | null>(null);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(gameRef.current.fen());
  const [boardWidth, setBoardWidth] = useState(520);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedColor, setSelectedColor] = useState<PlayerColor>("white");
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [level, setLevel] = useState(1);
  const [timeControl, setTimeControl] = useState("No Clock");
  const [records, setRecords] = useState<GameRecord[]>(seededHistory);

  const moveRows = useMemo<MoveRow[]>(() => {
    const verbose = gameRef.current.history({ verbose: true }) as Array<{ san: string; color: "w" | "b" }>;
    const rows: MoveRow[] = [];
    verbose.forEach((move, index) => {
      const rowIndex = Math.floor(index / 2);
      if (!rows[rowIndex]) rows[rowIndex] = { number: rowIndex + 1, white: "", black: "" };
      if (move.color === "w") rows[rowIndex].white = move.san;
      else rows[rowIndex].black = move.san;
    });
    return rows;
  }, [position]);

  const currentDepth = Math.max(1, Math.min(16, Math.round(depth + (level - 1) / 2)));
  const difficultyLabel = level <= 4 ? "Beginner" : level <= 8 ? "Intermediate" : "Advanced";
  const isPlayerTurn = gameRef.current.turn() === (playerColor === "white" ? "w" : "b");

  useEffect(() => {
    try {
      const worker = new Worker("/stockfish/stockfish.js");
      workerRef.current = worker;
      worker.postMessage("uci");
      worker.onmessage = (event) => {
        const line = typeof event.data === "string" ? event.data : "";
        const bestMove = line.match(/^bestmove\s(\S+)/);
        if (!bestMove || status !== "playing") return;

        const uci = bestMove[1];
        const move = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" };
        try {
          gameRef.current.move(move);
        } catch {
          // Ignore invalid engine output; the board state remains authoritative.
        }
        setThinking(false);
        refreshBoard();
        checkGameOver();
      };
    } catch {
      // The board still works if the engine asset is unavailable.
    }

    return () => workerRef.current?.terminate();
  }, [status]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => {
      const width = element.clientWidth;
      const heightLimit = window.innerHeight - 250;
      setBoardWidth(Math.max(280, Math.min(540, width, heightLimit)));
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

  function refreshBoard() {
    setPosition(gameRef.current.fen());
  }

  function requestEngineMove() {
    const worker = workerRef.current;
    if (!worker || gameRef.current.isGameOver()) return;
    setThinking(true);
    worker.postMessage(`position fen ${gameRef.current.fen()}`);
    worker.postMessage(`go depth ${currentDepth}`);
  }

  function checkGameOver() {
    const game = gameRef.current;
    if (!game.isGameOver()) return;

    let finalResult = "Draw";
    let recordResult: GameResult = "Draw";
    if (game.isCheckmate()) {
      const winner = game.turn() === "w" ? "black" : "white";
      const playerWon = winner === playerColor;
      recordResult = playerWon ? "Victory" : "Defeat";
      finalResult = playerWon ? "You won" : "Computer won";
    }

    setResult(finalResult);
    setStatus("ended");
    addRecord(recordResult);
  }

  function addRecord(recordResult: GameResult) {
    setRecords((current) => [
      {
        id: Date.now(),
        user: "You",
        date: new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date()),
        color: playerColor,
        difficulty: difficultyLabel,
        result: recordResult,
        moves: gameRef.current.history().length,
      },
      ...current,
    ]);
  }

  function startGame() {
    const color = selectedColor === "random" ? (Math.random() > 0.5 ? "white" : "black") : selectedColor;
    gameRef.current.reset();
    setPlayerColor(color);
    setPosition(gameRef.current.fen());
    setResult("");
    setThinking(false);
    setStatus("playing");
    setShowSetup(false);

    if (color === "black") {
      window.setTimeout(requestEngineMove, 150);
    }
  }

  function restartGame() {
    setShowSetup(true);
  }

  function resignGame() {
    if (status !== "playing") return;
    setThinking(false);
    setResult("You resigned");
    setStatus("ended");
    addRecord("Abandoned");
  }

  function onDrop(source: string, target: string) {
    if (status !== "playing" || thinking || !isPlayerTurn) return false;

    try {
      const move = gameRef.current.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      refreshBoard();
      checkGameOver();
      if (!gameRef.current.isGameOver()) window.setTimeout(requestEngineMove, 150);
      return true;
    } catch {
      return false;
    }
  }

  if (showHistory) {
    return <GameHistory records={records} onBack={() => setShowHistory(false)} />;
  }

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[620px] flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdf8_0%,#fff 48%,#f7f7fb_100%)] p-3 text-slate-950 sm:p-4">
      <div className="mb-3 flex flex-none flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Bot size={14} />
            Play vs Computer
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950">Play with Computer</h1>
          <p className="mt-1 text-sm text-slate-600">Keep the board, game controls, and move list together in one smooth practice screen.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {status === "playing" ? (
            <>
              <button className="btn-outline gap-2 border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={resignGame}>
                <Flag size={16} /> Resign
              </button>
              <button className="btn-outline gap-2 bg-white" onClick={restartGame}>
                <RotateCcw size={16} /> Restart
              </button>
            </>
          ) : (
            <button className="btn-primary gap-2" onClick={() => setShowSetup(true)}>
              <Play size={16} /> Start Game
            </button>
          )}
          <button className="btn-outline gap-2 bg-white" onClick={() => setShowHistory(true)}>
            <History size={16} /> View History
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-brand/5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              Status: <span className="font-black text-slate-950">{status === "playing" ? "In Progress" : status === "ended" ? result : "Not Started"}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {timeControl}
            </div>
          </div>

          <div ref={boardWrapRef} className="flex min-h-0 flex-1 items-center justify-center">
            <div className="relative w-full max-w-[540px]">
              <Chessboard
                position={position}
                onPieceDrop={onDrop}
                boardOrientation={playerColor}
                boardWidth={boardWidth}
                customDarkSquareStyle={{ backgroundColor: "#b58863" }}
                customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
              />
              {status === "idle" && (
                <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[3px]">
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-8 py-7 text-center shadow-xl">
                    <div className="mb-4 text-sm font-semibold text-slate-700">Ready to Play?</div>
                    <button className="btn-primary gap-2 px-5" onClick={() => setShowSetup(true)}>
                      <Play size={16} /> Start New Game
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-brand/5">
          {status === "playing" && (
            <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <div className="flex items-center justify-center gap-4 text-sm font-semibold text-slate-950">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2">
                  <User size={15} className="text-brand" /> You
                </span>
                <span className="text-slate-400">vs</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-white">
                  <Bot size={15} /> Computer
                </span>
              </div>
              <div className="mt-3 text-sm text-slate-600">{thinking ? "Computer thinking..." : isPlayerTurn ? "Your turn" : "Computer turn"}</div>
            </div>
          )}

          <MoveHistory rows={moveRows} />
        </aside>
      </div>

      {showSetup && (
        <SetupModal
          selectedColor={selectedColor}
          level={level}
          timeControl={timeControl}
          onColorChange={setSelectedColor}
          onLevelChange={setLevel}
          onTimeControlChange={setTimeControl}
          onClose={() => setShowSetup(false)}
          onStart={startGame}
        />
      )}
    </div>
  );
}

function MoveHistory({ rows }: { rows: MoveRow[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
        <History size={18} className="text-brand" />
        <h2 className="text-xl font-semibold text-slate-950">Move History</h2>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-slate-400">
        <div className="flex gap-4">
          <ChevronsLeft size={16} />
          <ChevronLeft size={16} />
        </div>
        <div className="flex gap-4">
          <ChevronRight size={16} />
          <ChevronsRight size={16} />
        </div>
      </div>
      <div className="grid grid-cols-[44px_1fr_1fr] px-4 pb-3 text-sm font-semibold text-slate-950">
        <span>#</span>
        <span>White</span>
        <span>Black</span>
      </div>
      {rows.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 text-sm text-slate-700">
          {rows.map((row) => (
            <div key={row.number} className="grid grid-cols-[44px_1fr_1fr] border-t border-slate-100 py-3">
              <span className="text-slate-400">{row.number}</span>
              <span>{row.white}</span>
              <span>{row.black}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center px-4 text-center">
          <RotateCcw size={30} className="mb-3 text-slate-300" />
          <div className="font-semibold text-slate-700">No moves yet</div>
          <div className="text-sm text-slate-500">Moves will appear here</div>
        </div>
      )}
    </div>
  );
}

function SetupModal({
  selectedColor,
  level,
  timeControl,
  onColorChange,
  onLevelChange,
  onTimeControlChange,
  onClose,
  onStart,
}: {
  selectedColor: PlayerColor;
  level: number;
  timeControl: string;
  onColorChange: (color: PlayerColor) => void;
  onLevelChange: (level: number) => void;
  onTimeControlChange: (value: string) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-950">New Game</h2>
          <button className="text-slate-500 hover:text-slate-900" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 text-center text-sm text-slate-500">
          Color: <span className="font-semibold capitalize text-slate-950">{selectedColor}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ColorOption active={selectedColor === "white"} label="White" icon={<span className="text-3xl">K</span>} onClick={() => onColorChange("white")} />
          <ColorOption active={selectedColor === "black"} label="Black" icon={<span className="text-3xl">k</span>} onClick={() => onColorChange("black")} />
          <ColorOption active={selectedColor === "random"} label="Random" icon={<Shuffle size={28} />} onClick={() => onColorChange("random")} />
        </div>

        <div className="mt-6 text-center text-sm text-slate-500">
          Level: <span className="font-semibold text-slate-950">{levelToElo[level - 1]} ELO</span>
        </div>
        <div className="mt-4 grid grid-cols-12 items-start gap-2">
          {levelToElo.map((_, index) => (
            <button
              key={index}
              className="flex flex-col items-center gap-2"
              onClick={() => onLevelChange(index + 1)}
              aria-label={`Level ${index + 1}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${level === index + 1 ? "ring-2 ring-brand bg-brand" : "bg-slate-300"}`} />
              <span className="text-[11px] font-semibold text-slate-600">{index + 1}</span>
            </button>
          ))}
        </div>

        <label className="mt-6 block text-sm font-medium text-slate-600">Time Control</label>
        <div className="relative mt-2">
          <select
            className="input appearance-none pr-10"
            value={timeControl}
            onChange={(event) => onTimeControlChange(event.target.value)}
          >
            {timeControls.map((control) => <option key={control}>{control}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary gap-2" onClick={onStart}>
            <Play size={16} /> Start Game
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorOption({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      className={[
        "flex h-[82px] flex-col items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition",
        active ? "border-brand bg-brand text-white shadow-lg shadow-brand/20" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brand/40",
      ].join(" ")}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function GameHistory({ records, onBack }: { records: GameRecord[]; onBack: () => void }) {
  const totals = records.reduce(
    (summary, record) => {
      if (record.result === "Victory") summary.victories += 1;
      if (record.result === "Draw") summary.draws += 1;
      if (record.result === "Defeat") summary.defeats += 1;
      return summary;
    },
    { victories: 0, draws: 0, defeats: 0 },
  );

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[620px] flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdf8_0%,#fff 48%,#f7f7fb_100%)] p-4 text-slate-950">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Game History</h1>
          <p className="mt-1 text-sm text-slate-600">Review your past games and track your progress</p>
        </div>
        <button className="btn-outline gap-2 bg-white" onClick={onBack}>
          <ChevronLeft size={16} /> Back to Game
        </button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-brand/5 md:grid-cols-3">
        <HistoryStat icon={<Trophy size={16} className="text-emerald-500" />} label="Victories" value={totals.victories} />
        <HistoryStat icon={<Clock3 size={16} className="text-amber-500" />} label="Draws" value={totals.draws} />
        <HistoryStat icon={<Shield size={16} className="text-rose-500" />} label="Defeats" value={totals.defeats} />
      </div>

      <div className="mt-3 flex justify-end">
        <select className="input w-[186px] bg-white">
          <option>All Results</option>
          <option>Victories</option>
          <option>Draws</option>
          <option>Defeats</option>
        </select>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white/95 shadow-lg shadow-brand/5">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_0.8fr_1fr] border-b border-slate-200 px-4 py-4 text-sm font-bold text-slate-500">
            <span>User</span>
            <span>Date</span>
            <span>Color</span>
            <span>Difficulty</span>
            <span>Result</span>
            <span>Moves</span>
            <span>Actions</span>
          </div>
          {records.map((record) => (
            <div key={record.id} className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_0.8fr_1fr] border-b border-slate-100 px-4 py-4 text-sm font-semibold text-slate-800 last:border-b-0">
              <span>{record.user}</span>
              <span>{record.date}</span>
              <span><span className={`inline-block h-4 w-4 rounded-full border ${record.color === "white" ? "border-slate-300 bg-white" : "border-slate-900 bg-slate-950"}`} /></span>
              <span>{record.difficulty}</span>
              <span className={record.result === "Draw" ? "text-amber-600" : record.result === "Defeat" ? "text-rose-600" : "text-emerald-600"}>{record.result === "Draw" ? "Draw" : record.result}</span>
              <span>{record.moves}</span>
              <button className="inline-flex items-center gap-2 text-left text-slate-900">
                <Play size={14} className="text-brand" /> View details
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-slate-600">{icon}{label}</div>
      <div className="text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}
