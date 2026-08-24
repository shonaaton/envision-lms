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
  Trophy,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";

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
  moveTimeMs: number;
  blunderChance: number;
};

type LevelPreset = BotPreset & {
  level: number;
};

const MAX_ENGINE_LEVEL = 9;

const levelPresets: LevelPreset[] = [
  { level: 1, id: "sprout", name: "Sprout", subtitle: "First-game friendly", elo: 50, depth: 1, moveTimeMs: 120, blunderChance: 0.72 },
  { level: 2, id: "poppy", name: "Poppy", subtitle: "Gentle beginner", elo: 120, depth: 2, moveTimeMs: 180, blunderChance: 0.55 },
  { level: 3, id: "rookie", name: "Rookie", subtitle: "Learning tactics", elo: 300, depth: 3, moveTimeMs: 260, blunderChance: 0.36 },
  { level: 4, id: "scout", name: "Scout", subtitle: "Developing player", elo: 600, depth: 4, moveTimeMs: 400, blunderChance: 0.22 },
  { level: 5, id: "maple", name: "Maple", subtitle: "Club practice", elo: 900, depth: 6, moveTimeMs: 650, blunderChance: 0.12 },
  { level: 6, id: "ember", name: "Ember", subtitle: "Tactical pressure", elo: 1250, depth: 8, moveTimeMs: 950, blunderChance: 0.06 },
  { level: 7, id: "noir", name: "Noir", subtitle: "Tournament sharp", elo: 1600, depth: 10, moveTimeMs: 1400, blunderChance: 0.025 },
  { level: 8, id: "atlas", name: "Atlas", subtitle: "Deep calculation", elo: 1900, depth: 12, moveTimeMs: 2200, blunderChance: 0 },
  { level: 9, id: "maestro", name: "Maestro", subtitle: "Serious engine test", elo: 2300, depth: 16, moveTimeMs: 3500, blunderChance: 0 },
];
const quickTimeControls = ["1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5", "15+10", "30+0", "30+20"];

