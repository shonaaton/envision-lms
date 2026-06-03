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

const levelToElo = [500, 650, 800, 950, 1100, 1250, 1400, 1550, 1700, 1850, 2000, 2200];
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
  const [boardWidth, setBoardWidth] = useState(536);
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

    const resize = () => setBoardWidth(Math.max(280, Math.min(536, element.clientWidth)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
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
    return (
      <GameHistory
        records={records}
        onBack={() => setShowHistory(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Play with Computer</h1>
          <p className="mt-1 text-sm text-blue-200/80">Challenge yourself against different levels of computer opponents.</p>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-ink-600 bg-ink-800 p-1">
          {status === "playing" ? (
            <button className="btn-outline gap-2 border-red-500/40 text-red-300 hover:bg-red-500/10" onClick={resignGame}>
              <Flag size={16} /> Resign
            </button>
          ) : (
            <button className="btn-primary gap-2" onClick={() => setShowSetup(true)}>
              <Play size={16} /> Start Game
            </button>
          )}
          <button className="btn-ghost ml-1" onClick={() => setShowHistory(true)}>View History</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_488px]">
        <section className="rounded-lg border border-ink-600 bg-ink-800 p-5 md:p-8">
          <div className="flex min-h-[360px] items-center justify-center md:min-h-[560px]">
            <div ref={boardWrapRef} className="relative w-full max-w-[536px]">
              <Chessboard
                position={position}
                onPieceDrop={onDrop}
                boardOrientation={playerColor}
                boardWidth={boardWidth}
                customDarkSquareStyle={{ backgroundColor: "#8b6748" }}
                customLightSquareStyle={{ backgroundColor: "#b6a486" }}
              />
              {status === "idle" && (
                <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[5px]">
                  <div className="rounded-xl bg-white/18 px-8 py-7 text-center shadow-xl ring-1 ring-white/15">
                    <div className="mb-4 text-sm font-semibold text-white">Ready to Play?</div>
                    <button className="btn-primary gap-2 px-5" onClick={() => setShowSetup(true)}>
                      <Play size={16} /> Start New Game
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-ink-600 bg-ink-800 p-5">
          <div className="mb-5 text-right text-sm font-medium text-blue-300">
            {status === "playing" ? "In Progress" : status === "ended" ? result : "Not Started"}
          </div>
          {status === "playing" && (
            <div className="mb-5 rounded-lg border border-ink-600 p-6 text-center">
              <div className="flex items-center justify-center gap-4 text-sm font-semibold text-white">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2">
                  <User size={15} className="text-brand-300" /> You <span className="h-2 w-2 rounded-full bg-white" />
                </span>
                <span className="text-gray-300">vs</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2">
                  <Bot size={15} /> Computer <span className="h-2 w-2 rounded-full border border-white/60" />
                </span>
              </div>
              <div className="mt-4 text-sm text-blue-200/80">{thinking ? "Computer thinking..." : isPlayerTurn ? "Your turn" : "Computer turn"}</div>
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
    <div className="rounded-lg border border-ink-600 p-6">
      <div className="mb-5 flex items-center gap-3">
        <History size={18} className="text-brand-400" />
        <h2 className="text-xl font-semibold text-white">Move History</h2>
      </div>
      <div className="mb-6 flex items-center justify-between text-gray-400">
        <div className="flex gap-5">
          <ChevronsLeft size={16} />
          <ChevronLeft size={16} />
        </div>
        <div className="flex gap-5">
          <ChevronRight size={16} />
          <ChevronsRight size={16} />
        </div>
      </div>
      <div className="grid grid-cols-[52px_1fr_1fr] pb-3 text-sm font-semibold text-white">
        <span>#</span>
        <span>White</span>
        <span>Black</span>
      </div>
      {rows.length > 0 ? (
        <div className="max-h-[300px] overflow-y-auto text-sm text-gray-200">
          {rows.map((row) => (
            <div key={row.number} className="grid grid-cols-[52px_1fr_1fr] border-t border-ink-600/70 py-3">
              <span className="text-gray-400">{row.number}</span>
              <span>{row.white}</span>
              <span>{row.black}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[270px] flex-col items-center justify-center text-center">
          <RotateCcw size={30} className="mb-3 text-gray-400" />
          <div className="font-semibold text-blue-200/80">No moves yet</div>
          <div className="text-sm text-blue-200/70">Moves will appear here</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-[480px] rounded-lg border border-ink-600 bg-ink-800 p-5 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">New Game</h2>
          <button className="text-gray-200 hover:text-white" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 text-center text-sm text-gray-400">
          Color: <span className="font-semibold text-white capitalize">{selectedColor}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ColorOption active={selectedColor === "white"} label="White" icon={<span className="text-3xl">♔</span>} onClick={() => onColorChange("white")} />
          <ColorOption active={selectedColor === "black"} label="Black" icon={<span className="text-3xl">♚</span>} onClick={() => onColorChange("black")} light />
          <ColorOption active={selectedColor === "random"} label="Random" icon={<Shuffle size={28} />} onClick={() => onColorChange("random")} />
        </div>

        <div className="mt-7 text-center text-sm text-gray-400">
          Level: <span className="font-semibold text-white">{levelToElo[level - 1]} ELO</span>
        </div>
        <div className="mt-4 grid grid-cols-12 items-start gap-3">
          {levelToElo.map((_, index) => (
            <button
              key={index}
              className="flex flex-col items-center gap-2"
              onClick={() => onLevelChange(index + 1)}
              aria-label={`Level ${index + 1}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${level === index + 1 ? "ring-2 ring-white bg-brand-400" : "bg-white"}`} />
              <span className="text-xs text-black">{index + 1}</span>
            </button>
          ))}
        </div>

        <label className="mt-7 block text-sm font-medium text-gray-400">Time Control</label>
        <div className="relative mt-2">
          <select
            className="input appearance-none pr-10"
            value={timeControl}
            onChange={(event) => onTimeControlChange(event.target.value)}
          >
            {timeControls.map((control) => <option key={control}>{control}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <button className="btn-ghost border border-ink-600" onClick={onClose}>Cancel</button>
          <button className="btn-primary gap-2" onClick={onStart}>
            <Play size={16} /> Start Game
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorOption({ active, label, icon, light, onClick }: { active: boolean; label: string; icon: ReactNode; light?: boolean; onClick: () => void }) {
  return (
    <button
      className={[
        "flex h-[86px] flex-col items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition",
        active ? "border-brand-400 ring-1 ring-brand-500" : "border-ink-600",
        light ? "bg-slate-200 text-slate-900" : "bg-ink-800 text-gray-300 hover:bg-white/5",
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
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-white">Game History</h1>
        <p className="mt-1 text-sm text-blue-200/80">Review your past games and track your progress</p>
      </div>

      <div className="flex items-center gap-5">
        <button className="btn-ghost gap-2 border border-ink-600 px-4" onClick={onBack}>
          <ChevronLeft size={16} /> Back to Game
        </button>
        <div className="text-white">Play with Computer <span className="ml-2 text-gray-500">›</span></div>
      </div>

      <div className="grid gap-4 rounded-lg border border-ink-600 bg-ink-800 p-8 md:grid-cols-3">
        <Stat icon={<Trophy size={16} className="text-emerald-400" />} label="Victories" value={totals.victories} />
        <Stat icon={<Clock3 size={16} className="text-accent" />} label="Draws" value={totals.draws} />
        <Stat icon={<Shield size={16} className="text-red-400" />} label="Defeats" value={totals.defeats} />
      </div>

      <div className="flex justify-end">
        <select className="input w-[186px]">
          <option>All Results</option>
          <option>Victories</option>
          <option>Draws</option>
          <option>Defeats</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink-600 bg-ink-800">
        <div className="min-w-[980px]">
        <div className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_0.8fr_1fr] border-b border-ink-600 px-4 py-4 text-sm font-medium text-blue-200/80">
          <span>User</span>
          <span>Date</span>
          <span>Color</span>
          <span>Difficulty</span>
          <span>Result</span>
          <span>Moves</span>
          <span>Actions</span>
        </div>
        {records.map((record) => (
          <div key={record.id} className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_0.8fr_1fr] border-b border-ink-600/80 px-4 py-4 text-sm font-semibold text-white last:border-b-0">
            <span>{record.user}</span>
            <span>{record.date}</span>
            <span><span className={`inline-block h-4 w-4 rounded-full border ${record.color === "white" ? "bg-white" : "bg-black"}`} /></span>
            <span>{record.difficulty}</span>
            <span className={record.result === "Draw" ? "text-accent" : record.result === "Defeat" ? "text-red-300" : "text-blue-200/80"}>{record.result === "Draw" ? "- Draw" : record.result}</span>
            <span>{record.moves}</span>
            <button className="inline-flex items-center gap-2 text-left text-white">
              <Play size={14} className="text-brand-400" /> View details
            </button>
          </div>
        ))}
        </div>
      </div>

      <div className="flex justify-end">
        <div className="inline-flex items-center gap-1">
          <button className="btn-ghost px-2"><ChevronLeft size={16} /></button>
          <button className="rounded-md border border-brand-500 bg-brand-900/40 px-3 py-1 text-brand-200">1</button>
          <button className="btn-ghost px-2"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="flex items-center gap-2 text-blue-200/80">{icon}{label}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}
