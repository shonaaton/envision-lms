"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { buildMoveHintStyles, canSelectPieceForTurn, legalTargetsFromGame, mergeSquareStyles } from "@/lib/chessboardUi";
import {
  BookOpen,
  Bot,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Crown,
  Download,
  Eraser,
  Eye,
  FileQuestion,
  FlipHorizontal,
  Folder,
  Grid2X2,
  HelpCircle,
  Highlighter,
  Home,
  Library,
  Lock,
  MessageSquare,
  MousePointer2,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trophy,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type Role = "student" | "instructor" | "admin";
type BoardPosition = Record<string, string | undefined>;
type TabKey = "students" | "chat" | "moves" | "leaderboard";
type ToolKey = "move" | "highlight" | "arrow" | "setup";
type ModifierKey = "default" | "shift" | "ctrl" | "alt";
type SetupTab = "pieces" | "objects";
type SetupMovementMode = "white" | "black" | "free";
type GamifiedObjectId = "star" | "gem" | "coin" | "apple" | "fire" | "trophy" | "gift" | "shield" | "key" | "puzzle" | "rocket" | "monster" | "dragon";
type SetupSelection = string | "erase" | GamifiedObjectId;

const gamifiedObjects: Array<{ id: GamifiedObjectId; label: string; icon: string; points: number }> = [
  { id: "star", label: "Star", icon: "⭐", points: 10 },
  { id: "gem", label: "Gem", icon: "💎", points: 15 },
  { id: "coin", label: "Coin", icon: "🪙", points: 10 },
  { id: "apple", label: "Apple", icon: "🍎", points: 5 },
  { id: "fire", label: "Fire", icon: "🔥", points: -5 },
  { id: "trophy", label: "Trophy", icon: "🏆", points: 25 },
  { id: "gift", label: "Gift Box", icon: "🎁", points: 20 },
  { id: "shield", label: "Shield", icon: "🛡", points: 10 },
  { id: "key", label: "Key", icon: "🗝", points: 10 },
  { id: "puzzle", label: "Puzzle", icon: "🧩", points: 10 },
  { id: "rocket", label: "Rocket", icon: "🚀", points: 15 },
  { id: "monster", label: "Monster", icon: "👾", points: -10 },
  { id: "dragon", label: "Dragon", icon: "🐉", points: -15 },
];

function isCoach(role: Role) {
  return role === "admin" || role === "instructor";
}

function extractFen(pgn: string) {
  return pgn.match(/\[FEN\s+"([^"]+)"\]/)?.[1];
}

function parsePgnPuzzle(pgn: string) {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const moves = game.history({ verbose: true }) as any[];
    const headerFen = extractFen(pgn);
    return {
      start: moves[0]?.before || headerFen || "start",
      moves: moves.map((move) => ({ san: move.san, from: move.from, to: move.to, promotion: move.promotion || "q" })),
      valid: true,
    };
  } catch {
    const fen = extractFen(pgn);
    return { start: fen || "start", moves: [], valid: Boolean(fen) };
  }
}

function fenToPosition(fen?: string): BoardPosition {
  const chess = new Chess();
  if (fen && fen !== "start") chess.load(fen, { skipValidation: true });
  const position: BoardPosition = {};
  chess.board().forEach((rank, rankIndex) => {
    rank.forEach((piece, fileIndex) => {
      if (!piece) return;
      const square = `${"abcdefgh"[fileIndex]}${8 - rankIndex}`;
      position[square] = `${piece.color}${piece.type.toUpperCase()}`;
    });
  });
  return position;
}

function positionToFen(position: BoardPosition, sideToMove = "w") {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let empty = 0;
    let row = "";
    for (const file of "abcdefgh") {
      const piece = position[`${file}${rank}`];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const letter = piece[1];
      row += piece[0] === "w" ? letter : letter.toLowerCase();
    }
    if (empty) row += empty;
    ranks.push(row);
  }
  return `${ranks.join("/")} ${sideToMove} - - 0 1`;
}

function buildGame(fen?: string) {
  try {
    if (fen && fen !== "start") return new Chess(fen);
  } catch {
    // Fall through to a clean board if an instructor is experimenting with setup mode.
  }
  return new Chess();
}

function applyMoves(startFen: string | undefined, moves: string[], count: number) {
  const chess = startFen && startFen !== "start" ? new Chess(startFen) : new Chess();
  for (const move of moves.slice(0, Math.max(0, count))) {
    try {
      chess.move(move);
    } catch {
      break;
    }
  }
  return chess.fen();
}

function playMoveSound(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 520;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.045);
  } catch {
    // Sound is a helper, never a blocker.
  }
}