function stockfishSkillForLevel(level: number) {
  return Math.round((clamp(level, 1, MAX_ENGINE_LEVEL) - 1) * (20 / (MAX_ENGINE_LEVEL - 1)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function strengthBandForElo(elo: number) {
  if (elo < 150) return "Starter";
  if (elo < 500) return "Beginner";
  if (elo < 1000) return "Improver";
  if (elo < 1500) return "Club";
  return "Advanced";
}

function paceLabelForMoveTime(ms: number) {
  if (ms < 350) return "Instant";
  if (ms < 900) return "Quick";
  if (ms < 1800) return "Balanced";
  if (ms < 3200) return "Thoughtful";
  return "Deep think";
}

function engineTimingForClock(input: {
  baseMoveTimeMs: number;
  baseDepth: number;
  level: number;
  timeControl: string;
  turn: "w" | "b";
  whiteClockMs: number | null;
  blackClockMs: number | null;
}) {
  if (input.timeControl === "No Clock") {
    return { moveTimeMs: input.baseMoveTimeMs, depth: input.baseDepth };
  }

  const remainingMs = input.turn === "w" ? input.whiteClockMs : input.blackClockMs;
  const { incrementSeconds } = parseTimeControlValue(input.timeControl);
  const incrementMs = incrementSeconds * 1000;
  const safeRemainingMs = Math.max(1_000, remainingMs ?? 60_000);
  const clockBudgetMs = Math.floor((safeRemainingMs / 32) + (incrementMs * 0.65));
  const minThinkMs = input.level >= 8 ? 180 : input.level >= 5 ? 120 : 80;
  const maxThinkMs = safeRemainingMs <= 20_000 ? 450 : safeRemainingMs <= 60_000 ? 800 : safeRemainingMs <= 180_000 ? 1_500 : 3_500;
  const moveTimeMs = clamp(Math.min(input.baseMoveTimeMs, clockBudgetMs), minThinkMs, maxThinkMs);
  const depthPenalty = moveTimeMs < input.baseMoveTimeMs * 0.45 ? 3 : moveTimeMs < input.baseMoveTimeMs * 0.7 ? 2 : moveTimeMs < input.baseMoveTimeMs * 0.9 ? 1 : 0;
  return { moveTimeMs, depth: clamp(input.baseDepth - depthPenalty, 1, input.baseDepth) };
}

function engineNodesForTiming(moveTimeMs: number, level: number) {
  const levelMultiplier = level >= 9 ? 1_450 : level >= 8 ? 1_050 : level >= 6 ? 760 : 480;
  return Math.round(clamp(moveTimeMs * levelMultiplier, 40_000, level >= 9 ? 5_000_000 : 2_500_000));
}

function parseTimeControlValue(value: string) {
  const match = value.match(/^(\d+)(?:\+(\d+))?$/);
  return {
    minutes: match ? Number(match[1]) : 0,
    incrementSeconds: match ? Number(match[2] || 0) : 0,
  };
}

const seededHistory: GameRecord[] = [
  { id: 1, user: "Sayantan Chandra", date: "Jun 4, 2026 2:27 AM", color: "white", difficulty: "Beginner", botName: "Sprout", timeControl: "No Clock", result: "Resigned", moves: 0, durationSeconds: 0, xp: 0, coins: 0 },
  { id: 2, user: "Diya Yashika Janga", date: "Jun 3, 2026 5:00 PM", color: "white", difficulty: "Beginner", botName: "Poppy", timeControl: "5 min", result: "Draw", moves: 13, durationSeconds: 402, xp: 0, coins: 0 },
];

export default function PlayVsComputer({ depth = 8 }: { depth?: number }) {
  const gameRef = useRef(new Chess());
  const workerRef = useRef<Worker | null>(null);
  const statusRef = useRef<GameStatus>("idle");
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const savedRewardGameIdRef = useRef<number | null>(null);
  const commitTurnClockRef = useRef<() => void>(() => {});
  const engineFallbackTimerRef = useRef<number | null>(null);
  const [position, setPosition] = useState(gameRef.current.fen());
  const [boardWidth, setBoardWidth] = useState(460);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [checkingDemoLimit, setCheckingDemoLimit] = useState(false);
  const [selectedColor, setSelectedColor] = useState<PlayerColor>("white");
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
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
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [viewPly, setViewPly] = useState<number | null>(null);

  const verboseHistory =
    gameRef.current.history({ verbose: true }) as Array<{ san: string; color: "w" | "b"; from: string; to: string; promotion?: string }>;
  const moveRows = useMemo<MoveRow[]>(() => {
    const rows: MoveRow[] = [];
    verboseHistory.forEach((move, index) => {
      const rowIndex = Math.floor(index / 2);
      if (!rows[rowIndex]) rows[rowIndex] = { number: rowIndex + 1, white: "", black: "" };
      if (move.color === "w") rows[rowIndex].white = move.san;
      else rows[rowIndex].black = move.san;
    });
    return rows;
  }, [verboseHistory]);
  const displayedPosition = useMemo(() => {
    if (viewPly === null) return position;
    const replay = new Chess();
    verboseHistory.slice(0, viewPly).forEach((move) => {
      replay.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    });
    return replay.fen();
  }, [position, verboseHistory, viewPly]);

  const selectedBot = useMemo(() => levelPresets.find((preset) => preset.level === level) || levelPresets[0], [level]);
  const targetElo = selectedBot.elo;
  const currentDepth = clamp(selectedBot.depth || depth, 1, 18);
  const engineSkillLevel = stockfishSkillForLevel(level);
  const effectiveBlunderChance = selectedBot.blunderChance;
  const engineMoveTimeMs = selectedBot.moveTimeMs;
  const strengthBandLabel = strengthBandForElo(targetElo);
  const thinkPaceLabel = paceLabelForMoveTime(engineMoveTimeMs);
  const difficultyLabel = `${strengthBandLabel}`;
  const isPlayerTurn = gameRef.current.turn() === (playerColor === "white" ? "w" : "b");
  const usesClock = timeControl !== "No Clock";
  const totalDurationSeconds = gameStartedAt ? Math.max(0, Math.floor((Date.now() - gameStartedAt) / 1000)) : 0;

  const beginNextTurn = useCallback(() => {
    setActiveTurnStartedAt(usesClock ? Date.now() : null);
  }, [usesClock]);

  const addRecord = useCallback((recordResult: GameResult, moves = gameRef.current.history().length, durationSeconds = totalDurationSeconds) => {
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
  }, [difficultyLabel, gameInstanceId, playerColor, rewardSummary?.coins, rewardSummary?.xp, selectedBot.name, timeControl, totalDurationSeconds]);

  const saveReward = useCallback(async (recordResult: GameResult, moves: number, durationSeconds: number, gameId: number) => {
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
  }, [level, selectedBot.name]);

  const finishGame = useCallback((recordResult: GameResult, finalMessage: string) => {
    if (engineFallbackTimerRef.current) window.clearTimeout(engineFallbackTimerRef.current);
    engineFallbackTimerRef.current = null;
    const moves = gameRef.current.history().length;
    const durationSeconds = gameStartedAt ? Math.max(0, Math.floor((Date.now() - gameStartedAt) / 1000)) : 0;
    setResult(finalMessage);
    setStatus("ended");
    statusRef.current = "ended";
    setActiveTurnStartedAt(null);
    setShowResultModal(true);
    addRecord(recordResult, moves, durationSeconds);
    if (gameInstanceId !== null) {
      void saveReward(recordResult, moves, durationSeconds, gameInstanceId);
    }
  }, [addRecord, gameInstanceId, gameStartedAt, saveReward]);

  const checkGameOver = useCallback(() => {
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
  }, [finishGame, playerColor]);

  const beginNextTurnRef = useRef(beginNextTurn);
  const checkGameOverRef = useRef(checkGameOver);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    beginNextTurnRef.current = beginNextTurn;
    checkGameOverRef.current = checkGameOver;
  }, [beginNextTurn, checkGameOver]);

  useEffect(() => {
    try {
      const worker = new Worker("/stockfish/stockfish.js");
      workerRef.current = worker;
      worker.postMessage("uci");
      worker.postMessage("setoption name UCI_LimitStrength value true");
      worker.onmessage = (event) => {
        const line = typeof event.data === "string" ? event.data : "";
        const bestMove = line.match(/^bestmove\s(\S+)/);
        if (!bestMove || statusRef.current !== "playing") return;
        if (engineFallbackTimerRef.current) window.clearTimeout(engineFallbackTimerRef.current);
        engineFallbackTimerRef.current = null;

        const uci = bestMove[1];
        if (!uci || uci === "(none)") {
          setThinking(false);
          checkGameOverRef.current();
          return;
        }
        const move = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" };
        try {
          commitTurnClockRef.current();
          const applied = gameRef.current.move(move);
          if (!applied) throw new Error("Invalid engine move");
        } catch {
          const legalMoves = gameRef.current.moves({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>;
          const fallback = legalMoves[Math.floor(Math.random() * legalMoves.length)];
          if (fallback) gameRef.current.move({ from: fallback.from, to: fallback.to, promotion: fallback.promotion || "q" });
        }
        setThinking(false);
        beginNextTurnRef.current();
        refreshBoard();
        checkGameOverRef.current();
      };
    } catch {
      // The board still works if the engine asset is unavailable.
    }

    return () => {
      if (engineFallbackTimerRef.current) window.clearTimeout(engineFallbackTimerRef.current);
      workerRef.current?.terminate();
    };
  }, []);

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
  }, [usesClock, status, activeTurnStartedAt, whiteClockMs, blackClockMs, playerColor, selectedBot.name, finishGame]);

  useEffect(() => {
    if (status !== "playing") return;
    const interval = window.setInterval(() => setLiveTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => {
      const viewportWidth = window.innerWidth;
      const isMobile = viewportWidth < 640;
      const isDesktopStage = viewportWidth >= 1024;
      const width = element.clientWidth;
      const height = element.clientHeight || window.innerHeight;
      const clockRail = isDesktopStage && width >= 620 ? 184 : 0;
      const widthLimit = isMobile ? viewportWidth - 28 : width - clockRail - 12;
      const heightLimit = height - 18;
      const maxBoard = isMobile ? viewportWidth - 28 : viewportWidth < 1280 ? 500 : 540;
      const minBoard = isMobile ? 240 : 320;
      setBoardWidth(Math.floor(clamp(Math.min(widthLimit, heightLimit, maxBoard), minBoard, maxBoard)));
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
    setViewPly(null);
  }

  function formatClock(ms: number | null) {
    if (ms === null) return "No clock";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function parseTimeControl(value: string) {
    return parseTimeControlValue(value);
  }

  function formatDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function commitTurnClock() {
    if (!usesClock || activeTurnStartedAt === null) return;
    const elapsed = Date.now() - activeTurnStartedAt;
    const incrementMs = parseTimeControl(timeControl).incrementSeconds * 1000;
    if (gameRef.current.turn() === "w") {
      setWhiteClockMs((current) => (current === null ? null : Math.max(0, current - elapsed) + incrementMs));
    } else {
      setBlackClockMs((current) => (current === null ? null : Math.max(0, current - elapsed) + incrementMs));
    }
  }

  useEffect(() => {
    commitTurnClockRef.current = commitTurnClock;
  });

  const displayedWhiteClock =
    usesClock && whiteClockMs !== null && status === "playing" && gameRef.current.turn() === "w" && activeTurnStartedAt !== null
      ? Math.max(0, whiteClockMs - (Date.now() - activeTurnStartedAt) + liveTick * 0)
      : whiteClockMs;

  const displayedBlackClock =
    usesClock && blackClockMs !== null && status === "playing" && gameRef.current.turn() === "b" && activeTurnStartedAt !== null
      ? Math.max(0, blackClockMs - (Date.now() - activeTurnStartedAt) + liveTick * 0)
      : blackClockMs;

  async function requestEngineMove() {
    const worker = workerRef.current;
    const legalMoves = gameRef.current.moves({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>;
    if (gameRef.current.isGameOver() || !legalMoves.length) return;
    setThinking(true);
    const playFallbackMove = () => {
      if (statusRef.current !== "playing" || gameRef.current.isGameOver()) return;
      const moves = gameRef.current.moves({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>;
      const chosenMove = moves[Math.floor(Math.random() * moves.length)];
      if (!chosenMove) {
        setThinking(false);
        checkGameOver();
        return;
      }
      commitTurnClock();
      gameRef.current.move({ from: chosenMove.from, to: chosenMove.to, promotion: chosenMove.promotion || "q" });
      setThinking(false);
      beginNextTurn();
      refreshBoard();
      checkGameOver();
    };

    const engineTiming = engineTimingForClock({
      baseMoveTimeMs: engineMoveTimeMs,
      baseDepth: currentDepth,
      level,
      timeControl,
      turn: gameRef.current.turn(),
      whiteClockMs,
      blackClockMs,
    });
    const clock = usesClock
      ? {
          white: Math.max(0, Math.round(displayedWhiteClock ?? whiteClockMs ?? 0)),
          black: Math.max(0, Math.round(displayedBlackClock ?? blackClockMs ?? 0)),
          increment: parseTimeControl(timeControl).incrementSeconds * 1000,
        }
      : undefined;

    // Level 9 is a true search job because Lichess-style bot levels are commonly capped at 8.
    try {
      const response = await fetch(level >= 9 ? "/v1/engine/analyse" : "/v1/engine/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          level >= 9
            ? {
                fen: gameRef.current.fen(),
                depth: engineTiming.depth,
                nodes: engineNodesForTiming(engineTiming.moveTimeMs, level),
                multiPv: 1,
                source: "ANALYSIS_BOARD",
              }
            : {
                fen: gameRef.current.fen(),
                level,
                clock,
                source: "PLAY_VS_COMPUTER",
              }
        ),
      });
      const created = await response.json().catch(() => null);
      if (response.ok) {
        let result = created?.result;
        if (!result && created?.jobId) {
          for (let attempt = 0; attempt < 30; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 800));
            const jobResponse = await fetch(`/v1/engine/jobs/${created.jobId}`, { cache: "no-store" });
            const job = await jobResponse.json().catch(() => null);
            if (job?.status === "COMPLETED") {
              result = job.result;
              break;
            }
            if (job?.status === "FAILED" || job?.status === "CANCELLED") break;
          }
        }
        const uci = String(result?.bestMove || result?.lines?.[0]?.pv?.[0] || "").trim();
        if (uci && uci !== "(none)" && statusRef.current === "playing") {
          commitTurnClockRef.current();
          gameRef.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
          setThinking(false);
          beginNextTurnRef.current();
          refreshBoard();
          checkGameOverRef.current();
          return;
        }
      }
    } catch {
      // Fall through to the local worker when the coordinator is unavailable.
    }

    if (!worker) {
      window.setTimeout(playFallbackMove, 250);
      return;
    }
    if (effectiveBlunderChance > 0 && legalMoves.length && Math.random() < effectiveBlunderChance) {
      const chosenMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      window.setTimeout(() => playFallbackMove(), chosenMove ? 260 : 0);
      return;
    }
    if (engineFallbackTimerRef.current) window.clearTimeout(engineFallbackTimerRef.current);
    engineFallbackTimerRef.current = window.setTimeout(() => {
      engineFallbackTimerRef.current = null;
      playFallbackMove();
    }, engineTiming.moveTimeMs + 1600);
    worker.postMessage("setoption name Threads value 1");
    worker.postMessage(`setoption name UCI_LimitStrength value ${level >= 9 ? "false" : "true"}`);
    if (level < 9) worker.postMessage(`setoption name Skill Level value ${engineSkillLevel}`);
    worker.postMessage(`position fen ${gameRef.current.fen()}`);
    worker.postMessage(`go movetime ${engineTiming.moveTimeMs} depth ${engineTiming.depth}`);
  }

  async function startGame() {
    if (checkingDemoLimit) return;
    setCheckingDemoLimit(true);
    try {
      const response = await fetch("/api/play/computer/reward", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Your demo Play vs Computer limit is finished.");
    } catch (error: any) {
      toast.error(error?.message || "Could not start a new game.");
      setCheckingDemoLimit(false);
      return;
    }
    setCheckingDemoLimit(false);
    const color = selectedColor === "random" ? (Math.random() > 0.5 ? "white" : "black") : selectedColor;
    const clockMinutes = parseTimeControl(timeControl).minutes;
    const openingClock = clockMinutes > 0 ? clockMinutes * 60 * 1000 : null;
    const freshGameId = Date.now();
    gameRef.current.reset();
    setPlayerColor(color);
    setPosition(gameRef.current.fen());
    setResult("");
    setThinking(false);
    setStatus("playing");
    statusRef.current = "playing";
    setShowSetup(false);
    setShowResultModal(false);
    setRewardSummary(null);
    setWhiteClockMs(openingClock);
    setBlackClockMs(openingClock);
    setActiveTurnStartedAt(openingClock === null ? null : Date.now());
    setGameStartedAt(Date.now());
    setGameInstanceId(freshGameId);
    setPendingPromotion(null);
    setViewPly(null);
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
    setShowResignConfirm(false);
    setThinking(false);
    finishGame("Resigned", "You resigned");
  }

  function commitMove(source: string, target: string, promotion: PromotionPiece = "q") {
    if (status !== "playing" || thinking || !isPlayerTurn || viewPly !== null) return false;

    try {
      commitTurnClock();
      const move = gameRef.current.move({ from: source, to: target, promotion });
      if (!move) return false;
      setSelectedSquare(null);
      beginNextTurn();
      refreshBoard();
      checkGameOver();
      if (!gameRef.current.isGameOver()) window.setTimeout(requestEngineMove, 150);
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
    if (!selectedSquare || status !== "playing" || thinking || !isPlayerTurn || viewPly !== null) return [];
    return legalTargetsFromGame(gameRef.current, selectedSquare);
  }, [selectedSquare, status, thinking, isPlayerTurn, viewPly]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedSquare), [moveTargets, selectedSquare]);

  function onSquareClick(square: string) {
    if (status !== "playing" || thinking || !isPlayerTurn || viewPly !== null) return;
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

  if (showHistory) {
    return (
      <>
        <GameHistory records={records} onBack={() => setShowHistory(false)} onSelectRecord={setSelectedRecord} />
        {selectedRecord && <HistoryDetailsModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
      </>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-72px)] flex-col overflow-y-auto bg-[linear-gradient(180deg,#f9fafb_0%,#f6f3fa_48%,#f8fafc_100%)] p-3 text-slate-950 sm:p-4 md:h-[calc(100vh-92px)] md:min-h-[620px] md:overflow-hidden">
      <div className="mx-auto mb-3 flex w-full max-w-[1280px] flex-none flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded bg-brand-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-brand ring-1 ring-brand/10">
            <Bot size={14} />
            Play vs Computer
          </div>
          <h1 className="mt-1.5 text-xl font-black text-slate-950 sm:text-2xl">Play with Computer</h1>
          <p className="mt-0.5 max-w-xl text-xs leading-5 text-slate-600 sm:text-sm">{selectedBot.name} · Level {level} · {timeControl === "No Clock" ? "Unlimited" : timeControl}</p>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {status === "playing" ? (
            <>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-50" onClick={() => setShowResignConfirm(true)}>
                <Flag size={16} /> Resign
              </button>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded border border-brand/20 bg-white px-4 text-sm font-bold text-brand shadow-sm transition hover:bg-brand-50" onClick={restartGame}>
                <RotateCcw size={16} /> Restart
              </button>
            </>
          ) : (
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded bg-brand px-4 text-sm font-bold text-white shadow-lg shadow-brand-900/20 transition hover:bg-brand-600" onClick={() => setShowSetup(true)}>
              <Play size={16} /> Start Game
            </button>
          )}
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded border border-brand/20 bg-white px-4 text-sm font-bold text-brand shadow-sm transition hover:bg-brand-50" onClick={() => setShowHistory(true)}>
            <History size={16} /> View History
          </button>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1280px] flex-1 gap-4 md:min-h-0 lg:grid-cols-[minmax(0,680px)_minmax(280px,1fr)] xl:grid-cols-[minmax(0,720px)_minmax(320px,1fr)]">
        <section className="order-1 flex min-h-[420px] min-w-0 flex-col overflow-hidden md:min-h-[560px] lg:min-h-0">
          <div ref={boardWrapRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div className="grid w-full grid-cols-1 items-center justify-center gap-3">
              <div className="relative mx-auto overflow-hidden rounded border border-brand/15 bg-white shadow-[0_20px_60px_rgba(35,25,55,0.18)]">
                <Chessboard
                  position={displayedPosition}
                  onPieceDrop={onDrop}
                  onSquareClick={onSquareClick as any}
                  onPromotionPieceSelect={onPromotionPieceSelect as any}
                  showPromotionDialog={!!pendingPromotion}
                  promotionToSquare={pendingPromotion?.to as any}
                  promotionDialogVariant="modal"
                  arePiecesDraggable={status === "playing" && viewPly === null}
                  boardOrientation={playerColor}
                  boardWidth={boardWidth}
                  customSquareStyles={moveHintStyles as any}
                  customDarkSquareStyle={{ backgroundColor: "#9b65ad" }}
                  customLightSquareStyle={{ backgroundColor: "#f5edf8" }}
                />
                {status === "idle" && (
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded bg-white/95 px-4 py-3 text-center shadow-lg shadow-brand-900/10 backdrop-blur">
                    <div className="inline-flex items-center gap-2 rounded bg-brand px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                      <Bot size={13} /> Ready
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-800">Open setup and start the game.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="order-2 flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded border border-brand/10 bg-white shadow-[0_12px_40px_rgba(35,25,55,0.10)] md:min-h-[420px] lg:min-h-0">
          <div className="border-b border-brand/10">
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="h-3 w-3 rounded-full bg-accent ring-2 ring-brand/15" />
              <div className="min-w-0 flex-1 text-xl font-semibold text-slate-950">{selectedBot.name}</div>
              <div className="text-sm text-slate-500">{targetElo}?</div>
            </div>
            <div className="flex items-center justify-between bg-brand-50 px-4 py-3 text-brand">
              <button type="button" className="rounded p-1 hover:bg-white hover:shadow-sm" onClick={() => setShowSetup(true)} aria-label="Game setup"><Bot size={18} /></button>
              <button type="button" className="rounded p-1 hover:bg-white hover:shadow-sm" onClick={() => setViewPly(0)} aria-label="First move"><ChevronsLeft size={18} /></button>
              <button type="button" className="rounded p-1 hover:bg-white hover:shadow-sm" onClick={() => setViewPly(Math.max(0, (viewPly ?? verboseHistory.length) - 1))} aria-label="Previous move"><ChevronLeft size={18} /></button>
              <button type="button" className="rounded p-1 hover:bg-white hover:shadow-sm" onClick={() => setViewPly((viewPly ?? verboseHistory.length) >= verboseHistory.length ? null : (viewPly ?? verboseHistory.length) + 1)} aria-label="Next move"><ChevronRight size={18} /></button>
              <button type="button" className="rounded p-1 hover:bg-white hover:shadow-sm" onClick={() => setViewPly(null)} aria-label="Latest move"><ChevronsRight size={18} /></button>
              <button type="button" className="rounded p-1 hover:bg-white hover:shadow-sm" onClick={() => setShowHistory(true)} aria-label="History"><History size={18} /></button>
            </div>
          </div>

          <div className="flex flex-none flex-col gap-3 px-4 py-5">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand ring-1 ring-brand/10">
                <Bot size={28} />
              </div>
              <div className="min-w-0">
                <div className="text-lg text-slate-700">{playerColor === "white" ? "You play the white pieces" : "You play the black pieces"}</div>
                <div className="font-bold text-slate-950">{status === "playing" ? (thinking ? `${selectedBot.name} is thinking` : isPlayerTurn ? "It's your turn!" : `${selectedBot.name} to move`) : status === "ended" ? result : "Ready to start"}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PlayerClockCard
                name={playerColor === "black" ? "You" : selectedBot.name}
                side="Black"
                clock={formatClock(displayedBlackClock)}
                active={status === "playing" && gameRef.current.turn() === "b"}
                tone={playerColor === "black" ? "player" : "bot"}
              />
              <PlayerClockCard
                name={playerColor === "white" ? "You" : selectedBot.name}
                side="White"
                clock={formatClock(displayedWhiteClock)}
                active={status === "playing" && gameRef.current.turn() === "w"}
                tone={playerColor === "white" ? "player" : "bot"}
              />
            </div>

            {status === "playing" ? (
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-50" onClick={() => setShowResignConfirm(true)}>
                <Flag size={16} /> Resign
              </button>
            ) : (
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded bg-brand px-4 text-base font-bold text-white transition hover:bg-brand-600" onClick={() => setShowSetup(true)}>
                <Play size={18} /> Play against computer
              </button>
            )}
          </div>

          <MoveHistory
            rows={moveRows}
            currentPly={viewPly ?? verboseHistory.length}
            totalPly={verboseHistory.length}
            onNavigate={setViewPly}
          />
        </aside>
      </div>

      {showSetup && (
        <SetupModal
          selectedColor={selectedColor}
          level={level}
          timeControl={timeControl}
          selectedBot={selectedBot}
          targetElo={targetElo}
          thinkPaceLabel={thinkPaceLabel}
          onColorChange={setSelectedColor}
          onLevelChange={setLevel}
          onTimeControlChange={setTimeControl}
          onClose={() => setShowSetup(false)}
          onStart={startGame}
          starting={checkingDemoLimit}
        />
      )}

      {showResignConfirm && (
        <ResignConfirmModal
          botName={selectedBot.name}
          onCancel={() => setShowResignConfirm(false)}
          onConfirm={resignGame}
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

function MoveHistory({
  rows,
  currentPly,
  totalPly,
  onNavigate,
}: {
  rows: MoveRow[];
  currentPly: number;
  totalPly: number;
  onNavigate: (ply: number | null) => void;
}) {
  const go = (ply: number) => onNavigate(ply >= totalPly ? null : Math.max(0, ply));
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
        <History size={18} className="text-brand" />
        <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">Move History</h2>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-slate-500 sm:px-4 sm:py-3">
        <div className="flex gap-4">
          <button type="button" onClick={() => go(0)} disabled={currentPly === 0} aria-label="First position"><ChevronsLeft size={16} /></button>
          <button type="button" onClick={() => go(currentPly - 1)} disabled={currentPly === 0} aria-label="Previous move"><ChevronLeft size={16} /></button>
        </div>
        <span className="text-xs font-bold">{currentPly}/{totalPly}</span>
        <div className="flex gap-4">
          <button type="button" onClick={() => go(currentPly + 1)} disabled={currentPly >= totalPly} aria-label="Next move"><ChevronRight size={16} /></button>
          <button type="button" onClick={() => go(totalPly)} disabled={currentPly >= totalPly} aria-label="Latest position"><ChevronsRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-[34px_1fr_1fr] px-3 pb-2 text-xs font-semibold text-slate-950 sm:grid-cols-[44px_1fr_1fr] sm:px-4 sm:pb-3 sm:text-sm">
        <span>#</span>
        <span>White</span>
        <span>Black</span>
      </div>
      {rows.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 text-xs text-slate-700 sm:px-4 sm:text-sm">
          {rows.map((row) => (
            <div key={row.number} className="grid grid-cols-[34px_1fr_1fr] border-t border-slate-100 py-2 sm:grid-cols-[44px_1fr_1fr] sm:py-3">
              <span className="text-slate-400">{row.number}</span>
              <button type="button" className="text-left hover:font-bold hover:text-brand" onClick={() => go((row.number - 1) * 2 + 1)}>{row.white}</button>
              <button type="button" className="text-left hover:font-bold hover:text-brand" onClick={() => row.black && go(row.number * 2)}>{row.black}</button>
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
  selectedBot,
  targetElo,
  thinkPaceLabel,
  onColorChange,
  onLevelChange,
  onTimeControlChange,
  onClose,
  onStart,
  starting,
}: {
  selectedColor: PlayerColor;
  level: number;
  timeControl: string;
  selectedBot: BotPreset;
  targetElo: number;
  thinkPaceLabel: string;
  onColorChange: (color: PlayerColor) => void;
  onLevelChange: (level: number) => void;
  onTimeControlChange: (value: string) => void;
  onClose: () => void;
  onStart: () => void;
  starting?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[calc(100dvh-16px)] w-full max-w-[760px] flex-col overflow-hidden rounded border border-brand/10 bg-white text-slate-700 shadow-2xl shadow-brand-900/20 sm:max-h-[calc(100dvh-32px)]">
        <div className="relative flex-none border-b border-brand/10 bg-brand-50 px-4 py-3 text-center sm:px-6 sm:py-4">
          <h2 className="text-2xl font-light text-brand sm:text-3xl">Game setup</h2>
          <button className="absolute right-3 top-3 rounded p-2 text-brand/70 hover:bg-white hover:text-brand" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:space-y-5 sm:px-6">
          <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded border border-brand/15 bg-white px-3 py-2 text-left text-slate-950 shadow-sm sm:px-4">
            <Trophy size={20} className="shrink-0 text-brand" />
            <span className="text-lg sm:text-xl">Standard</span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-500">Standard rules of chess (FIDE)</span>
            <ChevronDown size={16} className="shrink-0 text-brand" />
          </button>

          <div className="grid grid-cols-3 border-b border-brand/10 text-center text-sm sm:text-base">
            <button type="button" className={["h-10 border-b-2 sm:h-11", timeControl === "No Clock" ? "border-transparent text-slate-500" : "border-brand text-brand"].join(" ")} onClick={() => onTimeControlChange("5+3")}>Real time</button>
            <button type="button" className="h-10 border-b-2 border-transparent text-slate-400 sm:h-11">Correspondence</button>
            <button type="button" className={["h-10 border-b-2 sm:h-11", timeControl === "No Clock" ? "border-brand text-brand" : "border-transparent text-slate-500"].join(" ")} onClick={() => onTimeControlChange("No Clock")}>Unlimited</button>
          </div>

          {timeControl === "No Clock" ? (
            <div className="py-1 text-center text-base text-slate-700 sm:text-lg">Take all the time you need</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 text-base text-slate-700 sm:text-lg">
                <span>Time control</span>
                <span className="rounded bg-accent px-2 py-1 text-base font-bold text-brand-900">{timeControl}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickTimeControls.map((control) => (
                  <button
                    key={control}
                    type="button"
                    className={[
                      "h-9 rounded px-3 text-sm font-bold transition sm:text-base",
                      timeControl === control ? "bg-brand text-white" : "border border-brand/10 bg-brand-50 text-brand hover:bg-brand-100",
                    ].join(" ")}
                    onClick={() => onTimeControlChange(control)}
                  >
                    {control}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-center text-base font-bold text-slate-800 sm:text-lg">Strength</div>
            <div className="grid overflow-hidden rounded border border-brand/10 bg-brand-50 shadow-inner" style={{ gridTemplateColumns: `repeat(${levelPresets.length}, minmax(0, 1fr))` }}>
              {levelPresets.map((preset) => (
                <button
                  key={preset.level}
                  type="button"
                  className={[
                    "min-h-11 border-r border-brand/10 px-1 text-center text-base transition last:border-r-0 sm:min-h-12 sm:text-lg",
                    level === preset.level ? "bg-brand text-white shadow-[inset_0_0_16px_rgba(0,0,0,0.14)]" : "text-brand hover:bg-white",
                  ].join(" ")}
                  onClick={() => onLevelChange(preset.level)}
                  title={preset.name}
                >
                  {preset.level}
                </button>
              ))}
            </div>
            <div className="mt-2 text-center text-xs text-slate-500 sm:text-sm">
              <span className="font-bold text-slate-950">{selectedBot.name}</span> · {selectedBot.subtitle} · depth {selectedBot.depth}
            </div>
          </div>

          <div>
            <div className="mb-2 text-center text-base font-bold text-slate-800 sm:text-lg">Side</div>
            <div className="grid grid-cols-3 overflow-hidden rounded border border-brand/10 bg-brand-50">
              <SideOption active={selectedColor === "black"} label="Black" symbol="♚" onClick={() => onColorChange("black")} />
              <SideOption active={selectedColor === "random"} label="Random side" symbol="♔" onClick={() => onColorChange("random")} />
              <SideOption active={selectedColor === "white"} label="White" symbol="♔" onClick={() => onColorChange("white")} />
            </div>
          </div>
        </div>

        <div className="flex-none border-t border-brand/10 bg-brand-50 px-4 py-3 text-center sm:py-4">
          <button className="inline-flex h-12 w-full items-center justify-center gap-3 rounded bg-brand px-5 text-base font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[300px] sm:text-lg" onClick={onStart} disabled={starting}>
            <Bot size={24} className="text-accent" /> {starting ? "Checking..." : "Play against computer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SideOption({ active, label, symbol, onClick }: { active: boolean; label: string; symbol: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={[
        "flex min-h-[78px] flex-col items-center justify-center gap-1.5 px-2 text-center transition sm:min-h-[88px]",
        active ? "bg-brand text-white shadow-[inset_0_0_18px_rgba(0,0,0,0.14)]" : "text-brand hover:bg-white",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="text-3xl leading-none text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.8)] sm:text-4xl">{symbol}</span>
      <span className="text-sm font-bold">{label}</span>
    </button>
  );
}

function ResignConfirmModal({
  botName,
  onCancel,
  onConfirm,
}: {
  botName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="resign-confirm-title"
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-red-100 bg-white p-4 shadow-2xl shadow-red-950/15 sm:p-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
              <Flag size={18} />
            </span>
            <div>
              <h2 id="resign-confirm-title" className="text-lg font-black text-slate-950">
                Resign this game?
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                This will immediately end your game against {botName}. Only confirm if you are sure.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            onClick={onCancel}
            aria-label="Close resign confirmation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-outline min-h-11 bg-white" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700"
            onClick={onConfirm}
          >
            <Flag size={16} />
            Confirm Resign
          </button>
        </div>
      </div>
    </div>
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
    <div className="flex min-h-[calc(100dvh-72px)] flex-col overflow-y-auto bg-[linear-gradient(180deg,#fffdf8_0%,#fff 48%,#f7f7fb_100%)] p-2 text-slate-950 sm:p-4 md:h-[calc(100vh-92px)] md:min-h-[620px] md:overflow-hidden">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-3 sm:p-4">
      <div className="max-h-[calc(100dvh-24px)] w-full max-w-[440px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-32px)] sm:p-5">
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
      "rounded border px-2.5 py-2 shadow-sm transition sm:px-3",
      active ? "border-brand bg-brand-50 shadow-brand/10" : "border-slate-200 bg-slate-50",
    ].join(" ")}>
      <div className="grid gap-1">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:text-[11px] sm:tracking-[0.16em]">{side}</div>
          <div className="mt-1 flex items-center gap-1.5 truncate text-xs font-semibold text-slate-700">
            {tone === "player" ? <User size={14} className="text-brand" /> : <Bot size={14} className="text-slate-500" />}
            {name}
          </div>
        </div>
        <div className="text-lg font-black tabular-nums text-slate-950 sm:text-xl">{clock}</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-4">
      <div className="max-h-[calc(100dvh-24px)] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-32px)] sm:p-6">
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
