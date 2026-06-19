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
  Medal,
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
type GameResult = "Victory" | "Draw" | "Defeat" | "Abandoned" | "Resigned";

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
  botName: string;
  timeControl: string;
  result: GameResult;
  moves: number;
  durationSeconds: number;
  xp: number;
  coins: number;
};

type BotPreset = {
  id: string;
  name: string;
  subtitle: string;
  elo: number;
  depth: number;
  blunderChance: number;
};

const levelToElo = [50, 80, 120, 180, 260, 420, 650, 900, 1150, 1400, 1650, 1900];
const levelToDepth = [1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 9];
const timeControls = ["No Clock", "5 min", "10 min", "15 min", "30 min"];
const customBots: BotPreset[] = [
  { id: "sprout", name: "Sprout", subtitle: "Extra gentle opening practice", elo: 40, depth: 1, blunderChance: 0.7 },
  { id: "poppy", name: "Poppy", subtitle: "Soft, steady, and beginner friendly", elo: 80, depth: 1, blunderChance: 0.5 },
];

const seededHistory: GameRecord[] = [
  { id: 1, user: "Sayantan Chandra", date: "Jun 4, 2026 2:27 AM", color: "white", difficulty: "Beginner", botName: "Sprout", timeControl: "No Clock", result: "Resigned", moves: 0, durationSeconds: 0, xp: 0, coins: 0 },
  { id: 2, user: "Diya Yashika Janga", date: "Jun 3, 2026 5:00 PM", color: "white", difficulty: "Beginner", botName: "Poppy", timeControl: "5 min", result: "Draw", moves: 13, durationSeconds: 402, xp: 0, coins: 0 },
];