function initials(name?: string) {
  return (name || "Student")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function entityId(value: any) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function coordinateFiles(orientation: "white" | "black") {
  const files = "abcdefgh".split("");
  return orientation === "white" ? files : files.reverse();
}

function coordinateRanks(orientation: "white" | "black") {
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  return orientation === "white" ? ranks : ranks.reverse();
}

function drawingColor(modifier: ModifierKey) {
  if (modifier === "shift") return "#dc2626";
  if (modifier === "ctrl") return "#16a34a";
  if (modifier === "alt") return "#eab308";
  return "#2563eb";
}

function pieceSymbol(piece: string) {
  const map: Record<string, string> = {
    wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
    bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
  };
  return map[piece] || piece;
}

function isGamifiedObjectId(value: string): value is GamifiedObjectId {
  return gamifiedObjects.some((object) => object.id === value);
}

function getGamifiedObject(id: GamifiedObjectId) {
  return gamifiedObjects.find((object) => object.id === id) || gamifiedObjects[0];
}

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

function removeObjectsOnPieceSquares(objects: Record<string, GamifiedObjectId> = {}, position: BoardPosition = {}) {
  const next = { ...objects };
  Object.keys(position).forEach((square) => {
    if (position[square]) delete next[square];
  });
  return next;
}

function minutesBetween(start?: string | Date, end?: string | Date) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

type LiveBoardQuizResult = { solved: boolean; mistakes: number; hintsUsed: number; timeTakenSeconds: number; skipped?: boolean; submittedMove?: string };

function aggregateLiveResponses(responses: any[]) {
  return responses.reduce(
    (acc, response: any) => {
      acc.score += Number(response?.score || 0);
      acc.attemptsUsed += Number(response?.attemptsUsed || 0);
      acc.hintsUsed += Number(response?.hintsUsed || 0);
      acc.timeTakenSeconds += Number(response?.timeTakenSeconds || 0);
      acc.completedItems += Number(response?.completedItems || 0);
      acc.totalItems += Number(response?.totalItems || 0);
      if (response?.submittedMove) acc.moves.push(response.submittedMove);
      for (const result of Object.values(response?.itemResults || {}) as any[]) {
        if (result?.submittedMove) acc.moves.push(result.submittedMove);
      }
      if (response?.correct) acc.correctResponses += 1;
      if (response?.feedback) acc.feedback = response.feedback;
      return acc;
    },
    {
      score: 0,
      attemptsUsed: 0,
      hintsUsed: 0,
      timeTakenSeconds: 0,
      completedItems: 0,
      totalItems: 0,
      correctResponses: 0,
      moves: [] as string[],
      feedback: "",
    }
  );
}

function submissionLabel(result: any, summary: ReturnType<typeof aggregateLiveResponses>) {
  if (result?.solved) return "Solved this item";
  if (result?.skipped) return "Skipped this item";
  if (summary.completedItems > 0 && summary.completedItems >= Math.max(1, summary.totalItems || 1)) return "Completed quiz";
  return summary.feedback || "Recorded";
}

export default function LiveClassroom({ classroomId, role, userId, sessionId }: { classroomId: string; role: Role; userId: string; sessionId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(role === "student" ? "chat" : "students");
  const [tool, setTool] = useState<ToolKey>("move");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [moveAnswer, setMoveAnswer] = useState("");
  const [quizTitle, setQuizTitle] = useState("Best move from current position");
  const [chatText, setChatText] = useState("");
  const [manualLoadText, setManualLoadText] = useState("");
  const [setupLoadText, setSetupLoadText] = useState("");
  const [selectedPgnIds, setSelectedPgnIds] = useState<string[]>([]);
  const [pgnFolderQuery, setPgnFolderQuery] = useState("");
  const [activePgnFolder, setActivePgnFolder] = useState<string | null>(null);
  const [previewPgn, setPreviewPgn] = useState<any>(null);
  const [challengeTimer, setChallengeTimer] = useState(60);
  const [selectedPiece, setSelectedPiece] = useState("wQ");
  const [setupTab, setSetupTab] = useState<SetupTab>("pieces");
  const [gamifiedSetup, setGamifiedSetup] = useState<Record<string, GamifiedObjectId>>({});
  const [selectedObject, setSelectedObject] = useState<GamifiedObjectId | "delete">("star");
  const [draggedObjectSquare, setDraggedObjectSquare] = useState<string | null>(null);
  const [setupMovementMode, setSetupMovementMode] = useState<SetupMovementMode>("white");
  const [setupOpen, setSetupOpen] = useState(false);
  const [pgnOpen, setPgnOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [hiddenStudentQuizId, setHiddenStudentQuizId] = useState<string | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, "present" | "absent" | "late">>({});
  const [setupPosition, setSetupPosition] = useState<BoardPosition>({});
  const [modifier, setModifier] = useState<ModifierKey>("default");
  const [engineText, setEngineText] = useState("Engine ready");
  const [boardWidth, setBoardWidth] = useState(620);
  const [selectedMoveSquare, setSelectedMoveSquare] = useState<string | null>(null);
  const [coachDrawings, setCoachDrawings] = useState<any[]>([]);
  const [drawingsDirty, setDrawingsDirty] = useState(false);
  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Worker | null>(null);
  const loadInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const drawingsPersistTimerRef = useRef<number | null>(null);
  const dataRef = useRef<any>(null);
  const coach = isCoach(role);

  function focusBoard() {
    boardShellRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  function liveUrl(path = "") {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    const query = params.toString();
    return `/api/classrooms/${classroomId}/live${path}${query ? `${path.includes("?") ? "&" : "?"}${query}` : ""}`;
  }

  async function load(force = false) {
    if (loadInFlightRef.current && !force) {
      refreshQueuedRef.current = true;
      return;
    }
    loadInFlightRef.current = true;
    try {
      const res = await fetch(liveUrl(), { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      loadInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void load(true);
      }
    }
  }

  function queueRefresh(delay = 60) {
    if (typeof window === "undefined") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void load(true);
    }, delay);
  }

  function applyOptimisticLive(update: any) {
    setData((current: any) => {
      if (!current?.live) return current;
      const next = {
        ...current,
        live: {
          ...current.live,
          ...update,
          updatedAt: new Date().toISOString(),
        },
      };
      dataRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => {
      void load();
    }, 250);
    return () => {
      window.clearInterval(timer);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [classroomId, sessionId]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    setCoachDrawings(data?.live?.drawings || []);
    setDrawingsDirty(false);
  }, [data?.live?.drawings]);

  useEffect(() => {
    return () => {
      if (drawingsPersistTimerRef.current) window.clearTimeout(drawingsPersistTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!boardShellRef.current) return;
    const resize = () => {
      const width = boardShellRef.current?.clientWidth || 620;
      const heightLimit = typeof window === "undefined" ? 560 : window.innerHeight - (coach ? 330 : 255);
      const coordinateGutter = data?.live?.showCoordinates === false ? 12 : 56;
      setBoardWidth(Math.max(300, Math.min(620, width - coordinateGutter, heightLimit)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(boardShellRef.current);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [coach, data?.live?.showCoordinates]);

  const live = data?.live;
  const classroom = data?.classroom;
  const scheduledSession = data?.scheduledSession;
  const activeQuestion = data?.activeQuestion;
  const myLiveResponse = useMemo(
    () => (data?.responses || []).find((response: any) => response.student?._id === userId || response.student === userId) || null,
    [data?.responses, userId]
  );
  const students = classroom?.students || [];
  const pgnLibrary = data?.pgnLibrary || [];
  const questionUsesBoardFlow = Boolean((Array.isArray(activeQuestion?.items) && activeQuestion.items.length > 0) || activeQuestion?.solution?.length);
  const studentQuizMode = Boolean(activeQuestion) && !coach && hiddenStudentQuizId !== String(activeQuestion?._id || "") && ((Array.isArray(activeQuestion?.items) && activeQuestion.items.length > 0) || activeQuestion?.solution?.length);
  const coachQuizMode = Boolean(activeQuestion) && coach;
  const studentPanelTabs = [
    { key: "chat" as TabKey, icon: <MessageSquare size={19} />, label: "Chat" },
    { key: "leaderboard" as TabKey, icon: <Crown size={19} />, label: "Leaderboard" },
  ];

  useEffect(() => {
    if (!coach && activeTab === "moves") setActiveTab("chat");
  }, [activeTab, coach]);

  useEffect(() => {
    if (!activeQuestion?._id) {
      setHiddenStudentQuizId(null);
      return;
    }
    if (hiddenStudentQuizId && hiddenStudentQuizId !== String(activeQuestion._id)) {
      setHiddenStudentQuizId(null);
    }
  }, [activeQuestion?._id, hiddenStudentQuizId]);
  const pgnFolders = useMemo(() => {
    const counts = new Map<string, number>();
    pgnLibrary.forEach((pgn: any) => {
      const folder = normalizeFolderPath(pgn.folder);
      const childPath = getImmediateChildPath(activePgnFolder || "", folder);
      if (!childPath) return;
      counts.set(childPath, (counts.get(childPath) || 0) + 1);
    });
    const q = pgnFolderQuery.trim().toLowerCase();
    return Array.from(counts.entries())
      .map(([path, count]) => ({ path, name: folderLabel(path), count }))
      .filter((folder) => !q || folder.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pgnLibrary, pgnFolderQuery, activePgnFolder]);
  const visiblePgnLibrary = useMemo(() => {
    const q = pgnFolderQuery.trim().toLowerCase();
    return pgnLibrary.filter((pgn: any) => {
      const folder = normalizeFolderPath(pgn.folder);
      const inFolder = activePgnFolder === null
        ? !folder
        : activePgnFolder === "__unfiled__"
          ? !folder
          : folder === activePgnFolder;
      if (!inFolder) return false;
      if (!q) return true;
      return [pgn.title, pgn.white, pgn.black, pgn.event].filter(Boolean).some((value: any) => String(value).toLowerCase().includes(q));
    });
  }, [pgnLibrary, activePgnFolder, pgnFolderQuery]);
  const chatMessages = data?.chatMessages || [];
  const pgnMoves = live?.pgnMoves || [];
  const currentMoveIndex = live?.pgnMoveIndex || 0;
  const boardFen = live?.fen === "start" || !live?.fen ? "start" : live.fen;
  const boardPosition = boardFen;
  const boardPieceMap = useMemo(() => fenToPosition(live?.fen), [live?.fen]);
  const liveGamifiedObjects = useMemo(
    () => removeObjectsOnPieceSquares(live?.gamifiedObjects || {}, boardPieceMap),
    [live?.gamifiedObjects, boardPieceMap]
  );
  const game = useMemo(() => buildGame(live?.fen), [live?.fen]);
  const canMove =
    coach ||
    (live?.studentMovesEnabled &&
      (live?.boardControlStudents || []).some((student: any) => entityId(student) === userId));
  const duration = live?.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 60000)) : 0;
  const classroomName = classroom?.title || "Live Classroom";
  const coachName = classroom?.coach?.name || classroom?.instructor?.name || "Coach";
  const activeStudents = students.filter((student: any) => student?.status !== "inactive");

  useEffect(() => {
    if (live?.status === "ended") {
      toast.info("This classroom session has already ended");
      router.push("/classrooms");
    }
  }, [live?.status, router]);

  useEffect(() => {
    if (setupOpen) return;
    setSetupPosition(boardPieceMap);
    setGamifiedSetup(liveGamifiedObjects);
    setSetupMovementMode(live?.illegalMovesEnabled ? "free" : live?.fen?.split(" ")?.[1] === "b" ? "black" : "white");
    setSelectedMoveSquare(null);
  }, [boardPieceMap, live?.fen, live?.illegalMovesEnabled, live?.setupMode, liveGamifiedObjects, setupOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.shiftKey) setModifier("shift");
      else if (event.ctrlKey || event.metaKey) setModifier("ctrl");
      else if (event.altKey) setModifier("alt");
      else setModifier("default");
      if (event.key === "ArrowLeft") navigateMove(currentMoveIndex - 1);
      if (event.key === "ArrowRight") navigateMove(currentMoveIndex + 1);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.shiftKey) setModifier("shift");
      else if (event.ctrlKey || event.metaKey) setModifier("ctrl");
      else if (event.altKey) setModifier("alt");
      else setModifier("default");
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [currentMoveIndex, pgnMoves.length, live?.pgn]);

  useEffect(() => {
    if (!live?.engineEnabled || !live?.fen || activeTab !== "moves") return;
    try {
      if (!engineRef.current) {
        engineRef.current = new Worker("/stockfish/stockfish.js");
        engineRef.current.onmessage = (event) => {
          const line = String(event.data || "");
          if (line.includes("score") || line.startsWith("bestmove")) setEngineText(line);
        };
        engineRef.current.postMessage("uci");
      }
      engineRef.current.postMessage(`position fen ${live.fen === "start" ? new Chess().fen() : live.fen}`);
      engineRef.current.postMessage("go depth 8");
    } catch {
      setEngineText("Engine unavailable in this browser session");
    }
  }, [activeTab, live?.engineEnabled, live?.fen]);

  async function patch(update: any, options?: { optimistic?: boolean }) {
    if (options?.optimistic !== false) applyOptimisticLive(update);
    const res = await fetch(liveUrl(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      toast.error(payload?.error || "Could not update classroom");
      queueRefresh(0);
      return;
    }
    queueRefresh(80);
  }

  function currentLive() {
    return dataRef.current?.live || live || {};
  }

  function updateDrawings(mutator: (drawings: any[]) => any[]) {
    const snapshot = currentLive();
    const nextDrawings = mutator([...(snapshot.drawings || [])]);
    patch({ drawings: nextDrawings });
  }

  function scheduleDrawings(nextDrawings: any[]) {
    setCoachDrawings(nextDrawings);
    setDrawingsDirty(true);
    if (drawingsPersistTimerRef.current) window.clearTimeout(drawingsPersistTimerRef.current);
    drawingsPersistTimerRef.current = window.setTimeout(() => {
      drawingsPersistTimerRef.current = null;
      const snapshot = currentLive();
      if (JSON.stringify(snapshot.drawings || []) !== JSON.stringify(nextDrawings)) {
        patch({ drawings: nextDrawings });
      }
    }, 70);
  }

  function updateCoachDrawings(mutator: (drawings: any[]) => any[]) {
    const base = drawingsDirty ? coachDrawings : (live?.drawings || []);
    const nextDrawings = mutator([...(base || [])]);
    scheduleDrawings(nextDrawings);
  }

  async function submitStudentMove(source: string, target: string, promotion = "q") {
    const res = await fetch(liveUrl("/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: source, to: target, promotion }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      toast.error(payload?.error || "Move not registered");
      queueRefresh(0);
      return false;
    }
    const payload = await res.json().catch(() => null);
    playMoveSound(live?.soundEnabled);
    setData((current: any) => {
      if (!current?.live || !payload?.ok) return current;
      return {
        ...current,
        live: {
          ...current.live,
          fen: payload.fen,
          gamifiedObjects: payload.gamifiedObjects || current.live.gamifiedObjects,
          moveHistory: payload.moveHistory || current.live.moveHistory,
          status: "live",
          updatedAt: new Date().toISOString(),
        },
      };
    });
    queueRefresh(0);
    return true;
  }

  function setupSideToMove() {
    return setupMovementMode === "black" ? "b" : "w";
  }

  function commitSetup(position = setupPosition, objects = liveGamifiedObjects) {
    patch({ fen: positionToFen(position, setupSideToMove()), gamifiedObjects: removeObjectsOnPieceSquares(objects, position), setupMode: true, illegalMovesEnabled: setupMovementMode === "free" });
  }

  function commitFreeMove(position: BoardPosition, objects = liveGamifiedObjects) {
    const sideToMove = live?.fen?.split(" ")?.[1] === "b" ? "b" : "w";
    patch({
      fen: positionToFen(position, sideToMove),
      gamifiedObjects: removeObjectsOnPieceSquares(objects, position),
      setupMode: Boolean(live?.setupMode || tool === "setup"),
      illegalMovesEnabled: true,
    });
  }

  function onDrop(source: string, target: string, piece: string) {
    setSelectedMoveSquare(null);
    if (live?.locked || (!canMove && !coach)) return false;
    if (live?.setupMode || tool === "setup") {
      const next = { ...setupPosition };
      delete next[source];
      next[target] = piece;
      const nextObjects = { ...liveGamifiedObjects };
      delete nextObjects[target];
      setSetupPosition(next);
      commitSetup(next, nextObjects);
      playMoveSound(live?.soundEnabled);
      return true;
    }
    if (live?.illegalMovesEnabled) {
      const next = { ...boardPieceMap };
      delete next[source];
      next[target] = piece;
      const nextObjects = { ...liveGamifiedObjects };
      delete nextObjects[target];
      setSetupPosition(next);
      if (!coach) {
        const sideToMove = live?.fen?.split(" ")?.[1] === "b" ? "b" : "w";
        applyOptimisticLive({
          fen: positionToFen(next, sideToMove),
          gamifiedObjects: removeObjectsOnPieceSquares(nextObjects, next),
          illegalMovesEnabled: true,
          status: "live",
        });
        submitStudentMove(source, target).catch(() => undefined);
      } else {
        commitFreeMove(next, nextObjects);
      }
      playMoveSound(live?.soundEnabled);
      return true;
    }
    if (!coach) {
      submitStudentMove(source, target).catch(() => undefined);
      return true;
    }
    try {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      const collectedObjectId = liveGamifiedObjects[target] as GamifiedObjectId | undefined;
      const nextGamifiedObjects = collectedObjectId ? { ...liveGamifiedObjects } : liveGamifiedObjects;
      if (collectedObjectId && nextGamifiedObjects) delete nextGamifiedObjects[target];
      patch({
        fen: game.fen(),
        gamifiedObjects: nextGamifiedObjects,
        moveHistory: [...(live?.moveHistory || []), move.san],
        mode: live?.mode === "one_move_challenge" ? "teaching" : live?.mode,
        boardControlStudents: live?.mode === "one_move_challenge" ? [] : live?.boardControlStudents?.map((s: any) => s._id || s),
        challenge: live?.mode === "one_move_challenge" ? { active: false } : live?.challenge,
      });
      if (collectedObjectId) {
        const object = getGamifiedObject(collectedObjectId);
        toast.success(`${object.icon} ${object.label} collected: ${object.points > 0 ? "+" : ""}${object.points} points`);
      }
      playMoveSound(live?.soundEnabled);
      return true;
    } catch {
      return false;
    }
  }

  function onPieceDropOffBoard(source: string) {
    if (!(live?.setupMode || tool === "setup")) return;
    const next = { ...setupPosition };
    delete next[source];
    setSetupPosition(next);
    commitSetup(next);
  }

  function onSetupDrop(source: string, target: string, piece: string) {
    const next = { ...setupPosition };
    delete next[source];
    next[target] = piece;
    setSetupPosition(next);
    setGamifiedSetup((current) => {
      const nextObjects = { ...current };
      delete nextObjects[target];
      return nextObjects;
    });
    return true;
  }

  function onSetupDropOffBoard(source: string) {
    const next = { ...setupPosition };
    delete next[source];
    setSetupPosition(next);
  }

  function onSetupSquareClick(square: string) {
    if (setupTab === "objects") {
      if (selectedObject !== "delete") {
        setSetupPosition((current) => {
          const next = { ...current };
          delete next[square];
          return next;
        });
      }
      setGamifiedSetup((current) => {
        const next = { ...current };
        if (selectedObject === "delete") delete next[square];
        else next[square] = selectedObject;
        return next;
      });
      return;
    }
    const next = { ...setupPosition };
    if (selectedPiece === "erase") delete next[square];
    else next[square] = selectedPiece;
    setSetupPosition(next);
    if (selectedPiece !== "erase") {
      setGamifiedSetup((current) => {
        const nextObjects = { ...current };
        delete nextObjects[square];
        return nextObjects;
      });
    }
  }

  function loadSetupIntoClassroom() {
    patch({ fen: positionToFen(setupPosition, setupSideToMove()), gamifiedObjects: removeObjectsOnPieceSquares(gamifiedSetup, setupPosition), setupMode: false, illegalMovesEnabled: setupMovementMode === "free", pgn: "", pgnTitle: "Custom Position", pgnMoves: [], pgnMoveIndex: 0, moveHistory: [], drawings: [] });
    setSetupOpen(false);
  }

  function moveGamifiedObject(targetSquare: string) {
    setSetupPosition((current) => {
      const nextPosition = { ...current };
      delete nextPosition[targetSquare];
      return nextPosition;
    });
    setGamifiedSetup((current) => {
      const next = { ...current };
      if (draggedObjectSquare && current[draggedObjectSquare]) {
        next[targetSquare] = current[draggedObjectSquare];
        delete next[draggedObjectSquare];
      } else if (selectedObject !== "delete") {
        next[targetSquare] = selectedObject;
      } else {
        delete next[targetSquare];
      }
      return next;
    });
    setDraggedObjectSquare(null);
  }

  function deleteGamifiedObject(square: string) {
    setGamifiedSetup((current) => {
      const next = { ...current };
      delete next[square];
      return next;
    });
  }

  function loadSetupText() {
    const value = setupLoadText.trim();
    if (!value) return;
    try {
      const fenGame = new Chess(value);
      setSetupPosition(fenToPosition(fenGame.fen()));
      setSetupLoadText("");
      toast.success("FEN loaded into setup board");
      return;
    } catch {
      // Try PGN next.
    }
    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(value);
      setSetupPosition(fenToPosition(pgnGame.fen()));
      setSetupLoadText("");
      toast.success("PGN position loaded into setup board");
    } catch {
      toast.error("Paste a valid PGN or FEN");
    }
  }

  function onSquareClick(square: string) {
    const clickedPiece = boardPieceMap[square];
    if (live?.setupMode || tool === "setup") {
      if (!coach) return;
      const next = { ...setupPosition };
      if (selectedPiece === "erase") delete next[square];
      else next[square] = selectedPiece;
      setSetupPosition(next);
      commitSetup(next);
      return;
    }
    if (coach) {
      const currentDrawings = drawingsDirty ? coachDrawings : (live?.drawings || []);
      const highlighted = currentDrawings.find((drawing: any) => drawing.type === "highlight" && drawing.from === square);
      if (highlighted) {
        scheduleDrawings(currentDrawings.filter((drawing: any) => !(drawing.type === "highlight" && drawing.from === square)));
        return;
      }
    }
    if (!coach && !canMove) return;
    if (selectedMoveSquare && selectedMoveSquare !== square) {
      const selectedPieceCode = boardPieceMap[selectedMoveSquare];
      if (selectedPieceCode) {
        const moved = onDrop(selectedMoveSquare, square, selectedPieceCode);
        if (moved) return;
      }
    }
    if (!clickedPiece) {
      setSelectedMoveSquare(null);
      return;
    }
    if (live?.illegalMovesEnabled) {
      setSelectedMoveSquare((current) => (current === square ? null : square));
      return;
    }
    if (canSelectPieceForTurn(clickedPiece, game.turn())) {
      setSelectedMoveSquare((current) => (current === square ? null : square));
      return;
    }
    setSelectedMoveSquare(null);
  }

  function onSquareRightClick(square: string) {
    if (!coach) return;
    const color = drawingColor(modifier);
    updateCoachDrawings((drawings) => {
      const sameHighlight = drawings.some((drawing: any) => drawing.type === "highlight" && drawing.from === square && drawing.color === color);
      if (sameHighlight) {
        return drawings.filter((drawing: any) => !(drawing.type === "highlight" && drawing.from === square && drawing.color === color));
      }
      return [...drawings.filter((drawing: any) => !(drawing.type === "highlight" && drawing.from === square)), { type: "highlight", from: square, color }];
    });
  }

  function persistBoardArrows(nextArrows: any[]) {
    if (!coach) return;
    const baseDrawings = drawingsDirty ? coachDrawings : (live?.drawings || []);
    const highlights = baseDrawings.filter((drawing: any) => drawing.type === "highlight");
    const dedupedArrows = new Map<string, any>();
    nextArrows.forEach((arrow) => {
      const color = arrow[2] || drawingColor(modifier);
      dedupedArrows.set(`${arrow[0]}-${arrow[1]}-${color}`, {
        type: "arrow",
        from: arrow[0],
        to: arrow[1],
        color,
      });
    });
    const incomingArrows = Array.from(dedupedArrows.values()).map((arrow) => ({
      type: "arrow",
      from: arrow.from,
      to: arrow.to,
      color: arrow.color,
    }));
    const merged = [...highlights, ...incomingArrows];
    if (JSON.stringify(merged) !== JSON.stringify(baseDrawings || [])) scheduleDrawings(merged);
  }

  async function askEveryone() {
    const res = await fetch(liveUrl("/question"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ask_everyone",
        title: "Ask Everyone",
        instructions: "Submit the best move from the current position.",
        fen: live?.fen || "start",
        pgn: live?.pgn,
        moveHistory: live?.moveHistory || [],
      }),
    });
    if (res.ok) toast.success("Question sent to everyone");
    setActiveTab("leaderboard");
    queueRefresh(60);
  }

  async function createQuiz() {
    const expectedMove = pgnMoves[currentMoveIndex];
    if (!expectedMove) {
      toast.error("Load a PGN position first so the next move can be checked on the board");
      return;
    }
    const res = await fetch(liveUrl("/question"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "best_move",
        title: quizTitle,
        topic: "Classroom Quiz",
        difficulty: "medium",
        instructions: "Find the best move from the current classroom position.",
        fen: live?.fen || "start",
        pgn: live?.pgn,
        moveHistory: live?.moveHistory || [],
        solution: [expectedMove],
        items: [{
          id: `${live?._id || classroomId}-current`,
          title: quizTitle,
          fen: live?.fen || "start",
          pgn: live?.pgn,
          solution: pgnMoves.slice(currentMoveIndex),
          points: 5,
          timerSeconds: challengeTimer,
        }],
        timer: { perQuestionSeconds: challengeTimer },
        scoring: { correct: 5, wrongPenalty: 1, hintPenalty: 1, speedBonus: 2 },
        attempts: "multiple",
        hintsEnabled: true,
        progressionMode: "auto",
        currentItemIndex: 0,
      }),
    });
    if (res.ok) toast.success("Live quiz launched");
    setActiveTab("leaderboard");
    queueRefresh(60);
  }

  async function submitResponse() {
    if (!activeQuestion) return;
    const res = await fetch(liveUrl("/responses"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: activeQuestion._id, submittedMove: moveAnswer }),
    });
    if (res.ok) {
      toast.success("Response submitted");
      setMoveAnswer("");
      queueRefresh(60);
    }
  }

  async function submitBoardQuizResults(itemResults: Record<string, any>, timeTakenSeconds: number) {
    if (!activeQuestion) return;
    const attemptsUsed = Object.values(itemResults).reduce((sum: number, result: any) => sum + Math.max(1, Number(result.mistakes || 0) + 1), 0);
    const hintsUsed = Object.values(itemResults).reduce((sum: number, result: any) => sum + Number(result.hintsUsed || 0), 0);
    const res = await fetch(liveUrl("/responses"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: activeQuestion._id,
        itemResults,
        timeTakenSeconds,
        hintsUsed,
        attemptsUsed,
      }),
    });
    if (res.ok) {
      toast.success("Quiz submitted");
      queueRefresh(60);
    }
  }

  async function submitBoardQuizProgress(itemResults: Record<string, any>, timeTakenSeconds: number) {
    if (!activeQuestion) return;
    const attemptsUsed = Object.values(itemResults).reduce((sum: number, result: any) => sum + Math.max(1, Number(result.mistakes || 0) + 1), 0);
    const hintsUsed = Object.values(itemResults).reduce((sum: number, result: any) => sum + Number(result.hintsUsed || 0), 0);
    await fetch(liveUrl("/responses"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: activeQuestion._id,
        itemResults,
        timeTakenSeconds,
        hintsUsed,
        attemptsUsed,
      }),
    });
  }

  async function updateQuizProgression(update: { currentItemIndex?: number; progressionMode?: "auto" | "manual" }) {
    if (!activeQuestion) return;
    const res = await fetch(liveUrl("/question"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: activeQuestion._id, ...update }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      toast.error(payload?.error || "Quiz progression could not be updated");
      return;
    }
    queueRefresh(40);
  }

  async function endLiveQuiz() {
    if (!activeQuestion) return;
    const res = await fetch(liveUrl("/question"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: activeQuestion._id, status: "closed" }),
    });
    if (res.ok) {
      toast.success("Quiz ended. Returning everyone to the live board.");
      queueRefresh(40);
      return;
    }
    const payload = await res.json().catch(() => null);
    toast.error(payload?.error || "Quiz could not be closed");
  }

  async function sendChat() {
    if (!chatText.trim()) return;
    const res = await fetch(liveUrl("/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: chatText }),
    });
    if (res.ok) {
      setChatText("");
      queueRefresh(40);
    }
  }

  async function openEndSummary() {
    setSummaryOpen(true);
  }

  async function saveAttendanceAndClose() {
    const records = students.map((student: any) => ({
      student: student._id,
      status: attendanceDraft[student._id] || "absent",
      note: "Marked from live classroom summary",
    }));
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classroom: classroomId,
        sessionId,
        sessionDate: scheduledSession?.scheduledFor || live?.startedAt || new Date().toISOString(),
        records,
        coach: classroom?.coach?._id || classroom?.instructor?._id,
        coachStatus: "present",
        teachingMinutes: classSummary.durationMinutes || minutesBetween(live?.startedAt, new Date().toISOString()),
        metadata: { summary: classSummary, liveSessionId: live?._id },
      }),
    });
    if (!res.ok) {
      toast.error("Could not save attendance");
      return;
    }
    await patch({ endedAt: new Date().toISOString(), status: "ended", summary: classSummary, participants: [], boardControlStudents: [], selectedStudents: [], challenge: { active: false } });
    toast.success("Class ended and attendance saved");
    setSummaryOpen(false);
    router.push("/classrooms");
  }

  function resetGame() {
    patch({ fen: "start", pgnMoveIndex: 0, moveHistory: [], drawings: [], setupMode: false });
  }

  function navigateMove(nextIndex: number) {
    if (!pgnMoves.length) return;
    const boundedIndex = Math.max(0, Math.min(pgnMoves.length, nextIndex));
    const startFen = extractFen(live?.pgn || "") || "start";
    patch({ fen: applyMoves(startFen, pgnMoves, boundedIndex), pgnMoveIndex: boundedIndex, moveHistory: pgnMoves.slice(0, boundedIndex) });
  }

  function loadPgn(pgn: any, index: number) {
    const chess = new Chess();
    try {
      chess.loadPgn(pgn.pgn);
      const moves = chess.history();
      const startFen = extractFen(pgn.pgn) || "start";
      patch({
        pgn: pgn.pgn,
        pgnTitle: pgn.title,
        pgnMoves: moves,
        pgnMoveIndex: 0,
        fen: startFen,
        moveHistory: [],
        setupMode: false,
        drawings: [],
      });
      setActiveTab("moves");
      setPgnOpen(false);
      toast.success(`Loaded ${pgn.title}`);
    } catch {
      toast.error("This PGN could not be loaded");
    }
  }

  function loadManualPosition() {
    const value = manualLoadText.trim();
    if (!value) return;
    try {
      const fenGame = new Chess(value);
      patch({ fen: fenGame.fen(), pgn: "", pgnTitle: "Custom FEN", pgnMoves: [], pgnMoveIndex: 0, moveHistory: [], setupMode: false, drawings: [] });
      setManualLoadText("");
      setPgnOpen(false);
      toast.success("FEN loaded into classroom");
      return;
    } catch {
      // Try PGN next.
    }
    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(value);
      const moves = pgnGame.history();
      const startFen = extractFen(value) || "start";
      patch({
        pgn: value,
        pgnTitle: "Pasted PGN",
        pgnMoves: moves,
        pgnMoveIndex: 0,
        fen: startFen,
        moveHistory: [],
        setupMode: false,
        drawings: [],
      });
      setManualLoadText("");
      setActiveTab("moves");
      setPgnOpen(false);
      toast.success("PGN loaded into classroom");
    } catch {
      toast.error("Paste a valid PGN or FEN");
    }
  }

  function loadAdjacentPgn(direction: 1 | -1) {
    if (!pgnLibrary.length) return;
    const current = pgnLibrary.findIndex((pgn: any) => pgn.title === live?.pgnTitle || pgn.pgn === live?.pgn);
    const next = current < 0 ? 0 : Math.max(0, Math.min(pgnLibrary.length - 1, current + direction));
    loadPgn(pgnLibrary[next], next);
  }

  function togglePgnSelection(id: string) {
    setSelectedPgnIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function loadSelectedPgns() {
    const selected = pgnLibrary.filter((pgn: any) => selectedPgnIds.includes(pgn._id));
    if (!selected.length) return toast.info("Select at least one PGN");
    loadPgn(selected[0], 0);
  }

  async function askSelectedPgnAsQuiz() {
    const selected = pgnLibrary.filter((pgn: any) => selectedPgnIds.includes(pgn._id));
    if (!selected.length) return toast.info("Select at least one PGN");
    const first = selected[0];
    try {
      const firstParsed = parsePgnPuzzle(first.pgn);
      const firstMoves = firstParsed.moves.map((move: any) => move.san);
      const res = await fetch(liveUrl("/question"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "move_sequence",
          title: selected.length === 1 ? `One Move Challenge: ${first.title}` : `Classroom Quiz: ${selected.length} PGNs`,
          instructions: selected.length === 1 ? "Find the next move from this PGN position." : "Solve each board on the classroom board. Correct answers move automatically to the next one.",
          fen: firstParsed.start,
          pgn: first.pgn,
          moveHistory: [],
          solution: firstMoves.length ? [firstMoves[0]] : [],
          items: selected.map((pgn: any, index: number) => {
            const parsed = parsePgnPuzzle(pgn.pgn);
            return {
              id: pgn._id,
              title: pgn.title,
              pgn: pgn.pgn,
              pgnTitle: pgn.title,
              fen: parsed.start,
              solution: parsed.moves.map((move: any) => move.san),
              points: 5,
              timerSeconds: challengeTimer,
            };
          }),
          timer: { perQuestionSeconds: challengeTimer },
          scoring: { correct: 5, wrongPenalty: 1, hintPenalty: 1, speedBonus: 2, attemptPenalty: 1 },
          attempts: "multiple",
          hintsEnabled: true,
        }),
      });
      if (res.ok) {
        await patch({
          fen: firstParsed.start,
          pgn: first.pgn,
          pgnTitle: first.title,
          pgnMoves: firstMoves,
          pgnMoveIndex: 0,
          moveHistory: [],
          mode: "one_move_challenge",
          studentMovesEnabled: true,
          boardControlStudents: students.map((student: any) => student._id),
          locked: false,
        });
        setActiveTab("leaderboard");
        setPgnOpen(false);
        toast.success("Challenge sent to students");
      }
    } catch {
      toast.error("This PGN could not be used as a quiz");
    }
  }

  const displayedDrawings = coach && drawingsDirty ? coachDrawings : (live?.drawings || []);
  const moveTargets = useMemo(() => {
    if (!selectedMoveSquare || live?.illegalMovesEnabled || live?.locked || (!coach && !canMove)) return [];
    return legalTargetsFromGame(game, selectedMoveSquare);
  }, [selectedMoveSquare, live?.illegalMovesEnabled, live?.locked, coach, canMove, game]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedMoveSquare), [moveTargets, selectedMoveSquare]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, Record<string, string | number>> = {};
    for (const drawing of displayedDrawings || []) {
      if (drawing.type === "highlight" && drawing.from) {
        styles[drawing.from] = {
          boxShadow: `inset 0 0 0 999px ${drawing.color || "#facc15"}55`,
        };
      }
    }
    return mergeSquareStyles(styles as any, moveHintStyles as any) as any;
  }, [displayedDrawings, moveHintStyles]);

  const arrows = useMemo(() => {
    return (displayedDrawings || [])
      .filter((drawing: any) => drawing.type === "arrow" && drawing.from && drawing.to)
      .map((drawing: any) => [drawing.from, drawing.to, drawing.color || "#7c1fa2"]);
  }, [displayedDrawings]);

  const leaderboardRows = useMemo(() => {
    const responseMap = new Map<string, any[]>();
    for (const response of data?.responses || []) {
      const studentId = response.student?._id || response.student;
      if (!studentId) continue;
      responseMap.set(studentId, [...(responseMap.get(studentId) || []), response]);
    }
    return students
      .map((student: any) => {
        const summary = aggregateLiveResponses(responseMap.get(student._id) || []);
        return {
          ...student,
          points: summary.score,
          completed: summary.completedItems > 0 || summary.correctResponses > 0 || summary.moves.length > 0,
          move: summary.moves.at(-1),
          attempts: summary.attemptsUsed,
          completedItems: summary.completedItems,
        };
      })
      .sort((a: any, b: any) => b.points - a.points);
  }, [students, data?.responses]);

  const classSummary = useMemo(() => {
    const now = live?.endedAt || new Date().toISOString();
    const studentParticipants = (live?.participants || []).filter((participant: any) => participant.role === "student");
    const participantMap = new Map(studentParticipants.map((participant: any) => [participant.user?._id || participant.user, participant]));
    const responses = data?.responses || [];
    const responseByStudent = new Map<string, any[]>();
    for (const response of responses) {
      const id = response.student?._id;
      if (!id) continue;
      responseByStudent.set(id, [...(responseByStudent.get(id) || []), response]);
    }
    const rows = students.map((student: any) => {
      const participant: any = participantMap.get(student._id);
      const studentResponses = responseByStudent.get(student._id) || [];
      const correct = studentResponses.filter((response) => response.correct).length;
      const submissions = studentResponses.length;
      const points = studentResponses.reduce((sum, response) => sum + Number(response.score || 0), 0);
      const timeMinutes = participant ? minutesBetween(participant.firstSeenAt, participant.lastSeenAt || now) : 0;
      const suggestedStatus: "present" | "absent" | "late" = timeMinutes >= 10 || submissions > 0 ? "present" : timeMinutes > 0 ? "late" : "absent";
      return {
        student,
        timeMinutes,
        submissions,
        participation: submissions,
        correct,
        accuracy: submissions ? Math.round((correct / submissions) * 100) : 0,
        points,
        suggestedStatus,
      };
    });
    const present = rows.filter((row: any) => row.suggestedStatus === "present").length;
    const late = rows.filter((row: any) => row.suggestedStatus === "late").length;
    const absent = rows.length - present - late;
    const totalScore = responses.reduce((sum: number, response: any) => sum + Number(response.score || 0), 0);
    return {
      startedAt: live?.startedAt,
      endedAt: now,
      durationMinutes: minutesBetween(live?.startedAt, now),
      present,
      late,
      absent,
      rows,
      quizzes: activeQuestion ? 1 : 0,
      questions: activeQuestion ? 1 : 0,
      averageScore: responses.length ? Math.round(totalScore / responses.length) : 0,
      totalPoints: totalScore,
    };
  }, [activeQuestion, data?.responses, live?.endedAt, live?.participants, live?.startedAt, students]);

  useEffect(() => {
    if (!summaryOpen) return;
    const draft: Record<string, "present" | "absent" | "late"> = {};
    for (const row of classSummary.rows) draft[row.student._id] = row.suggestedStatus;
    setAttendanceDraft(draft);
  }, [classSummary.rows, summaryOpen]);

  if (!data) return <div className="rounded-lg border border-slate-200 bg-white p-5">Loading classroom...</div>;

  const SidebarButton = ({
    id,
    icon,
    label,
    active,
    onClick,
    disabled = false,
    disabledLabel,
    emphasis = "default",
  }: {
    id?: ToolKey;
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    disabledLabel?: string;
    emphasis?: "default" | "danger";
  }) => (
    <button
      type="button"
      onClick={disabled ? undefined : onClick || (() => id && setTool(id))}
      title={disabled ? disabledLabel || label : label}
      disabled={disabled}
      className={`flex min-h-10 items-center rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
        sidebarCollapsed ? "justify-center" : "gap-2"
      } ${
        active || (id && tool === id)
          ? "border-purple-300 bg-purple-100 text-purple-800"
          : emphasis === "danger"
            ? "border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50"
            : "border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800"
      } ${
        disabled ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-400" : ""
      }`}
    >
      <span className="grid h-6 w-6 flex-none place-items-center">{icon}</span>
      {!sidebarCollapsed && <span className="truncate">{label}</span>}
    </button>
  );

  const ToolButton = ({ id, icon, label, active, onClick, disabled, disabledLabel, emphasis }: { id?: ToolKey; icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; disabled?: boolean; disabledLabel?: string; emphasis?: "default" | "danger" }) => (
    <SidebarButton id={id} icon={icon} label={label} active={active} onClick={onClick} disabled={disabled} disabledLabel={disabledLabel} emphasis={emphasis} />
  );

  const ToggleButton = ({ active, label, icon, onClick, disabled, disabledLabel, emphasis }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; disabledLabel?: string; emphasis?: "default" | "danger" }) => (
    <SidebarButton active={active} icon={icon} label={label} onClick={onClick} disabled={disabled} disabledLabel={disabledLabel} emphasis={emphasis} />
  );

  const orientation = (live?.orientation || "white") as "white" | "black";
  const files = coordinateFiles(orientation);
  const ranks = coordinateRanks(orientation);
  const setupBoardSize = Math.min(340, Math.max(300, boardWidth));
  const canLaunchBoardQuiz = Boolean(pgnMoves[currentMoveIndex]);
  const canLoadPgnLibrary = coach && pgnLibrary.length > 0;
  const coachSidebarTabs = [
    { key: "students" as TabKey, icon: <Users size={19} />, label: "Students" },
    { key: "chat" as TabKey, icon: <MessageSquare size={19} />, label: "Chat" },
    { key: "moves" as TabKey, icon: <ClipboardList size={19} />, label: "Moves / Notation" },
    { key: "leaderboard" as TabKey, icon: <Crown size={19} />, label: "Leaderboard" },
  ];
  const studentSidebarTabs = [
    { icon: <Home size={19} />, label: "Live Board", onClick: focusBoard, active: false },
    { key: "chat" as TabKey, icon: <MessageSquare size={19} />, label: "Chat" },
    { key: "leaderboard" as TabKey, icon: <Crown size={19} />, label: "Leaderboard" },
  ];
  const classroomTabs = coach ? coachSidebarTabs : studentPanelTabs;

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[640px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-brand/10">
      <div className="flex flex-none flex-col border-b border-slate-200 px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{classroomName}</h2>
          <p className="text-sm text-slate-500">
            Instructor: {coachName} - Topic: {live?.topic || "Not set"} - {duration} min
          </p>
        </div>
          {coach && <div className="mt-2 flex flex-wrap gap-2 lg:mt-0">
          {["teaching", "student_move", "one_move_challenge"].map((mode) => (
            <button
              key={mode}
              onClick={() => patch({ mode, studentMovesEnabled: mode !== "teaching" })}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold capitalize ${
                live?.mode === mode ? "border-purple-700 bg-purple-700 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {mode.replaceAll("_", " ")}
            </button>
          ))}
        </div>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
          <aside className={`flex max-h-full flex-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm transition-all duration-200 ${sidebarCollapsed ? "lg:w-[74px]" : "lg:w-[230px]"}`}>
            <div className={`flex items-center border-b border-slate-200 p-2 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
              {!sidebarCollapsed && <div className="px-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{coach ? "Classroom Tools" : "Classroom"}</div>}
              <button
                type="button"
                title={sidebarCollapsed ? "Expand classroom sidebar" : "Collapse classroom sidebar"}
                onClick={() => setSidebarCollapsed((value) => !value)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800"
              >
                {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-2">
              <div className="space-y-2">
                {(coach ? coachSidebarTabs : studentSidebarTabs).map((item: any) => (
                  <SidebarButton
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    active={item.key ? activeTab === item.key : item.active}
                    onClick={item.key ? () => setActiveTab(item.key) : item.onClick}
                  />
                ))}
              </div>
              {coach && (
                <>
                  <div className="border-t border-slate-200" />
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {!sidebarCollapsed && <div className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Teaching Tools</div>}
                      <ToolButton icon={<Library size={19} />} label="Load PGN" onClick={() => setPgnOpen(true)} disabled={!canLoadPgnLibrary} disabledLabel="No PGNs are available in the library yet" />
                      <ToggleButton active={setupOpen} icon={<Settings size={19} />} label="Setup Board" onClick={() => { setSetupPosition(boardPieceMap); setGamifiedSetup(liveGamifiedObjects); setSetupMovementMode(live?.illegalMovesEnabled ? "free" : live?.fen?.split(" ")?.[1] === "b" ? "black" : "white"); setSetupOpen(true); }} />
                      <ToggleButton active={!!live?.illegalMovesEnabled} icon={<ShieldAlert size={19} />} label="Free Movement" onClick={() => patch({ illegalMovesEnabled: !live?.illegalMovesEnabled })} />
                      <ToolButton id="highlight" icon={<Highlighter size={19} />} label="Highlight Square" />
                      <ToolButton id="arrow" icon={<Send size={19} />} label="Draw Arrow" />
                      <ToolButton icon={<Eraser size={19} />} label="Clear Drawings" onClick={() => patch({ drawings: [] })} />
                      <ToolButton icon={<FileQuestion size={19} />} label="Ask Challenge" onClick={askEveryone} />
                      <ToolButton icon={<Sparkles size={19} />} label="Start Quiz" onClick={createQuiz} disabled={!canLaunchBoardQuiz} disabledLabel="Load a PGN position first so the next move can be checked on the board" />
                    </div>

                    <div className="space-y-2">
                      {!sidebarCollapsed && <div className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Session</div>}
                      <ToggleButton active={!!live?.studentMovesEnabled} icon={<Users size={19} />} label={live?.studentMovesEnabled ? "Student Control On" : "Give Student Control"} onClick={() => patch({ studentMovesEnabled: !live?.studentMovesEnabled, mode: !live?.studentMovesEnabled ? "student_move" : "teaching" })} disabled={!students.length} disabledLabel="No students are in this classroom yet" />
                      <ToolButton icon={<X size={19} />} label="End Class" onClick={openEndSummary} emphasis="danger" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>

          <div ref={boardShellRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
            {studentQuizMode ? (
              <div className="mx-auto w-full max-w-[560px]">
                <LiveBoardQuiz
                  question={activeQuestion}
                  locked={Boolean(live?.locked)}
                  existingItemResults={myLiveResponse?.itemResults || {}}
                  progressionMode={activeQuestion?.progressionMode || "auto"}
                  serverIndex={Number(activeQuestion?.currentItemIndex || 0)}
                  onProgress={submitBoardQuizProgress}
                  onComplete={submitBoardQuizResults}
                  onSubmitted={() => setHiddenStudentQuizId(String(activeQuestion._id))}
                />
              </div>
            ) : coachQuizMode ? (
              <CoachQuizMonitor
                question={activeQuestion}
                responses={data?.responses || []}
                students={students}
                onUpdateProgression={updateQuizProgression}
                onEndQuiz={endLiveQuiz}
              />
            ) : (
              <>
                <div className="mx-auto w-full max-w-[720px] rounded-lg border border-slate-200 bg-[#f6f2ea] p-2 shadow-sm">
                  <div className="mx-auto grid w-fit grid-cols-[22px_auto_22px] grid-rows-[auto_22px] gap-x-2">
                    {live?.showCoordinates !== false && (
                      <div className="col-start-1 row-start-1 grid text-center text-xs font-semibold text-slate-500" style={{ height: boardWidth }}>
                        {ranks.map((rank) => <span key={`left-${rank}`} className="flex items-center justify-center">{rank}</span>)}
                      </div>
                    )}
                    <div className="relative col-start-2 row-start-1" style={{ width: boardWidth, height: boardWidth }}>
                      <Chessboard
                        id={`classroom-board-${classroomId}`}
                        position={boardPosition as any}
                        boardWidth={boardWidth}
                        boardOrientation={orientation}
                        onPieceDrop={onDrop}
                        onPieceDropOffBoard={onPieceDropOffBoard as any}
                        onSquareClick={onSquareClick as any}
                        onSquareRightClick={onSquareRightClick as any}
                        onArrowsChange={persistBoardArrows as any}
                        customArrows={arrows as any}
                        customSquareStyles={squareStyles as any}
                        areArrowsAllowed={coach}
                        arePiecesDraggable={!live?.locked && (coach || canMove)}
                        arePremovesAllowed={!!live?.illegalMovesEnabled}
                        dropOffBoardAction={live?.setupMode || tool === "setup" ? "trash" : "snapback"}
                        showBoardNotation={false}
                        customDarkSquareStyle={{ backgroundColor: "#b9875f" }}
                        customLightSquareStyle={{ backgroundColor: "#f1d9aa" }}
                        customBoardStyle={{ borderRadius: "4px", overflow: "hidden" }}
                      />
                      <GamifiedBoardOverlay objects={liveGamifiedObjects} boardWidth={boardWidth} orientation={orientation} />
                    </div>
                    {live?.showCoordinates !== false && (
                      <>
                        <div className="col-start-3 row-start-1 grid text-center text-xs font-semibold text-slate-500" style={{ height: boardWidth }}>
                          {ranks.map((rank) => <span key={`right-${rank}`} className="flex items-center justify-center">{rank}</span>)}
                        </div>
                        <div className="col-start-2 row-start-2 grid text-center text-xs font-semibold text-slate-500" style={{ gridTemplateColumns: `repeat(8, ${boardWidth / 8}px)` }}>
                          {files.map((file) => <span key={file}>{file}</span>)}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {false && coach && (live?.setupMode || tool === "setup") && (
              <div className="mx-auto mt-3 w-full max-w-[760px] rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">Setup Board</div>
                    <div className="text-xs text-slate-500">Choose a piece, click a square, drag freely, or drag pieces off the board to delete.</div>
                  </div>
                  <button
                    onClick={() => navigator.clipboard?.writeText(positionToFen(setupPosition, live?.fen?.split(" ")?.[1] || "w")).then(() => toast.success("FEN copied"))}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold"
                  >
                    <Download size={14} /> Export FEN
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["wK", "White King"], ["wQ", "White Queen"], ["wR", "White Rook"], ["wB", "White Bishop"], ["wN", "White Knight"], ["wP", "White Pawn"],
                    ["bK", "Black King"], ["bQ", "Black Queen"], ["bR", "Black Rook"], ["bB", "Black Bishop"], ["bN", "Black Knight"], ["bP", "Black Pawn"],
                  ].map(([piece, label]) => (
                    <button
                      key={piece}
                      onClick={() => setSelectedPiece(piece)}
                      title={label}
                      className={`h-10 rounded-md border px-3 text-sm font-semibold ${selectedPiece === piece ? "border-purple-700 bg-purple-700 text-white" : "border-slate-200 bg-white text-slate-800"}`}
                    >
                      {piece}
                    </button>
                  ))}
                  <button onClick={() => setSelectedPiece("erase")} className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${selectedPiece === "erase" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-800"}`}><X size={15} /> Remove</button>
                  <button onClick={() => { setSetupPosition({}); commitSetup({}); }} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><Eraser size={15} /> Clear</button>
                  <button onClick={() => { const start = fenToPosition("start"); setSetupPosition(start); commitSetup(start); }} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><RotateCcw size={15} /> Reset</button>
                  <button onClick={() => commitSetup()} className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-3 text-sm font-semibold text-white"><CheckSquare size={15} /> Save Position</button>
                </div>
              </div>
                )}

                {coach && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button onClick={() => patch({ locked: !live?.locked })} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${live?.locked ? "border-purple-200 bg-purple-50 text-purple-800" : "border-slate-200 bg-white text-slate-700"}`}>
                    {live?.locked ? "Unlock board" : "Lock board"}
                  </button>
                  <button onClick={() => patch({ showCoordinates: !live?.showCoordinates })} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${live?.showCoordinates !== false ? "border-purple-200 bg-purple-50 text-purple-800" : "border-slate-200 bg-white text-slate-700"}`}>
                    Coordinates
                  </button>
                  <button onClick={() => patch({ orientation: live?.orientation === "white" ? "black" : "white" })} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Flip
                  </button>
                  <button onClick={resetGame} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Reset
                  </button>
                  <button onClick={() => patch({ soundEnabled: !live?.soundEnabled })} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${live?.soundEnabled ? "border-purple-200 bg-purple-50 text-purple-800" : "border-slate-200 bg-white text-slate-700"}`}>
                    Sound
                  </button>
                  <button onClick={() => setActiveTab("moves")} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Moves
                  </button>
                  <button onClick={() => setActiveTab("leaderboard")} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Leaderboard
                  </button>
                </div>}

                {coach && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <button onClick={() => navigateMove(0)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><SkipBack size={16} /></button>
                  <button onClick={() => navigateMove(currentMoveIndex - 1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><ChevronLeft size={16} /></button>
                  <span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{currentMoveIndex} / {pgnMoves.length || (live?.moveHistory || []).length}</span>
                  <button onClick={() => navigateMove(currentMoveIndex + 1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><ChevronRight size={16} /></button>
                  <button onClick={() => navigateMove(pgnMoves.length)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700"><SkipForward size={16} /></button>
                  <button onClick={() => loadAdjacentPgn(-1)} className="ml-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold">Previous game</button>
                  <button onClick={() => loadAdjacentPgn(1)} className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white">Next game</button>
                </div>}

                {coach && (
                  <div className="mt-3">
                    <input
                      className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                      placeholder="Current topic, e.g. Queen-side attack"
                      defaultValue={live?.topic || ""}
                      onBlur={(event) => patch({ topic: event.target.value })}
                    />
                  </div>
                )}
              </>
            )}

            {activeQuestion && !studentQuizMode && !coachQuizMode && (
              <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-purple-950">{activeQuestion.title}</h3>
                    <p className="mt-1 text-sm text-purple-800">{activeQuestion.instructions}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-purple-700">{activeQuestion.type?.replaceAll("_", " ")}</span>
                    {coach ? <button onClick={endLiveQuiz} className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white">End Quiz</button> : null}
                  </div>
                </div>
                {!coach && hiddenStudentQuizId === String(activeQuestion._id) && questionUsesBoardFlow ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-sm text-emerald-800">
                    Your quiz answers have been submitted. You are back in the live classroom while the coach reviews responses.
                  </div>
                ) : !coach && !questionUsesBoardFlow && (
                  <div className="mt-3 flex gap-2">
                    <input value={moveAnswer} onChange={(event) => setMoveAnswer(event.target.value)} className="h-10 flex-1 rounded-md border px-3 text-sm" placeholder="Enter move, e.g. Nf3" />
                    <button onClick={submitResponse} className="rounded-md bg-purple-700 px-3 text-sm font-semibold text-white">Submit</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-t border-slate-200 xl:border-l xl:border-t-0">
          <div className={`grid border-b border-slate-200 text-sm ${coach ? "grid-cols-4" : "grid-cols-2"}`}>
            {classroomTabs.map(({ key, icon, label }: any) => (
              <button key={key} onClick={() => setActiveTab(key)} className={`flex h-11 items-center justify-center gap-1 border-b-2 text-xs font-semibold ${activeTab === key ? "border-purple-700 text-purple-800" : "border-transparent text-slate-500"}`} title={label}>
                {icon}
                <span className="hidden 2xl:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {activeTab === "students" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">Classroom Students</h3>
                  <p className="mt-1 text-sm text-slate-500">{activeStudents.length} students available for this session</p>
                </div>
                <div className="space-y-2">
                  {students.map((student: any) => {
                    const studentKey = entityId(student);
                    const hasControl = (live?.boardControlStudents || []).some((s: any) => entityId(s) === studentKey);
                    return (
                      <div key={student._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">{initials(student.name)}</div>
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{student.name}</div>
                            <div className="text-xs text-slate-500">{student.username || student.email}</div>
                          </div>
                        </div>
                        {coach && (
                          <button
                            onClick={() => {
                              const current = Array.from(new Set((live?.boardControlStudents || []).map((s: any) => entityId(s)).filter(Boolean)));
                              patch({
                                boardControlStudents: hasControl ? current.filter((id: any) => id !== studentKey) : [...current, studentKey],
                                studentMovesEnabled: true,
                                mode: "student_move",
                              });
                            }}
                            className={`rounded-md px-3 py-2 text-xs font-semibold ${hasControl ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-700"}`}
                          >
                            {hasControl ? "Control on" : "Give move"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {false && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">PGN Library</h3>
                  <p className="mt-1 text-sm text-slate-500">Load a file directly into the classroom board, then use previous and next game near the board.</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button onClick={() => setSelectedPgnIds(pgnLibrary.map((pgn: any) => pgn._id))} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold"><CheckSquare size={14} /> Select All</button>
                    <button onClick={() => setSelectedPgnIds([])} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold"><X size={14} /> Deselect</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={loadSelectedPgns} className="h-10 rounded-md bg-purple-700 text-sm font-semibold text-white">Load on Board</button>
                    <button onClick={askSelectedPgnAsQuiz} className="h-10 rounded-md border border-purple-200 bg-purple-50 text-sm font-semibold text-purple-800">Ask as Quiz</button>
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">Challenge Timer</label>
                  <input value={challengeTimer} onChange={(event) => setChallengeTimer(Number(event.target.value || 0))} type="number" min={10} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm" />
                  <div className="mt-3 max-h-48 space-y-2 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2">
                    {pgnLibrary.length ? pgnLibrary.map((pgn: any) => (
                      <label key={pgn._id} className="flex cursor-pointer items-start gap-2 rounded-md bg-white p-2 text-xs text-slate-700">
                        <input checked={selectedPgnIds.includes(pgn._id)} onChange={() => togglePgnSelection(pgn._id)} type="checkbox" className="mt-0.5 h-4 w-4" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-950">{pgn.title}</span>
                          <span className="block truncate text-slate-500">{pgn.folder || "Library"} - {pgn.white || "White"} vs {pgn.black || "Black"}</span>
                        </span>
                      </label>
                    )) : <div className="p-3 text-center text-xs text-slate-500">No PGNs available.</div>}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">Load PGN or FEN</label>
                  <textarea
                    value={manualLoadText}
                    onChange={(event) => setManualLoadText(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Paste a PGN or FEN here"
                  />
                  <button onClick={loadManualPosition} className="mt-2 h-10 w-full rounded-md bg-purple-700 text-sm font-semibold text-white">Load on board</button>
                </div>
                <div className="space-y-2">
                  {pgnLibrary.length ? pgnLibrary.map((pgn: any, index: number) => (
                    <button key={pgn._id} onClick={() => loadPgn(pgn, index)} className={`w-full rounded-lg border p-3 text-left transition hover:border-purple-300 hover:bg-purple-50 ${live?.pgnTitle === pgn.title ? "border-purple-300 bg-purple-50" : "border-slate-200"}`}>
                      <div className="text-sm font-semibold text-slate-950">{pgn.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{pgn.folder || "Library"} · {pgn.white || "White"} vs {pgn.black || "Black"} {pgn.result ? `· ${pgn.result}` : ""}</div>
                    </button>
                  )) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No PGNs available yet.</div>}
                </div>
              </div>
            )}

            {activeTab === "chat" && (
              <div className="flex min-h-full flex-col">
                <div className="flex-1 space-y-2">
                  {chatMessages.length ? chatMessages.map((message: any) => (
                    <div key={message._id} className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">{message.sender?.name || message.sender?.username || "User"}</div>
                      <div className="mt-1 text-sm text-slate-800">{message.message}</div>
                    </div>
                  )) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No classroom messages yet.</div>}
                </div>
                <div className="mt-4 flex gap-2">
                  <input value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendChat()} className="h-11 flex-1 rounded-md border border-slate-200 px-3 text-sm" placeholder="Send a classroom message" />
                  <button onClick={sendChat} className="grid h-11 w-11 place-items-center rounded-md bg-purple-700 text-white"><Send size={17} /></button>
                </div>
              </div>
            )}

            {coach && activeTab === "moves" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-950">Notation</h3>
                    {coach && <button onClick={() => patch({ engineEnabled: !live?.engineEnabled })} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${live?.engineEnabled ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-600"}`}><Bot size={15} /> Stockfish</button>}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{live?.pgnTitle || "Current classroom game"}</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
                  <div className="grid grid-cols-[48px_1fr_1fr] bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-500">
                    <span>No.</span><span>White</span><span>Black</span>
                  </div>
                  {(pgnMoves.length ? pgnMoves : live?.moveHistory || []).length ? Array.from({ length: Math.ceil((pgnMoves.length ? pgnMoves : live?.moveHistory || []).length / 2) }).map((_, row) => {
                    const moves = pgnMoves.length ? pgnMoves : live?.moveHistory || [];
                    const whiteIndex = row * 2;
                    const blackIndex = whiteIndex + 1;
                    const whiteMove = moves[whiteIndex];
                    const blackMove = moves[blackIndex];
                    return (
                      <div key={row} className="grid grid-cols-[48px_1fr_1fr] items-center border-t border-slate-100 px-2 py-1">
                        <span className="text-xs font-semibold text-slate-400">{row + 1}.</span>
                        <button
                          disabled={!pgnMoves.length}
                          onClick={() => navigateMove(whiteIndex + 1)}
                          className={`min-h-9 rounded-md px-2 text-left font-medium ${currentMoveIndex === whiteIndex + 1 ? "bg-purple-700 text-white" : "text-slate-800 hover:bg-slate-50 disabled:hover:bg-transparent"}`}
                        >
                          {whiteMove || ""}
                        </button>
                        <button
                          disabled={!pgnMoves.length || !blackMove}
                          onClick={() => navigateMove(blackIndex + 1)}
                          className={`min-h-9 rounded-md px-2 text-left font-medium ${currentMoveIndex === blackIndex + 1 ? "bg-purple-700 text-white" : "text-slate-800 hover:bg-slate-50 disabled:hover:bg-transparent"}`}
                        >
                          {blackMove || ""}
                        </button>
                      </div>
                    );
                  }) : <div className="p-6 text-center text-sm text-slate-500">No moves loaded yet.</div>}
                </div>
                {coach && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-950"><Bot size={16} /> Engine</div>
                  <p className="break-words text-xs text-slate-600">{live?.engineEnabled ? engineText : "Engine disabled"}</p>
                </div>}
              </div>
            )}

            {activeTab === "leaderboard" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">Live Leaderboard</h3>
                  <p className="mt-1 text-sm text-slate-500">Quiz and Ask Everyone results update here.</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[60px_1fr_86px_88px] border-b bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
                    <span>Rank</span><span>Student</span><span>Points</span><span>Done</span>
                  </div>
                  {leaderboardRows.length ? leaderboardRows.map((row: any, index: number) => (
                    <div key={row._id} className="grid grid-cols-[60px_1fr_86px_88px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <span className="font-semibold text-slate-500">#{index + 1}</span>
                      <span className="font-semibold text-slate-950">{row.name}<span className="block text-xs font-normal text-slate-500">{row.move || "No response yet"}</span></span>
                      <span>{row.points}</span>
                      <span>{row.completed ? "Yes" : "No"}</span>
                    </div>
                  )) : <div className="p-8 text-center text-sm text-slate-500">No quiz responses yet.</div>}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{classroomName}</h3>
                <p className="text-sm text-slate-500">Instructor: {coachName}</p>
              </div>
              <button onClick={() => void load(true)} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-700 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800" title="Refresh classroom panel">
                <RefreshCcw size={17} />
              </button>
            </div>
            {coach && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPgnOpen(true)} className="h-11 rounded-md bg-purple-700 text-sm font-semibold text-white">Load PGNs</button>
                <button onClick={openEndSummary} className="h-11 rounded-md bg-red-500 text-sm font-semibold text-white">End Classroom</button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {pgnOpen && coach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">Classroom PGN Library</h3>
                <p className="text-sm text-slate-500">Load a PGN onto the classroom board or turn a selected PGN into a quiz.</p>
              </div>
              <button onClick={() => setPgnOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200"><X size={16} /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-h-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={pgnFolderQuery}
                      onChange={(event) => setPgnFolderQuery(event.target.value)}
                      className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm"
                      placeholder={activePgnFolder ? "Search PGNs in folder" : "Search folders or files"}
                    />
                  </div>
                  <button onClick={() => setSelectedPgnIds(visiblePgnLibrary.map((pgn: any) => pgn._id))} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold"><CheckSquare size={14} /> Select All</button>
                  <button onClick={() => setSelectedPgnIds([])} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold"><X size={14} /> Clear Selection</button>
                  <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800">{selectedPgnIds.length} selected</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <button onClick={() => setActivePgnFolder(null)} className={`inline-flex items-center gap-1 ${activePgnFolder ? "text-blue-600" : "font-semibold text-slate-900"}`}><Home size={14} /> Library</button>
                  {activePgnFolder && folderBreadcrumbs(activePgnFolder).map((item) => (
                    <span key={item.path} className="contents">
                      <ChevronRight size={14} className="text-slate-400" />
                      <button onClick={() => setActivePgnFolder(item.path)} className={`font-semibold ${item.path === activePgnFolder ? "text-slate-900" : "text-blue-600"}`}>{item.name}</button>
                    </span>
                  ))}
                </div>
                {activePgnFolder === null ? (
                  <div className="grid max-h-[56vh] gap-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2 md:grid-cols-2">
                    {pgnFolders.length ? pgnFolders.map((folder) => (
                      <button key={folder.path} onClick={() => setActivePgnFolder(folder.path)} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-purple-300 hover:shadow-sm">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700"><Folder size={18} /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-950">{folder.name}</span>
                            <span className="block text-xs text-slate-500">{folder.count} PGN{folder.count === 1 ? "" : "s"}</span>
                          </span>
                        </span>
                        <ChevronRight size={16} className="text-slate-400" />
                      </button>
                    )) : <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 md:col-span-2">No folders found in the PGN library yet.</div>}
                    {pgnLibrary.some((pgn: any) => !String(pgn.folder || "").trim()) && (
                      <button onClick={() => setActivePgnFolder("__unfiled__")} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-purple-300 hover:shadow-sm md:col-span-2">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Library size={18} /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-950">Unfiled PGNs</span>
                            <span className="block text-xs text-slate-500">{pgnLibrary.filter((pgn: any) => !String(pgn.folder || "").trim()).length} PGNs</span>
                          </span>
                        </span>
                        <ChevronRight size={16} className="text-slate-400" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid max-h-[56vh] gap-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2 md:grid-cols-2">
                  {pgnFolders.map((folder) => (
                    <button key={folder.path} onClick={() => setActivePgnFolder(folder.path)} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-purple-300 hover:shadow-sm">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700"><Folder size={18} /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-950">{folder.name}</span>
                          <span className="block text-xs text-slate-500">{folder.count} PGN{folder.count === 1 ? "" : "s"}</span>
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </button>
                  ))}
                  {visiblePgnLibrary.length ? visiblePgnLibrary.map((pgn: any, index: number) => (
                    <div key={pgn._id} className={`rounded-lg border bg-white p-3 transition ${selectedPgnIds.includes(pgn._id) ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-200"}`}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input checked={selectedPgnIds.includes(pgn._id)} onChange={() => togglePgnSelection(pgn._id)} type="checkbox" className="mt-1 h-4 w-4" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-950">{pgn.title}</span>
                          <span className="block truncate text-xs text-slate-500">{pgn.white || "White"} vs {pgn.black || "Black"}{pgn.result ? ` - ${pgn.result}` : ""}</span>
                        </span>
                      </label>
                      <button onClick={() => loadPgn(pgn, index)} className="mt-3 h-9 w-full rounded-md bg-purple-700 text-xs font-semibold text-white">Load this PGN</button>
                    </div>
                  )) : pgnFolders.length ? null : <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 md:col-span-2">No PGNs found in this folder.</div>}
                </div>)}
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">Challenge Timer</label>
                  <input value={challengeTimer} onChange={(event) => setChallengeTimer(Number(event.target.value || 0))} type="number" min={10} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm" />
                  <div className="mt-3 grid gap-2">
                    <button onClick={loadSelectedPgns} className="h-10 rounded-md bg-purple-700 text-sm font-semibold text-white">Load Selected</button>
                    <button onClick={askSelectedPgnAsQuiz} className="h-10 rounded-md border border-purple-200 bg-white text-sm font-semibold text-purple-800">Ask Selected as Quiz</button>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">Paste PGN or FEN</label>
                  <textarea
                    value={manualLoadText}
                    onChange={(event) => setManualLoadText(event.target.value)}
                    className="mt-2 min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Paste a PGN or FEN here"
                  />
                  <button onClick={loadManualPosition} className="mt-2 h-10 w-full rounded-md bg-slate-950 text-sm font-semibold text-white">Load pasted position</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {setupOpen && coach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">Customize Position</h3>
                <p className="text-sm text-slate-500">Chess pieces and gamified objects are separate layers.</p>
              </div>
              <button onClick={() => setSetupOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200"><X size={16} /></button>
            </div>
            <div className="grid max-h-[calc(88vh-92px)] gap-4 overflow-hidden lg:grid-cols-[370px_minmax(0,1fr)]">
              <div>
                <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
                  <button onClick={() => setSetupTab("pieces")} className={`rounded-lg px-5 py-2 text-sm font-semibold ${setupTab === "pieces" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Chess Pieces</button>
                  <button onClick={() => setSetupTab("objects")} className={`rounded-lg px-5 py-2 text-sm font-semibold ${setupTab === "objects" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Gamified Objects</button>
                </div>
                {setupTab === "pieces" && <div className="mb-2 grid grid-cols-7 gap-1.5">
                  {["wP", "wN", "wB", "wR", "wQ", "wK"].map((piece) => (
                    <button key={piece} onClick={() => setSelectedPiece(piece)} className={`h-9 rounded-md border text-xl ${selectedPiece === piece ? "border-purple-700 bg-purple-700 text-white" : "border-slate-200 bg-white"}`}>{pieceSymbol(piece)}</button>
                  ))}
                  <button onClick={() => setSelectedPiece("erase")} className={`h-9 rounded-md border text-xs font-bold ${selectedPiece === "erase" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 bg-white"}`}>Del</button>
                </div>}
                <div className="relative mx-auto w-fit overflow-hidden rounded-lg border border-slate-200 bg-[#f6f2ea] p-2">
                <Chessboard
                  id={`setup-board-${classroomId}`}
                  position={setupPosition as any}
                  boardWidth={setupBoardSize}
                  boardOrientation={orientation}
                  onPieceDrop={onSetupDrop}
                  onPieceDropOffBoard={onSetupDropOffBoard as any}
                  onSquareClick={onSetupSquareClick as any}
                  showBoardNotation
                  dropOffBoardAction="trash"
                  arePiecesDraggable={setupTab === "pieces"}
                  customDarkSquareStyle={{ backgroundColor: "#b9875f" }}
                  customLightSquareStyle={{ backgroundColor: "#f1d9aa" }}
                />
                <GamifiedSetupOverlay
                  objects={gamifiedSetup}
                  selected={selectedObject}
                  boardWidth={setupBoardSize}
                  orientation={orientation}
                  enabled={setupTab === "objects"}
                  onPlace={moveGamifiedObject}
                  onDelete={deleteGamifiedObject}
                  onDragStart={setDraggedObjectSquare}
                  onDragEnd={() => setDraggedObjectSquare(null)}
                />
                </div>
                {setupTab === "pieces" && <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {["bP", "bN", "bB", "bR", "bQ", "bK"].map((piece) => (
                    <button key={piece} onClick={() => setSelectedPiece(piece)} className={`h-9 rounded-md border bg-slate-950 text-xl text-white ${selectedPiece === piece ? "ring-2 ring-purple-500" : "border-slate-800"}`}>{pieceSymbol(piece)}</button>
                  ))}
                  <button onClick={() => setSelectedPiece("erase")} className={`h-9 rounded-md border text-xs font-bold ${selectedPiece === "erase" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 bg-white"}`}>Del</button>
                </div>}
                <button onClick={setupTab === "objects" ? () => setSelectedObject("delete") : () => setSelectedPiece("erase")} className={`mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold ${setupTab === "objects" && selectedObject === "delete" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-300 text-slate-600"}`}>
                  <Trash2 size={17} /> Delete {setupTab === "objects" ? "objects" : "pieces"}
                </button>
              </div>

              <div className="min-h-0 space-y-3 overflow-auto pr-1">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-950">Who can move?</div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["white", "White"],
                      ["black", "Black"],
                      ["free", "Free move"],
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSetupMovementMode(mode as SetupMovementMode)}
                        className={`h-10 rounded-lg border px-2 text-sm font-semibold transition ${setupMovementMode === mode ? "border-purple-700 bg-purple-700 text-white shadow-md shadow-purple-700/20" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-purple-300"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    White/Black saves whose turn it is. Free move lets the coach move pieces freely for teaching.
                  </p>
                </div>
                {setupTab === "objects" ? (
                  <div>
                    <div className="mb-3 text-sm font-semibold text-slate-950">Gamified Objects</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {gamifiedObjects.map((object) => (
                        <button key={object.id} onClick={() => setSelectedObject(object.id)} className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition ${selectedObject === object.id ? "border-purple-700 bg-purple-50 text-purple-900 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-300"}`}>
                          <span className="text-2xl">{object.icon}</span>
                          <span className="mt-1 text-xs font-bold">{object.label}</span>
                          <span className="text-xs text-slate-500">{object.points > 0 ? "+" : ""}{object.points} points</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="font-semibold text-slate-950">Object behavior</div>
                      <div className="mt-2 grid gap-2 text-sm text-slate-600">
                        <div>Name: {selectedObject === "delete" ? "Delete objects" : getGamifiedObject(selectedObject).label}</div>
                        <div>Value: {selectedObject === "delete" ? "Removes object" : `${getGamifiedObject(selectedObject).points} points`}</div>
                        <div>On capture: Disappear</div>
                        <div>Animation: Points popup</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-950">Chess layer</div>
                    <p className="mt-1 text-sm text-slate-500">Use real chess pieces here. These become FEN and continue to follow normal chess rules.</p>
                  </div>
                )}
                {setupTab === "pieces" && <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">Paste PGN or FEN</label>
                  <textarea
                    value={setupLoadText}
                    onChange={(event) => setSetupLoadText(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Paste a PGN or FEN to load into this setup board"
                  />
                  <button onClick={loadSetupText} className="mt-2 h-10 w-full rounded-md border border-purple-200 bg-purple-50 text-sm font-semibold text-purple-800">Load into Setup Board</button>
                </div>}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setSelectedPiece("erase")} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${selectedPiece === "erase" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-800"}`}><X size={15} /> Remove</button>
                  <button onClick={() => { setSetupPosition({}); setGamifiedSetup({}); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><Eraser size={15} /> Clear</button>
                  <button onClick={() => { setSetupPosition(fenToPosition("start")); setGamifiedSetup({}); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><RotateCcw size={15} /> Reset</button>
                  <button onClick={() => navigator.clipboard?.writeText(positionToFen(setupPosition, live?.fen?.split(" ")?.[1] || "w")).then(() => toast.success("FEN copied"))} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><Download size={15} /> Export</button>
                </div>
                <button onClick={loadSetupIntoClassroom} className="h-11 w-full rounded-md bg-purple-700 text-sm font-semibold text-white">Load Position into Classroom</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {summaryOpen && coach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">Class Summary</h3>
                <p className="text-sm text-slate-500">Review the session and confirm attendance before finalizing.</p>
              </div>
              <button onClick={() => setSummaryOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200"><X size={16} /></button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <SummaryCard label="Duration" value={`${classSummary.durationMinutes} min`} icon={<Clock size={16} />} />
              <SummaryCard label="Present" value={classSummary.present} icon={<UserCheck size={16} />} />
              <SummaryCard label="Late" value={classSummary.late} icon={<Clock size={16} />} />
              <SummaryCard label="Absent" value={classSummary.absent} icon={<Users size={16} />} />
              <SummaryCard label="Questions" value={classSummary.questions} icon={<FileQuestion size={16} />} />
              <SummaryCard label="Avg Score" value={classSummary.averageScore} icon={<Trophy size={16} />} />
              <SummaryCard label="Points Earned" value={classSummary.totalPoints} icon={<Crown size={16} />} />
              <SummaryCard label="Ended At" value={new Date(classSummary.endedAt).toLocaleTimeString()} icon={<Clock size={16} />} />
            </div>
            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1.4fr_90px_100px_100px_90px_150px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                <span>Student</span><span>Time</span><span>Submits</span><span>Accuracy</span><span>Points</span><span>Attendance</span>
              </div>
              {classSummary.rows.map((row: any) => (
                <div key={row.student._id} className="grid grid-cols-[1.4fr_90px_100px_100px_90px_150px] items-center border-t border-slate-100 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-950">{row.student.name}</span>
                  <span>{row.timeMinutes} min</span>
                  <span>{row.submissions}</span>
                  <span>{row.accuracy}%</span>
                  <span>{row.points}</span>
                  <select
                    value={attendanceDraft[row.student._id] || row.suggestedStatus}
                    onChange={(event) => setAttendanceDraft((current) => ({ ...current, [row.student._id]: event.target.value as "present" | "absent" | "late" }))}
                    className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSummaryOpen(false)} className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold">Review Later</button>
              <button onClick={saveAttendanceAndClose} className="h-10 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">Save Attendance and Finalize</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveBoardQuiz({
  question,
  locked,
  existingItemResults,
  progressionMode,
  serverIndex,
  onProgress,
  onComplete,
  onSubmitted,
}: {
  question: any;
  locked: boolean;
  existingItemResults?: Record<string, LiveBoardQuizResult>;
  progressionMode?: "auto" | "manual";
  serverIndex?: number;
  onProgress?: (results: Record<string, LiveBoardQuizResult>, timeTakenSeconds: number) => void;
  onComplete: (results: Record<string, LiveBoardQuizResult>, timeTakenSeconds: number) => void;
  onSubmitted?: () => void;
}) {
  const items = Array.isArray(question.items) && question.items.length
    ? question.items
    : [{
        id: `${question._id}-single`,
        title: question.title,
        fen: question.fen,
        pgn: question.pgn,
        solution: question.solution || [],
        points: question.scoring?.correct ?? 5,
        timerSeconds: question.timer?.perQuestionSeconds || question.timer?.overallSeconds || 0,
      }];
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, Number(serverIndex || 0)));
  const [results, setResults] = useState<Record<string, LiveBoardQuizResult>>(existingItemResults || {});
  const [quizStartedAt] = useState(Date.now());
  const [itemStartedAt, setItemStartedAt] = useState(Date.now());
  const [remaining, setRemaining] = useState(Number(question.timer?.perQuestionSeconds || items[0]?.timerSeconds || 0));
  const submittedRef = useRef(false);

  const activeItem = items[currentIndex];
  const parsed = useMemo(() => {
    if (activeItem?.pgn) {
      return parsePgnPuzzle(activeItem.pgn);
    }
    const solution = Array.isArray(activeItem?.solution) ? activeItem.solution : [];
    return {
      start: activeItem?.fen || question.fen || "start",
      moves: solution.map((san: string) => ({ san, from: "", to: "", promotion: "q" })),
      valid: true,
    };
  }, [activeItem?.fen, activeItem?.pgn, activeItem?.solution, question.fen]);
  const [game, setGame] = useState(() => (parsed.start === "start" ? new Chess() : new Chess(parsed.start)));
  const [position, setPosition] = useState(parsed.start);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [solved, setSolved] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [feedback, setFeedback] = useState("Make the best move on the board.");
  const [lastStudentMove, setLastStudentMove] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const advancedRef = useRef(false);
  const summary = useMemo(() => {
    const solvedCount = items.filter((item: any) => results[item.id]?.solved).length;
    const skippedCount = items.filter((item: any) => results[item.id]?.skipped).length;
    const completedCount = solvedCount + skippedCount;
    const remainingCount = Math.max(0, items.length - completedCount);
    const pointsEarned = items.reduce((sum: number, item: any) => {
      const result = results[item.id];
      if (!result?.solved) return sum;
      const base = Number(item.points ?? question.scoring?.correct ?? 5);
      return sum + Math.max(0, base - Number(result.mistakes || 0) - Number(result.hintsUsed || 0) * 0.5);
    }, 0);
    const accuracy = items.length ? Math.round((solvedCount / items.length) * 100) : 0;
    const timeTakenSeconds = Math.round((Date.now() - quizStartedAt) / 1000);
    return { solvedCount, skippedCount, completedCount, remainingCount, pointsEarned, accuracy, timeTakenSeconds };
  }, [items, question.scoring?.correct, quizStartedAt, results]);

  function answeredCount(nextResults: Record<string, LiveBoardQuizResult>) {
    return items.filter((item: any) => Boolean(nextResults[item.id])).length;
  }

  function nextReviewIndex(nextResults: Record<string, LiveBoardQuizResult>, fromIndex: number) {
    for (let index = fromIndex + 1; index < items.length; index++) {
      if (!nextResults[items[index].id]) return index;
    }
    for (let index = 0; index < items.length; index++) {
      if (!nextResults[items[index].id]) return index;
    }
    return Math.min(items.length - 1, fromIndex);
  }

  useEffect(() => {
    submittedRef.current = false;
    setCurrentIndex(Math.max(0, Number(serverIndex || 0)));
    setResults(existingItemResults || {});
    setQuizFinished(false);
    setQuizSubmitted(false);
  }, [question._id]);

  useEffect(() => {
    setResults(existingItemResults || {});
  }, [existingItemResults]);

  useEffect(() => {
    if (progressionMode === "manual") return;
    if (!existingItemResults) return;
    const solvedCount = items.filter((item: any) => existingItemResults[item.id]?.solved || existingItemResults[item.id]?.skipped).length;
    if (!solvedCount) return;
    if (solvedCount >= items.length) {
      setQuizFinished(true);
      return;
    }
    setCurrentIndex((value) => {
      const nextValue = Math.max(value, Math.min(items.length - 1, solvedCount));
      return nextValue;
    });
  }, [existingItemResults, items, progressionMode]);

  useEffect(() => {
    if (progressionMode !== "manual") return;
    setCurrentIndex((value) => {
      const nextValue = Math.max(0, Math.min(items.length - 1, Number(serverIndex || 0)));
      return value === nextValue ? value : nextValue;
    });
  }, [items.length, progressionMode, serverIndex]);

  useEffect(() => {
    const next = parsed.start === "start" ? new Chess() : new Chess(parsed.start);
    setGame(next);
    setPosition(parsed.start);
    setPly(0);
    setMistakes(0);
    setHintsUsed(0);
    setSolved(false);
    setFeedback(parsed.moves.length === 0 ? "No moves found in this PGN." : quizFinished ? "Review this position and update your answer if needed." : "Make your move on the board.");
    setLastStudentMove("");
    setItemStartedAt(Date.now());
    setRemaining(Number(question.timer?.perQuestionSeconds || activeItem?.timerSeconds || 0));
    setSelectedSquare(null);
    advancedRef.current = false;
  }, [activeItem?.id, parsed.start, parsed.moves.length, question.timer?.perQuestionSeconds, activeItem?.timerSeconds, quizFinished]);

  useEffect(() => {
    if (!remaining || solved) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          if (!submittedRef.current) {
            queueMicrotask(() => skipCurrent());
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining, solved]);

  useEffect(() => {
    if (!solved || advancedRef.current || !activeItem) return;
    const result = { solved: true, mistakes, hintsUsed, timeTakenSeconds: Math.round((Date.now() - itemStartedAt) / 1000), submittedMove: lastStudentMove || parsed.moves[0]?.san || "" };
    const nextResults = { ...results, [activeItem.id]: result };
    setResults(nextResults);
    advancedRef.current = true;
    onProgress?.(nextResults, Math.round((Date.now() - quizStartedAt) / 1000));
    if (answeredCount(nextResults) >= items.length) {
      setQuizFinished(true);
      setFeedback("All positions answered. Review your board choices and submit when ready.");
      return;
    }
    if (quizFinished) {
      setFeedback("Answer updated. Review the remaining positions or submit when ready.");
      return;
    }
    if (progressionMode === "manual") {
      setFeedback("Answer recorded. Waiting for the coach to open the next position.");
      return;
    }
    window.setTimeout(() => moveNext(nextResults), 650);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  function moveNext(nextResults: Record<string, LiveBoardQuizResult>) {
    setCurrentIndex(nextReviewIndex(nextResults, currentIndex));
  }

  function applyAutoReply(nextGame: Chess, nextPly: number) {
    if (nextPly >= parsed.moves.length) {
      setSolved(true);
      return nextPly;
    }
    const reply = parsed.moves[nextPly];
    const move = reply.from && reply.to
      ? nextGame.move({ from: reply.from, to: reply.to, promotion: reply.promotion || "q" })
      : nextGame.move(reply.san);
    if (!move) return nextPly;
    const updatedPly = nextPly + 1;
    if (updatedPly >= parsed.moves.length) setSolved(true);
    return updatedPly;
  }

  function onDrop(source: string, target: string) {
    if (locked || quizSubmitted || ply >= parsed.moves.length) return false;
    const expected = parsed.moves[ply];
    const nextGame = new Chess(game.fen());
    const move = nextGame.move({ from: source, to: target, promotion: "q" });
    if (!move) return false;
    const expectedPromotion = expected.promotion && expected.promotion !== "q" ? expected.promotion : move.promotion || "q";
    const matchesExpectedSquares = expected.from && expected.to
      ? expected.from === source && expected.to === target && (!expected.promotion || expectedPromotion === (move.promotion || "q"))
      : false;
    const matchesExpectedSan = move.san === expected.san;
    if (!matchesExpectedSquares && !matchesExpectedSan) {
      setMistakes((value) => value + 1);
      setFeedback("Move not accepted. Try another continuation.");
      return false;
    }
    setLastStudentMove(move.san);
    let nextPly = ply + 1;
    nextPly = applyAutoReply(nextGame, nextPly);
    setGame(nextGame);
    setPosition(nextGame.fen());
    setPly(nextPly);
    setSelectedSquare(null);
    setFeedback(nextPly >= parsed.moves.length ? "Answer recorded for this position." : "Move recorded. Continue from the new position.");
    return true;
  }

  const moveTargets = useMemo(() => {
    if (!selectedSquare || locked || quizSubmitted) return [];
    return legalTargetsFromGame(game, selectedSquare);
  }, [selectedSquare, locked, quizSubmitted, game]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedSquare), [moveTargets, selectedSquare]);

  function onSquareClick(square: string) {
    if (locked || quizSubmitted) return;
    const clickedPiece = game.get(square as any);
    if (selectedSquare && selectedSquare !== square) {
      const moved = onDrop(selectedSquare, square);
      if (moved) return;
    }
    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }
    if (clickedPiece && clickedPiece.color === game.turn()) {
      setSelectedSquare(square);
      return;
    }
    setSelectedSquare(null);
  }

  function hint() {
    if (locked || solved || ply >= parsed.moves.length) return;
    setHintsUsed((value) => value + 1);
    setFeedback(`Hint: try ${parsed.moves[ply].san}`);
  }

  function reset() {
    const next = parsed.start === "start" ? new Chess() : new Chess(parsed.start);
    setGame(next);
    setPosition(parsed.start);
    setPly(0);
    setMistakes(0);
    setHintsUsed(0);
    setSolved(false);
    setFeedback("Make your move on the board.");
    setLastStudentMove("");
    setItemStartedAt(Date.now());
    setRemaining(Number(question.timer?.perQuestionSeconds || activeItem?.timerSeconds || 0));
  }

  function skipCurrent() {
    if (!activeItem) return;
    const result = { solved: false, skipped: true, mistakes, hintsUsed, timeTakenSeconds: Math.round((Date.now() - itemStartedAt) / 1000), submittedMove: lastStudentMove };
    const nextResults = { ...results, [activeItem.id]: result };
    setResults(nextResults);
    onProgress?.(nextResults, Math.round((Date.now() - quizStartedAt) / 1000));
    if (answeredCount(nextResults) >= items.length) {
      setQuizFinished(true);
      setFeedback("All positions answered. Review your board choices and submit when ready.");
      return;
    }
    if (quizFinished) {
      setFeedback("Position marked for review. You can still revisit it before submitting.");
      return;
    }
    if (progressionMode === "manual") {
      setFeedback("Position skipped. Waiting for the coach to open the next position.");
      return;
    }
    setCurrentIndex(nextReviewIndex(nextResults, currentIndex));
  }

  function submitQuiz() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setQuizSubmitted(true);
    setFeedback("Quiz submitted successfully. Waiting for the coach.");
    onComplete(results, Math.round((Date.now() - quizStartedAt) / 1000));
    onSubmitted?.();
  }

  if (!activeItem) return null;

  if (quizSubmitted) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-brand/10">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Quiz Submitted</div>
          <h3 className="mt-1 text-2xl font-black text-emerald-950">Waiting for coach review</h3>
          <p className="mt-2 text-sm text-emerald-800">Your answers are locked and have been saved for the classroom.</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SummaryCard label="Positions Attempted" value={`${summary.completedCount}/${items.length}`} icon={<CheckSquare size={16} />} />
          <SummaryCard label="Time Taken" value={`${summary.timeTakenSeconds}s`} icon={<Clock size={16} />} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <div className="text-sm font-bold text-slate-700">Position {Math.min(currentIndex + 1, items.length)} of {items.length}</div>
          <div className="text-xs font-semibold text-slate-500">{activeItem.title || activeItem.pgnTitle || `Board ${currentIndex + 1}`}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800"><Clock size={12} className="mr-1 inline" /> {remaining ? `${remaining}s left` : "No timer"}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${quizFinished ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}>{quizFinished ? "Ready to submit" : "Not submitted"}</span>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Questions Completed" value={`${summary.completedCount}/${items.length}`} icon={<CheckSquare size={16} />} />
        <SummaryCard label="Questions Remaining" value={summary.remainingCount} icon={<HourglassIcon />} />
        <SummaryCard label="Current Status" value={quizFinished ? "Review answers" : results[activeItem.id] ? "Answered" : "In progress"} icon={<ClipboardList size={16} />} />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Quiz Progress</div>
        <div className="flex flex-wrap gap-2">
          {items.map((item: any, index: number) => {
            const itemResult = results[item.id];
            const stateLabel = itemResult?.skipped ? "Skipped" : itemResult ? "Answered" : "Unanswered";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                  currentIndex === index
                    ? "border-purple-600 bg-purple-700 text-white"
                    : itemResult
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                P{index + 1} · {stateLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-[#31210f] p-3 shadow-inner">
        <Chessboard
          position={position}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick as any}
          boardWidth={420}
          customSquareStyles={moveHintStyles as any}
          customDarkSquareStyle={{ backgroundColor: "#b58863" }}
          customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
        />
      </div>

      <div className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${feedback.startsWith("Try") ? "bg-red-50 text-red-700" : feedback.startsWith("Hint") ? "bg-amber-50 text-amber-700" : solved ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}`}>
        {feedback}
      </div>

      {quizFinished ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Quiz Completed</div>
          <p className="mt-2 text-sm text-slate-600">You have completed all positions. Review your answers and submit when ready.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoTile label="Positions Answered" value={`${summary.completedCount}/${items.length}`} />
            <InfoTile label="Time Taken" value={`${summary.timeTakenSeconds}s`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white" onClick={submitQuiz}>Submit Quiz</button>
          </div>
        </div>
      ) : (
      <div className="mt-3 flex flex-wrap gap-2">
        {question.hintsEnabled && <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={hint}><HelpCircle size={14} className="mr-1 inline" /> Hint</button>}
        <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" onClick={reset}><RotateCcw size={14} className="mr-1 inline" /> Reset</button>
        <button type="button" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700" onClick={skipCurrent}>Skip</button>
      </div>)}
    </div>
  );
}

function CoachQuizMonitor({
  question,
  responses,
  students,
  onUpdateProgression,
  onEndQuiz,
}: {
  question: any;
  responses: any[];
  students: any[];
  onUpdateProgression: (update: { currentItemIndex?: number; progressionMode?: "auto" | "manual" }) => void;
  onEndQuiz: () => void;
}) {
  const items = Array.isArray(question?.items) && question.items.length
    ? question.items
    : [{
        id: `${question?._id || "quiz"}-single`,
        title: question?.title || "Live quiz",
        fen: question?.fen || "start",
        points: question?.scoring?.correct ?? 5,
      }];
  const manualProgression = question?.progressionMode === "manual";
  const responseGroups = new Map<string, any[]>();
  for (const response of responses || []) {
    const studentId = response.student?._id || response.student;
    if (!studentId) continue;
    responseGroups.set(studentId, [...(responseGroups.get(studentId) || []), response]);
  }

  const autoSuggestedIndex = (() => {
    if (!items.length) return 0;
    const frequencies = new Map<number, number>();
    for (const student of students || []) {
      const studentResponses = responseGroups.get(student._id) || [];
      const solvedCount = studentResponses.reduce((sum, response) => {
        const itemResults = Object.values(response?.itemResults || {}) as any[];
        return sum + itemResults.filter((result: any) => result?.solved || result?.skipped).length;
      }, 0);
      const index = Math.min(items.length - 1, Math.max(0, solvedCount));
      frequencies.set(index, (frequencies.get(index) || 0) + 1);
    }
    if (!frequencies.size) return Math.max(0, Number(question?.currentItemIndex || 0));
    return Array.from(frequencies.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0] - a[0];
    })[0][0];
  })();

  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, manualProgression ? Number(question?.currentItemIndex || 0) : autoSuggestedIndex)
  );
  const effectiveIndex = manualProgression ? Math.max(0, Number(question?.currentItemIndex || 0)) : autoSuggestedIndex;
  const activeItem = items[Math.min(effectiveIndex, items.length - 1)];
  const position = activeItem?.fen && activeItem.fen !== "start" ? activeItem.fen : question?.fen || "start";
  const totalStudents = students.length;
  const submissionRows = students.map((student: any) => {
    const studentResponses = responseGroups.get(student._id) || [];
    const response = studentResponses.at(0);
    const summary = aggregateLiveResponses(studentResponses);
    const activeItemResult = studentResponses
      .map((entry: any) => entry?.itemResults?.[activeItem?.id])
      .find(Boolean);
    const accuracy = summary.totalItems
      ? Math.round((summary.completedItems / Math.max(1, summary.totalItems)) * 100)
      : summary.correctResponses > 0
        ? 100
        : 0;
    return {
      student,
      response,
      summary,
      activeItemResult,
      accuracy,
      statusLabel: submissionLabel(activeItemResult, summary),
      submittedAt: response?.submittedAt || null,
      lastMove: summary.moves.at(-1) || "",
    };
  });
  const submitted = submissionRows.filter((row) => row.activeItemResult).length;
  const solvedCount = submissionRows.filter((row) => row.activeItemResult?.solved).length;
  const skippedCount = submissionRows.filter((row) => row.activeItemResult?.skipped).length;
  const waitingCount = Math.max(0, totalStudents - solvedCount - skippedCount);
  const timerSeconds = Number(question?.timer?.perQuestionSeconds || activeItem?.timerSeconds || 0);
  const timerResetKey = `${question?._id || "quiz"}-${effectiveIndex}-${question?.updatedAt || question?.launchedAt || ""}`;

  useEffect(() => {
    setCurrentIndex(Math.max(0, manualProgression ? Number(question?.currentItemIndex || 0) : autoSuggestedIndex));
  }, [autoSuggestedIndex, manualProgression, question?.currentItemIndex]);

  return (
    <div className="mx-auto w-full max-w-[840px] space-y-4">
      <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-purple-700">Live Quiz</div>
            <h3 className="mt-1 text-xl font-black text-purple-950">{question?.title || "Classroom Quiz"}</h3>
            <p className="mt-1 text-sm text-purple-800">{question?.instructions || "Students are solving directly on their boards."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onUpdateProgression({ progressionMode: manualProgression ? "auto" : "manual", currentItemIndex: effectiveIndex })}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${manualProgression ? "bg-slate-900 text-white" : "bg-white text-purple-800 border border-purple-200"}`}
            >
              {manualProgression ? "Manual progression on" : "Switch to manual"}
            </button>
            <button onClick={onEndQuiz} className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-purple-900/20">End Quiz</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Students Submitted" value={`${submitted}/${totalStudents}`} icon={<Users size={16} />} />
          <SummaryCard label="Items in Quiz" value={items.length} icon={<FileQuestion size={16} />} />
          <SummaryCard label="Time Remaining" value={<CountdownValue seconds={timerSeconds} resetKey={timerResetKey} />} icon={<Clock size={16} />} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Solved This Item" value={solvedCount} icon={<CheckSquare size={16} />} />
          <SummaryCard label="Skipped This Item" value={skippedCount} icon={<SkipForward size={16} />} />
          <SummaryCard label="Waiting / In Progress" value={waitingCount} icon={<HourglassIcon />} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(300px,420px)_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-700">Current quiz position</div>
            {items.length > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!manualProgression}
                  onClick={() => {
                    const nextIndex = Math.max(0, effectiveIndex - 1);
                    if (manualProgression) onUpdateProgression({ currentItemIndex: nextIndex });
                  }}
                  className={`grid h-8 w-8 place-items-center rounded-lg border ${manualProgression ? "border-slate-200 bg-white text-slate-700" : "border-slate-100 bg-slate-50 text-slate-300"}`}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-bold text-slate-500">{effectiveIndex + 1}/{items.length}</span>
                <button
                  type="button"
                  disabled={!manualProgression}
                  onClick={() => {
                    const nextIndex = Math.min(items.length - 1, effectiveIndex + 1);
                    if (manualProgression) onUpdateProgression({ currentItemIndex: nextIndex });
                  }}
                  className={`grid h-8 w-8 place-items-center rounded-lg border ${manualProgression ? "border-slate-200 bg-white text-slate-700" : "border-slate-100 bg-slate-50 text-slate-300"}`}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : null}
          </div>
          <Chessboard
            position={position}
            boardWidth={380}
            arePiecesDraggable={false}
            showBoardNotation={false}
            customDarkSquareStyle={{ backgroundColor: "#b58863" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {activeItem?.title || "Current position"} • {activeItem?.points || question?.scoring?.correct || 5} pts
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <InfoTile label="Mode" value={manualProgression ? "Coach-controlled" : "Auto progression"} />
            <InfoTile label="Question" value={`${effectiveIndex + 1} of ${items.length}`} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/10">
          <div className="mb-3 text-sm font-bold text-slate-700">Student submissions</div>
          <div className="space-y-3">
            {submissionRows.map(({ student, response, summary, activeItemResult, accuracy, statusLabel, submittedAt, lastMove }) => {
              return (
                <div key={student._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{student.name}</div>
                      <div className="text-xs text-slate-500">{student.username || student.email}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className={`rounded-full px-2.5 py-1 ${response ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {response ? "Submitted" : "Waiting"}
                      </span>
                      {response ? (
                        <>
                          <span className={`rounded-full px-2.5 py-1 ${
                            activeItemResult?.solved
                              ? "bg-emerald-100 text-emerald-700"
                              : activeItemResult?.skipped
                                ? "bg-amber-100 text-amber-700"
                                : summary.correctResponses > 0
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-700"
                          }`}>
                            {statusLabel}
                          </span>
                          <span className="rounded-full bg-purple-100 px-2.5 py-1 text-purple-700">{Number(summary.score || 0)} pts</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {response ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      <InfoTile label="Time" value={`${Number(summary.timeTakenSeconds || 0)} sec`} />
                      <InfoTile label="Attempts" value={Number(summary.attemptsUsed || 0)} />
                      <InfoTile label="Hints" value={Number(summary.hintsUsed || 0)} />
                      <InfoTile label="Accuracy" value={`${accuracy}%`} />
                    </div>
                  ) : null}
                  {response ? (
                    <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                      <div>Progress: {Number(summary.completedItems || 0)}/{Number(summary.totalItems || items.length)} items completed</div>
                      <div>Last move: {lastMove || "-"}</div>
                      <div>Submitted: {submittedAt ? new Date(submittedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "-"}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function HourglassIcon() {
  return <span className="inline-block text-base leading-none">...</span>;
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function CountdownValue({ seconds, resetKey }: { seconds: number; resetKey: string }) {
  const [remaining, setRemaining] = useState(Math.max(0, Number(seconds || 0)));

  useEffect(() => {
    setRemaining(Math.max(0, Number(seconds || 0)));
  }, [seconds, resetKey]);

  useEffect(() => {
    if (!remaining) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  if (!seconds) return <>Flexible</>;
  return <>{remaining}s</>;
}

function SummaryCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
    </div>
  );
}

function orderedSquares(orientation: "white" | "black") {
  const fileList = orientation === "white" ? "abcdefgh".split("") : "hgfedcba".split("");
  const rankList = orientation === "white" ? "87654321".split("") : "12345678".split("");
  return rankList.flatMap((rank) => fileList.map((file) => `${file}${rank}`));
}

function GamifiedBoardOverlay({ objects, boardWidth, orientation }: { objects: Record<string, GamifiedObjectId>; boardWidth: number; orientation: "white" | "black" }) {
  const squareSize = boardWidth / 8;
  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-8 grid-rows-8">
      {orderedSquares(orientation).map((square) => {
        const objectId = objects?.[square];
        const object = objectId ? getGamifiedObject(objectId) : null;
        return (
          <div key={square} className="flex items-center justify-center">
            {object && (
              <span
                className="flex items-center justify-center rounded-full bg-white/95 shadow-lg ring-2 ring-black/10"
                style={{ width: squareSize * 0.62, height: squareSize * 0.62, fontSize: squareSize * 0.34 }}
                title={`${object.label}: ${object.points} points`}
              >
                {object.icon}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GamifiedSetupOverlay({
  objects,
  selected,
  boardWidth,
  orientation,
  enabled,
  onPlace,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  objects: Record<string, GamifiedObjectId>;
  selected: GamifiedObjectId | "delete";
  boardWidth: number;
  orientation: "white" | "black";
  enabled: boolean;
  onPlace: (square: string) => void;
  onDelete: (square: string) => void;
  onDragStart: (square: string) => void;
  onDragEnd: () => void;
}) {
  const squareSize = boardWidth / 8;
  return (
    <div className={`absolute inset-2 grid grid-cols-8 grid-rows-8 ${enabled ? "" : "pointer-events-none"}`}>
      {orderedSquares(orientation).map((square) => {
        const objectId = objects?.[square];
        const object = objectId ? getGamifiedObject(objectId) : null;
        return (
          <button
            key={square}
            type="button"
            className="relative flex items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              if (selected === "delete") onDelete(square);
              else onPlace(square);
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
                className="flex cursor-grab items-center justify-center rounded-full bg-white/95 shadow-lg ring-2 ring-black/10 active:cursor-grabbing"
                style={{ width: squareSize * 0.68, height: squareSize * 0.68, fontSize: squareSize * 0.38 }}
                title={`${object.label}: ${object.points} points`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (selected === "delete") onDelete(square);
                  else onPlace(square);
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
      })}
    </div>
  );
}