export default function PlayVsComputer({ depth = 8 }: { depth?: number }) {
  const gameRef = useRef(new Chess());
  const workerRef = useRef<Worker | null>(null);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const savedRewardGameIdRef = useRef<number | null>(null);
  const [position, setPosition] = useState(gameRef.current.fen());
  const [boardWidth, setBoardWidth] = useState(460);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedColor, setSelectedColor] = useState<PlayerColor>("white");
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [botId, setBotId] = useState<string>(customBots[0].id);
  const [level, setLevel] = useState(1);
  const [timeControl, setTimeControl] = useState("No Clock");
  const [whiteClockMs, setWhiteClockMs] = useState<number | null>(null);
  const [blackClockMs, setBlackClockMs] = useState<number | null>(null);
  const [activeTurnStartedAt, setActiveTurnStartedAt] = useState<number | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const [gameInstanceId, setGameInstanceId] = useState<number | null>(null);
  const [gameStartedAt, setGameStartedAt] = useState<number | null>(null);
  const [rewardSummary, setRewardSummary] = useState<{ xp: number; coins: number; badge?: string } | null>(null);
  const [records, setRecords] = useState<GameRecord[]>(seededHistory);
  const [selectedRecord, setSelectedRecord] = useState<GameRecord | null>(null);

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

  const selectedBot = useMemo(() => customBots.find((bot) => bot.id === botId) || customBots[0], [botId]);
  const currentDepth = Math.max(1, Math.min(12, (selectedBot?.depth || 1) + Math.max(0, (levelToDepth[level - 1] || depth) - 1)));
  const difficultyLabel = selectedBot?.name || (level <= 4 ? "Beginner" : level <= 8 ? "Intermediate" : "Advanced");
  const isPlayerTurn = gameRef.current.turn() === (playerColor === "white" ? "w" : "b");
  const usesClock = timeControl !== "No Clock";
  const totalDurationSeconds = gameStartedAt ? Math.max(0, Math.floor((Date.now() - gameStartedAt) / 1000)) : 0;

  useEffect(() => {
    try {
      const worker = new Worker("/stockfish/stockfish.js");
      workerRef.current = worker;
      worker.postMessage("uci");
      worker.postMessage("setoption name UCI_LimitStrength value true");
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
        beginNextTurn();
        refreshBoard();
        checkGameOver();
      };
    } catch {
      // The board still works if the engine asset is unavailable.
    }

    return () => workerRef.current?.terminate();
  }, [status]);

  useEffect(() => {
    if (!usesClock || status !== "playing" || activeTurnStartedAt === null) return;
    const interval = window.setInterval(() => {
      setLiveTick((value) => value + 1);
      const elapsed = Date.now() - activeTurnStartedAt;
      if (gameRef.current.turn() === "w" && whiteClockMs !== null && whiteClockMs - elapsed <= 0) {
        setWhiteClockMs(0);
        setThinking(false);
        finishGame(playerColor === "white" ? "Defeat" : "Victory", playerColor === "white" ? "You lost on time" : `${selectedBot.name} lost on time`);
      } else if (gameRef.current.turn() === "b" && blackClockMs !== null && blackClockMs - elapsed <= 0) {
        setBlackClockMs(0);
        setThinking(false);
        finishGame(playerColor === "black" ? "Defeat" : "Victory", playerColor === "black" ? "You lost on time" : `${selectedBot.name} lost on time`);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [usesClock, status, activeTurnStartedAt, whiteClockMs, blackClockMs, playerColor, selectedBot.name]);

  useEffect(() => {
    if (status !== "playing") return;
    const interval = window.setInterval(() => setLiveTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => {
      const width = element.clientWidth;
      const heightLimit = window.innerHeight - 360;
      setBoardWidth(Math.max(260, Math.min(460, width, heightLimit)));
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

  function formatClock(ms: number | null) {
    if (ms === null) return "No clock";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function minutesFromTimeControl(value: string) {
    const match = value.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function formatDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function commitTurnClock() {
    if (!usesClock || activeTurnStartedAt === null) return;
    const elapsed = Date.now() - activeTurnStartedAt;
    if (gameRef.current.turn() === "w") {
      setWhiteClockMs((current) => (current === null ? null : Math.max(0, current - elapsed)));
    } else {
      setBlackClockMs((current) => (current === null ? null : Math.max(0, current - elapsed)));
    }
  }

  function beginNextTurn() {
    setActiveTurnStartedAt(usesClock ? Date.now() : null);
  }

  async function saveReward(recordResult: GameResult, moves: number, durationSeconds: number, gameId: number) {
    if (savedRewardGameIdRef.current === gameId) return;
    savedRewardGameIdRef.current = gameId;

    const outcome =
      recordResult === "Victory"
        ? "victory"
        : recordResult === "Draw"
          ? "draw"
          : recordResult === "Resigned"
            ? "resigned"
            : "defeat";

    try {
      const response = await fetch("/api/play/computer/reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          botName: selectedBot.name,
          moveCount: moves,
          durationSeconds,
          level,
        }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      setRewardSummary({ xp: payload.xp || 0, coins: payload.coins || 0, badge: payload.badge || "" });
      setRecords((current) =>
        current.map((record) =>
          record.id === gameId
            ? { ...record, xp: payload.xp || 0, coins: payload.coins || 0 }
            : record
        )
      );
    } catch {
      // If reward saving fails, the game result still stands.
    }
  }

  function finishGame(recordResult: GameResult, finalMessage: string) {
    const moves = gameRef.current.history().length;
    const durationSeconds = gameStartedAt ? Math.max(0, Math.floor((Date.now() - gameStartedAt) / 1000)) : 0;
    setResult(finalMessage);
    setStatus("ended");
    setActiveTurnStartedAt(null);
    setShowResultModal(true);
    addRecord(recordResult, moves, durationSeconds);
    if (gameInstanceId !== null) {
      void saveReward(recordResult, moves, durationSeconds, gameInstanceId);
    }
  }

  const displayedWhiteClock =
    usesClock && whiteClockMs !== null && status === "playing" && gameRef.current.turn() === "w" && activeTurnStartedAt !== null
      ? Math.max(0, whiteClockMs - (Date.now() - activeTurnStartedAt) + liveTick * 0)
      : whiteClockMs;

  const displayedBlackClock =
    usesClock && blackClockMs !== null && status === "playing" && gameRef.current.turn() === "b" && activeTurnStartedAt !== null
      ? Math.max(0, blackClockMs - (Date.now() - activeTurnStartedAt) + liveTick * 0)
      : blackClockMs;

  function requestEngineMove() {
    const worker = workerRef.current;
    if (!worker || gameRef.current.isGameOver()) return;
    setThinking(true);
    const legalMoves = gameRef.current.moves({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>;
    if (selectedBot.blunderChance > 0 && legalMoves.length && Math.random() < selectedBot.blunderChance) {
      const chosenMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      window.setTimeout(() => {
        commitTurnClock();
        try {
          gameRef.current.move({ from: chosenMove.from, to: chosenMove.to, promotion: chosenMove.promotion || "q" });
        } catch {
          // Ignore and let the board stay as-is.
        }
        setThinking(false);
        beginNextTurn();
        refreshBoard();
        checkGameOver();
      }, 350);
      return;
    }
    worker.postMessage(`setoption name UCI_Elo value ${(selectedBot.elo || 0) + Math.max(0, (levelToElo[level - 1] || 0) - levelToElo[0])}`);
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
    finishGame(recordResult, finalResult);
  }

  function addRecord(recordResult: GameResult, moves = gameRef.current.history().length, durationSeconds = totalDurationSeconds) {
    setRecords((current) => [
      {
        id: gameInstanceId ?? Date.now(),
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
        botName: selectedBot.name,
        timeControl,
        result: recordResult,
        moves,
        durationSeconds,
        xp: rewardSummary?.xp || 0,
        coins: rewardSummary?.coins || 0,
      },
      ...current,
    ]);
  }

  function startGame() {
    const color = selectedColor === "random" ? (Math.random() > 0.5 ? "white" : "black") : selectedColor;
    const clockMinutes = minutesFromTimeControl(timeControl);
    const openingClock = clockMinutes > 0 ? clockMinutes * 60 * 1000 : null;
    const freshGameId = Date.now();
    gameRef.current.reset();
    setPlayerColor(color);
    setPosition(gameRef.current.fen());
    setResult("");
    setThinking(false);
    setStatus("playing");
    setShowSetup(false);
    setShowResultModal(false);
    setRewardSummary(null);
    setWhiteClockMs(openingClock);
    setBlackClockMs(openingClock);
    setActiveTurnStartedAt(openingClock === null ? null : Date.now());
    setGameStartedAt(Date.now());
    setGameInstanceId(freshGameId);
    savedRewardGameIdRef.current = null;

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
    finishGame("Resigned", "You resigned");
  }

  function onDrop(source: string, target: string) {
    if (status !== "playing" || thinking || !isPlayerTurn) return false;

    try {
      commitTurnClock();
      const move = gameRef.current.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      beginNextTurn();
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
      <>
        <GameHistory records={records} onBack={() => setShowHistory(false)} onSelectRecord={setSelectedRecord} />
        {selectedRecord && <HistoryDetailsModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
      </>
    );
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

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-brand/5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              Status: <span className="font-black text-slate-950">{status === "playing" ? "In Progress" : status === "ended" ? result : "Not Started"}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {selectedBot.name} / {timeControl}
            </div>
          </div>

          <div ref={boardWrapRef} className="flex min-h-0 flex-1 items-center justify-center">
            <div className="relative w-full max-w-[460px]">
              {status !== "idle" && (
                <div className="mb-3">
                  <PlayerClockCard
                    name={playerColor === "black" ? "You" : selectedBot.name}
                    side="Black"
                    clock={formatClock(displayedBlackClock)}
                    active={status === "playing" && gameRef.current.turn() === "b"}
                    tone={playerColor === "black" ? "player" : "bot"}
                  />
                </div>
              )}
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
              {status !== "idle" && (
                <div className="mt-3">
                  <PlayerClockCard
                    name={playerColor === "white" ? "You" : selectedBot.name}
                    side="White"
                    clock={formatClock(displayedWhiteClock)}
                    active={status === "playing" && gameRef.current.turn() === "w"}
                    tone={playerColor === "white" ? "player" : "bot"}
                  />
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
                  <Bot size={15} /> {selectedBot.name}
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
          botId={botId}
          level={level}
          timeControl={timeControl}
          onColorChange={setSelectedColor}
          onBotChange={setBotId}
          onLevelChange={setLevel}
          onTimeControlChange={setTimeControl}
          onClose={() => setShowSetup(false)}
          onStart={startGame}
        />
      )}

      {showResultModal && (
        <ResultModal
          botName={selectedBot.name}
          result={result}
          record={records[0] || null}
          reward={rewardSummary}
          onClose={() => setShowResultModal(false)}
          onRematch={() => {
            setShowResultModal(false);
            startGame();
          }}
          onOpenSetup={() => {
            setShowResultModal(false);
            setShowSetup(true);
          }}
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
  botId,
  level,
  timeControl,
  onColorChange,
  onBotChange,
  onLevelChange,
  onTimeControlChange,
  onClose,
  onStart,
}: {
  selectedColor: PlayerColor;
  botId: string;
  level: number;
  timeControl: string;
  onColorChange: (color: PlayerColor) => void;
  onBotChange: (botId: string) => void;
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

        <div className="mt-6">
          <div className="mb-2 text-sm font-medium text-slate-600">Choose a bot</div>
          <div className="grid gap-2">
            {customBots.map((bot) => (
              <button
                key={bot.id}
                onClick={() => onBotChange(bot.id)}
                className={[
                  "rounded-xl border px-4 py-3 text-left transition",
                  botId === bot.id ? "border-brand bg-brand/5 shadow-sm" : "border-slate-200 bg-slate-50 hover:border-brand/40",
                ].join(" ")}
              >
                <div className="font-semibold text-slate-950">{bot.name}</div>
                <div className="text-sm text-slate-500">{bot.subtitle}</div>
              </button>
            ))}
          </div>
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

function GameHistory({ records, onBack, onSelectRecord }: { records: GameRecord[]; onBack: () => void; onSelectRecord: (record: GameRecord) => void }) {
  const totals = records.reduce(
    (summary, record) => {
      if (record.result === "Victory") summary.victories += 1;
      if (record.result === "Draw") summary.draws += 1;
      if (record.result === "Defeat" || record.result === "Resigned") summary.defeats += 1;
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
              <span className={record.result === "Draw" ? "text-amber-600" : record.result === "Defeat" || record.result === "Resigned" ? "text-rose-600" : "text-emerald-600"}>{record.result === "Draw" ? "Draw" : record.result}</span>
              <span>{record.moves}</span>
              <button className="inline-flex items-center gap-2 text-left text-slate-900" onClick={() => onSelectRecord(record)}>
                <Play size={14} className="text-brand" /> View details
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryDetailsModal({ record, onClose }: { record: GameRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-950">Game Details</h2>
          <button className="text-slate-500 hover:text-slate-900" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-3">
          <DetailRow label="Player" value={record.user} />
          <DetailRow label="Date" value={record.date} />
          <DetailRow label="Color" value={record.color} />
          <DetailRow label="Difficulty" value={record.difficulty} />
          <DetailRow label="Result" value={record.result} />
          <DetailRow label="Moves" value={String(record.moves)} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950 capitalize">{value}</div>
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

function PlayerClockCard({
  name,
  side,
  clock,
  active,
  tone,
}: {
  name: string;
  side: "White" | "Black";
  clock: string;
  active: boolean;
  tone: "player" | "bot";
}) {
  return (
    <div className={[
      "rounded-2xl border px-4 py-3 shadow-sm transition",
      active ? "border-brand bg-brand/5 shadow-brand/10" : "border-slate-200 bg-slate-50",
    ].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{side}</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            {tone === "player" ? <User size={14} className="text-brand" /> : <Bot size={14} className="text-slate-700" />}
            {name}
          </div>
        </div>
        <div className="text-2xl font-black text-slate-950">{clock}</div>
      </div>
    </div>
  );
}

function ResultModal({
  botName,
  result,
  record,
  reward,
  onClose,
  onRematch,
  onOpenSetup,
}: {
  botName: string;
  result: string;
  record: GameRecord | null;
  reward: { xp: number; coins: number; badge?: string } | null;
  onClose: () => void;
  onRematch: () => void;
  onOpenSetup: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-[560px] rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-purple-700">
              <Medal size={14} />
              Match Complete
            </div>
            <h2 className="mt-3 text-3xl font-black text-slate-950">{result}</h2>
            <p className="mt-1 text-sm text-slate-600">Your game against {botName} has been saved. You can replay right away or jump into a different level.</p>
          </div>
          <button className="text-slate-500 hover:text-slate-900" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ResultStat label="Bot" value={record?.botName || botName} />
          <ResultStat label="Time Control" value={record?.timeControl || "No Clock"} />
          <ResultStat label="Moves" value={String(record?.moves || 0)} />
          <ResultStat label="Duration" value={record ? `${Math.floor(record.durationSeconds / 60)}m ${String(record.durationSeconds % 60).padStart(2, "0")}s` : "0m 00s"} />
          <ResultStat label="XP Earned" value={String(reward?.xp ?? record?.xp ?? 0)} />
          <ResultStat label="Coins Earned" value={String(reward?.coins ?? record?.coins ?? 0)} />
        </div>

        {reward?.badge ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Badge unlocked: {reward.badge}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button className="btn-outline bg-white" onClick={onOpenSetup}>
            Choose Another Level
          </button>
          <button className="btn-primary gap-2" onClick={onRematch}>
            <Play size={16} /> Play Again
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
    </div>
  );
}
