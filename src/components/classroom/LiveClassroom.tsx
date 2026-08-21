"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { buildMoveHintStyles, canSelectPieceForTurn, legalTargetsFromGame, mergeSquareStyles } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";
import {
  BookOpen,
  Bot,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  Crown,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  FileQuestion,
  Folder,
  Grid2X2,
  Highlighter,
  Home,
  Library,
  Lock,
  MessageSquare,
  MousePointer2,
  RefreshCcw,
  RotateCcw,
  RotateCw,
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
import PageLoadingOverlay from "@/components/feedback/PageLoadingOverlay";
import MiniFenBoard, { previewFenFromPgn } from "@/components/pgn/MiniFenBoard";
import { normalizePermissiveFen, sortPgnCollection, type PgnMoveNote } from "@/lib/pgnLibrary";
import {
  commentMetaLabel,
  lichessPgnHasInvalidMoves,
  lichessPgnLines,
  nagLabel,
  parseLichessPgn,
  pgnShapeHex,
  type LichessPgnLine,
  type LichessPgnNode,
  type ParsedPgnComment,
} from "@/lib/lichessPgn";
import { cn } from "@/lib/utils";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type Role = "student" | "instructor" | "admin" | "sub-admin";
type BoardPosition = Record<string, string | undefined>;
type TabKey = "students" | "chat" | "moves" | "engine" | "leaderboard" | "pgns";
type AttendanceStatus = "present" | "absent" | "late" | "excused" | "student_no_show" | "technical_issue";
type ClassOutcome = "completed" | "completed_continue_topic" | "abandoned" | "student_no_show" | "technical_issue" | "cancelled";
type ToolKey = "move" | "highlight" | "arrow" | "setup";
type ModifierKey = "default" | "shift" | "ctrl" | "alt";
type SetupTab = "pieces" | "objects";
type SetupMovementMode = "white" | "black" | "free";
type CastlingRights = { K: boolean; Q: boolean; k: boolean; q: boolean };
type GamifiedObjectId = "star" | "gem" | "coin" | "apple" | "fire" | "trophy" | "gift" | "shield" | "key" | "puzzle" | "rocket" | "monster" | "dragon";
type SetupSelection = string | "erase" | GamifiedObjectId;
type QuizComposerMode = "current" | "pgn_collection";
type QuizComposerItem = { id: string; title: string; fen: string; pgn?: string; pgnTitle?: string; solution: string[] };
type LivePgnVariation = { id: string; label: string; branchAt: number; moves: string[]; createdAt?: string };
type LivePgnVariationPreview = { id: string; label: string; branchAt: number; display: string; firstNode?: LichessPgnNode };
type NotationRow = { number: number; white?: string; black?: string; whiteIndex?: number; blackIndex?: number };
type StudentPresence = ReturnType<typeof studentPresenceState>;
type StudentPresenceRow = { student: any; participant: any; presence: StudentPresence };

function fenMoveContext(fen?: string | null) {
  const parts = String(fen || "").trim().split(/\s+/);
  return {
    side: parts[1] === "b" ? "b" as const : "w" as const,
    fullmove: Math.max(1, Number(parts[5]) || 1),
  };
}

function orientationForFen(fen?: string | null): "white" | "black" {
  return fenMoveContext(fen).side === "b" ? "black" : "white";
}

function notationPlyPrefix(plyIndex: number, startFen?: string | null) {
  let { side, fullmove } = fenMoveContext(startFen);
  for (let index = 0; index < plyIndex; index++) {
    if (side === "b") {
      side = "w";
      fullmove += 1;
    } else {
      side = "b";
    }
  }
  return side === "w" ? `${fullmove}.` : `${fullmove}...`;
}

function buildNotationRows(moves: string[], startFen?: string | null): NotationRow[] {
  let { side, fullmove } = fenMoveContext(startFen);
  const rows: NotationRow[] = [];
  moves.forEach((move, index) => {
    let row = rows.find((item) => item.number === fullmove);
    if (!row) {
      row = { number: fullmove };
      rows.push(row);
    }
    if (side === "w") {
      row.white = move;
      row.whiteIndex = index;
      side = "b";
    } else {
      row.black = move;
      row.blackIndex = index;
      side = "w";
      fullmove += 1;
    }
  });
  return rows;
}

function NotationMoveText({ move, note, active }: { move?: string; note?: PgnMoveNote; active: boolean }) {
  if (!move) return null;
  const hasDetails = Boolean(note?.comments.length || note?.variations.length);
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-center gap-1">
        <span>{move}</span>
        {note?.glyphs.map((glyph, index) => (
          <span key={`${glyph}-${index}`} className={`rounded px-1 py-0.5 text-[10px] font-black ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"}`}>{glyph}</span>
        ))}
      </span>
      {hasDetails && (
        <span className="mt-1 block space-y-1">
          {note?.comments.map((comment, index) => (
            <span key={`comment-${index}`} className={`block whitespace-pre-wrap break-words text-[11px] font-normal italic leading-4 ${active ? "text-purple-50" : "text-slate-500"}`}>{comment}</span>
          ))}
          {note?.variations.map((variation, index) => (
            <span key={`variation-${index}`} className={`block whitespace-normal break-words text-[10px] font-normal leading-4 ${active ? "text-amber-100" : "text-amber-700"}`}><span className="font-bold">Variation:</span> {variation}</span>
          ))}
        </span>
      )}
    </span>
  );
}

function InlineVariationButton({ variation, active, onClick }: { variation: LivePgnVariationPreview; active: boolean; onClick: () => void }) {
  const comments = [...(variation.firstNode?.startingComments || []), ...(variation.firstNode?.comments || [])];
  return (
    <button
      type="button"
      onClick={onClick}
      title={variation.label}
      className={`ml-5 mt-1 block w-[calc(100%-1.25rem)] rounded-md border-l-2 px-3 py-2 text-left text-xs transition ${active
        ? "border-blue-400 bg-blue-600 text-white"
        : "border-blue-300 bg-slate-100 text-slate-700 hover:bg-blue-50"
      }`}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`font-bold ${active ? "text-white" : "text-blue-600"}`}>{variation.display}</span>
        {variation.firstNode?.nags.map((nag, index) => (
          <span key={`${nag}-${index}`} className={`rounded px-1 py-0.5 text-[10px] font-black ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"}`}>{nagLabel(nag)}</span>
        ))}
      </span>
      {comments.map((comment, index) => (
        <span key={`variation-comment-${index}`} className={`mt-1 block whitespace-pre-wrap break-words text-[11px] leading-4 ${active ? "text-blue-50" : "text-slate-500"}`}>
          {comment.text && <span className="block italic">{comment.text}</span>}
          {commentMetaLabel(comment) && <span className="block font-semibold not-italic">{commentMetaLabel(comment)}</span>}
        </span>
      ))}
    </button>
  );
}

function displayComment(comment: ParsedPgnComment) {
  return [comment.text, commentMetaLabel(comment)].filter(Boolean).join("\n");
}

function noteFromPgnNode(node?: LichessPgnNode): PgnMoveNote {
  if (!node) return { comments: [], glyphs: [], variations: [] };
  return {
    comments: [...node.startingComments, ...node.comments].map(displayComment).filter(Boolean),
    glyphs: node.nags.map(nagLabel),
    variations: node.children.slice(1).map((child) => child.san),
  };
}

function variationDisplayLabel(variation: LivePgnVariation, startFen?: string | null) {
  const branchMove = variation.moves[variation.branchAt];
  if (!branchMove) return variation.label;
  return `${variation.label} · ${notationPlyPrefix(variation.branchAt, startFen)} ${branchMove}`;
}

function ToolbarIconButton({
  label,
  disabled = false,
  onClick,
  children,
  accent = false,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  accent?: boolean;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [tooltip, setTooltip] = useState<{ left: number; top: number; above: boolean } | null>(null);

  function showTooltip() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.bottom + 46 > window.innerHeight;
    setTooltip({
      left: Math.max(92, Math.min(window.innerWidth - 92, rect.left + rect.width / 2)),
      top: above ? rect.top - 7 : rect.bottom + 7,
      above,
    });
  }

  return (
    <span
      ref={anchorRef}
      className="inline-flex flex-none"
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltip(null)}
      onFocus={showTooltip}
      onBlur={() => setTooltip(null)}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`grid h-7 w-7 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-35 ${accent
          ? "border-purple-200 bg-purple-50 text-purple-800 hover:border-purple-400 hover:bg-purple-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800"
        }`}
        aria-label={label}
      >
        {children}
      </button>
      {tooltip && typeof document !== "undefined"
        ? createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[140] whitespace-nowrap rounded-md bg-slate-950 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl"
            style={{
              left: tooltip.left,
              top: tooltip.top,
              transform: tooltip.above ? "translate(-50%, -100%)" : "translateX(-50%)",
            }}
          >
            {label}
          </span>,
          document.body
        )
        : null}
    </span>
  );
}

const gamifiedObjectDisplayIcons: Record<GamifiedObjectId, string> = {
  star: "⭐",
  gem: "💎",
  coin: "🪙",
  apple: "🍎",
  fire: "🔥",
  trophy: "🏆",
  gift: "🎁",
  shield: "🛡",
  key: "🗝",
  puzzle: "🧩",
  rocket: "🚀",
  monster: "👾",
  dragon: "🐉",
};

const pieceDisplaySymbols: Record<string, string> = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};

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
  return role === "admin" || role === "sub-admin" || role === "instructor";
}

function extractFen(pgn: string) {
  return pgn.match(/\[FEN\s+"([^"]+)"\]/)?.[1];
}

function normalizeBoardResourceFen(value?: string | null) {
  if (!value || value === "start") return "";
  return normalizePermissiveFen(value) || String(value).trim();
}

function pgnStartFen(pgn: any) {
  return normalizeBoardResourceFen(pgn?.initialFen || pgn?.fen || extractFen(pgn?.pgn || "")) || "start";
}

function isStrictChessFen(fen?: string | null) {
  if (!fen || fen === "start") return true;
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

function isBoardResourceFen(fen?: string | null) {
  return Boolean(fen && fen !== "start" && !isStrictChessFen(fen) && normalizePermissiveFen(fen));
}

function pgnSideToMoveLabel(pgn: any) {
  const side = pgn?.sideToMove || (pgnStartFen(pgn).split(/\s+/)[1] === "b" ? "black" : "white");
  return side === "black" ? "Black to play" : "White to play";
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
    const fen = normalizeBoardResourceFen(extractFen(pgn));
    return { start: fen || "start", moves: [], valid: Boolean(fen) };
  }
}

function parseQuizSolution(startFen: string, solution: string[]) {
  const game = buildGame(startFen);
  const start = game.fen();
  const moves: Array<{ san: string; from: string; to: string; promotion: string }> = [];
  for (const notation of solution) {
    try {
      const move = game.move(notation);
      if (!move) break;
      moves.push({ san: move.san, from: move.from, to: move.to, promotion: move.promotion || "q" });
    } catch {
      break;
    }
  }
  return { start, moves, valid: moves.length === solution.length && moves.length > 0 };
}

function fenToPosition(fen?: string): BoardPosition {
  const chess = new Chess();
  const normalizedFen = normalizeBoardResourceFen(fen);
  if (normalizedFen) chess.load(normalizedFen, { skipValidation: true });
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

const emptyCastlingRights: CastlingRights = { K: false, Q: false, k: false, q: false };

function inferCastlingRights(fen?: string | null): CastlingRights {
  const rights = String(fen || "").trim().split(/\s+/)[2] || "";
  return {
    K: rights.includes("K"),
    Q: rights.includes("Q"),
    k: rights.includes("k"),
    q: rights.includes("q"),
  };
}

function legalCastlingText(position: BoardPosition, rights: CastlingRights = emptyCastlingRights) {
  let text = "";
  if (rights.K && position.e1 === "wK" && position.h1 === "wR") text += "K";
  if (rights.Q && position.e1 === "wK" && position.a1 === "wR") text += "Q";
  if (rights.k && position.e8 === "bK" && position.h8 === "bR") text += "k";
  if (rights.q && position.e8 === "bK" && position.a8 === "bR") text += "q";
  return text || "-";
}

function positionToFen(position: BoardPosition, sideToMove = "w", castlingRights: CastlingRights = emptyCastlingRights) {
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
  return `${ranks.join("/")} ${sideToMove} ${legalCastlingText(position, castlingRights)} - 0 1`;
}

function buildGame(fen?: string) {
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
        // Fall through to a clean board if an instructor is experimenting with setup mode.
      }
    }
  }
  return new Chess();
}

function applyMoves(startFen: string | undefined, moves: string[], count: number) {
  const normalizedStartFen = normalizeBoardResourceFen(startFen);
  if (!moves.length) return normalizedStartFen || "start";
  const chess = normalizedStartFen ? buildGame(normalizedStartFen) : new Chess();
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

function publicUserLabel(user: any) {
  const username = String(user?.username || "").trim();
  if (username) return username;
  const name = String(user?.name || "").trim();
  if (name) return name;
  const email = String(user?.email || "").trim();
  if (!email) return "Student";
  return email.includes("@") ? email.split("@")[0] : email;
}

function studentPresenceState(participant: any) {
  if (!participant) {
    return {
      key: "not_joined",
      label: "Not joined",
      detail: "Student has not opened this live classroom.",
      className: "bg-rose-50 text-rose-700",
    };
  }
  const lastSeen = participant.lastSeenAt ? new Date(participant.lastSeenAt) : null;
  const minutesAgo = lastSeen && !Number.isNaN(lastSeen.getTime())
    ? Math.max(0, Math.round((Date.now() - lastSeen.getTime()) / 60000))
    : null;
  const detail = participant.firstSeenAt
    ? `First joined ${new Date(participant.firstSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "";
  if (participant.leftAt || participant.presenceStatus === "left" || participant.presenceStatus === "coach_no_show_pending") {
    return {
      key: "left",
      label: "Left",
      detail: participant.leftAt ? `Left at ${new Date(participant.leftAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : detail,
      className: "bg-amber-50 text-amber-700",
    };
  }
  if (minutesAgo !== null && minutesAgo <= 2) {
    return {
      key: "joined",
      label: "Joined",
      detail,
      className: "bg-emerald-50 text-emerald-700",
    };
  }
  return {
    key: "idle",
    label: "Idle",
    detail: minutesAgo === null ? detail : `Last seen ${minutesAgo} min ago`,
    className: "bg-sky-50 text-sky-700",
  };
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

function formatEval(cp: number) {
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

function normalizeEngineFen(fen?: string) {
  if (!fen || fen === "start") return new Chess().fen();
  try {
    return new Chess(fen).fen();
  } catch {
    return new Chess().fen();
  }
}

function formatEnginePv(fen: string, pv: string) {
  const game = new Chess(normalizeEngineFen(fen));
  const san: string[] = [];
  pv.split(/\s+/).slice(0, 10).forEach((uci) => {
    try {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
      if (move) san.push(move.san);
    } catch {
      // Stockfish can occasionally emit a continuation that no longer matches the current board.
    }
  });
  return san.join(" ") || pv;
}

function serializeDrawings(drawings: any[] = []) {
  return JSON.stringify(
    drawings.map((drawing) => ({
      type: drawing?.type || "",
      from: drawing?.from || "",
      to: drawing?.to || "",
      color: drawing?.color || "",
    }))
  );
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

function gamifiedObjectIcon(id: GamifiedObjectId, fallback?: string) {
  return gamifiedObjectDisplayIcons[id] || fallback || "";
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

type LiveBoardQuizResult = {
  solved: boolean;
  mistakes: number;
  hintsUsed: number;
  timeTakenSeconds: number;
  skipped?: boolean;
  pending?: boolean;
  submittedMove?: string;
  attempts?: string[];
  correctLine?: string[];
  currentPly?: number;
  currentFen?: string;
};
type CoachQuizResultsSnapshot = { question: any; items: any[]; students: any[]; responses: any[]; endedAt?: string };

function formatNumberedNotation(moves: string[] = [], startFen = "start") {
  const cleanMoves = moves.map((move) => String(move || "").trim()).filter(Boolean);
  if (!cleanMoves.length) return "";
  const parts = String(startFen || "").split(/\s+/);
  let sideToMove: "w" | "b" = parts[1] === "b" ? "b" : "w";
  let moveNumber = Math.max(1, Number(parts[5] || 1) || 1);
  const notation: string[] = [];
  cleanMoves.forEach((move, index) => {
    if (sideToMove === "w") {
      notation.push(`${moveNumber}. ${move}`);
    } else {
      notation.push(index === 0 ? `${moveNumber}... ${move}` : move);
      moveNumber += 1;
    }
    sideToMove = sideToMove === "w" ? "b" : "w";
  });
  return notation.join(" ");
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(role === "student" ? "chat" : "students");
  const [tool, setTool] = useState<ToolKey>("move");
  const [moveAnswer, setMoveAnswer] = useState("");
  const [quizTitle, setQuizTitle] = useState("Best move from current position");
  const [quizComposerOpen, setQuizComposerOpen] = useState(false);
  const [quizComposerMode, setQuizComposerMode] = useState<QuizComposerMode>("current");
  const [quizComposerItems, setQuizComposerItems] = useState<QuizComposerItem[]>([]);
  const [quizSolution, setQuizSolution] = useState<string[]>([]);
  const [quizPoints, setQuizPoints] = useState(5);
  const [quizNegativeMarks, setQuizNegativeMarks] = useState(0);
  const [quizTimePerPosition, setQuizTimePerPosition] = useState(60);
  const [quizLaunching, setQuizLaunching] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatRecipient, setChatRecipient] = useState("group");
  const [manualLoadText, setManualLoadText] = useState("");
  const [setupLoadText, setSetupLoadText] = useState("");
  const [selectedPgnIds, setSelectedPgnIds] = useState<string[]>([]);
  const [pgnFolderQuery, setPgnFolderQuery] = useState("");
  const [activePgnFolder, setActivePgnFolder] = useState<string | null>(null);
  const [pgnMobilePanel, setPgnMobilePanel] = useState<"library" | "selection">("library");
  const [selectedPiece, setSelectedPiece] = useState("wQ");
  const [setupTab, setSetupTab] = useState<SetupTab>("pieces");
  const [gamifiedSetup, setGamifiedSetup] = useState<Record<string, GamifiedObjectId>>({});
  const [selectedObject, setSelectedObject] = useState<GamifiedObjectId | "delete">("star");
  const [draggedObjectSquare, setDraggedObjectSquare] = useState<string | null>(null);
  const [setupMovementMode, setSetupMovementMode] = useState<SetupMovementMode>("white");
  const [setupPieceColor, setSetupPieceColor] = useState<"white" | "black">("white");
  const [setupCastlingRights, setSetupCastlingRights] = useState<CastlingRights>(emptyCastlingRights);
  const [setupOpen, setSetupOpen] = useState(false);
  const [pgnOpen, setPgnOpen] = useState(false);
  const [pgnOpenMode, setPgnOpenMode] = useState<"load" | "multiple_quiz">("load");
  const [boardControlOpen, setBoardControlOpen] = useState(false);
  const [boardControlDraft, setBoardControlDraft] = useState<string[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [coachQuizResults, setCoachQuizResults] = useState<CoachQuizResultsSnapshot | null>(null);
  const [endingClass, setEndingClass] = useState(false);
  const [leavingClass, setLeavingClass] = useState(false);
  const [hiddenStudentQuizId, setHiddenStudentQuizId] = useState<string | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, AttendanceStatus>>({});
  const [classOutcome, setClassOutcome] = useState<ClassOutcome>("completed");
  const [setupPosition, setSetupPosition] = useState<BoardPosition>({});
  const [modifier, setModifier] = useState<ModifierKey>("default");
  const [engineText, setEngineText] = useState("Engine ready");
  const [engineLines, setEngineLines] = useState<Array<{ multipv: number; eval: string; variation: string }>>([]);
  const [boardWidth, setBoardWidth] = useState(620);
  const [sidePanelWidth, setSidePanelWidth] = useState(336);
  const [resizingSidePanel, setResizingSidePanel] = useState(false);
  const [selectedMoveSquare, setSelectedMoveSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [coachDrawings, setCoachDrawings] = useState<any[]>([]);
  const [drawingsDirty, setDrawingsDirty] = useState(false);
  const [annotationDrag, setAnnotationDrag] = useState<{ from: string; to?: string; x: number; y: number } | null>(null);
  const classroomLayoutRef = useRef<HTMLDivElement | null>(null);
  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const boardAreaRef = useRef<HTMLDivElement | null>(null);
  const boardControlsRef = useRef<HTMLDivElement | null>(null);
  const activeLoadedPgnRef = useRef<HTMLButtonElement | null>(null);
  const engineRef = useRef<Worker | null>(null);
  const engineFenRef = useRef("");
  const loadInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const drawingsPersistTimerRef = useRef<number | null>(null);
  const pendingOptimisticLiveRef = useRef<any | null>(null);
  const pendingOptimisticUntilRef = useRef(0);
  const pendingOptimisticClearTimerRef = useRef<number | null>(null);
  const navigationPersistTimerRef = useRef<number | null>(null);
  const navigationIndexRef = useRef(0);
  const pendingNavigationUpdateRef = useRef<Record<string, any> | null>(null);
  const coachMovePersistTimerRef = useRef<number | null>(null);
  const pendingCoachMoveUpdateRef = useRef<Record<string, any> | null>(null);
  const pgnStateRef = useRef<{ mainMoves: string[]; variations: LivePgnVariation[]; activeVariationId: string }>({ mainMoves: [], variations: [], activeVariationId: "" });
  const pendingDrawingsHashRef = useRef("");
  const dataRef = useRef<any>(null);
  const loadedOnceRef = useRef(false);
  const coach = isCoach(role);

  function focusBoard() {
    boardShellRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  const liveUrl = useCallback((path = "") => {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    const query = params.toString();
    return `/api/classrooms/${classroomId}/live${path}${query ? `${path.includes("?") ? "&" : "?"}${query}` : ""}`;
  }, [classroomId, sessionId]);

  const load = useCallback(async (force = false) => {
    if (loadInFlightRef.current && !force) {
      refreshQueuedRef.current = true;
      return;
    }
    loadInFlightRef.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const refreshing = loadedOnceRef.current;
      const res = await fetch(refreshing ? liveUrl("?includeLibrary=false") : liveUrl(), { cache: "no-store", signal: controller.signal });
      const nextData = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(nextData?.error || "Classroom could not be loaded");
      }
      if (!nextData?.classroom || !nextData?.live) {
        throw new Error("Classroom data is incomplete. Please try again.");
      }
      if (refreshing && !("pgnLibrary" in nextData)) {
        nextData.pgnLibrary = dataRef.current?.pgnLibrary || [];
      }
      const pending = pendingOptimisticLiveRef.current;
      if (pending && Date.now() < pendingOptimisticUntilRef.current && nextData?.live) {
        nextData.live = { ...nextData.live, ...pending };
      }
      loadedOnceRef.current = true;
      setLoadError(null);
      setData(nextData);
    } catch (error: any) {
      if (!loadedOnceRef.current) {
        const message =
          error?.name === "AbortError"
            ? "The classroom is taking too long to respond. Please try again."
            : error?.message || "Classroom could not be loaded. Please try again.";
        setLoadError(message);
      }
    } finally {
      window.clearTimeout(timeout);
      loadInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void load(true);
      }
    }
  }, [liveUrl]);

  const queueRefresh = useCallback((delay = 60) => {
    if (typeof window === "undefined") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void load(true);
    }, delay);
  }, [load]);

  useEffect(() => {
    if (!resizingSidePanel || typeof window === "undefined") return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(event: PointerEvent) {
      const layoutRight = classroomLayoutRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      const nextWidth = Math.round(layoutRight - event.clientX - 6);
      setSidePanelWidth(Math.max(292, Math.min(560, nextWidth)));
    }

    function stopResize() {
      setResizingSidePanel(false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [resizingSidePanel]);

  function applyOptimisticLive(update: any, protectFromRefresh = false) {
    if (protectFromRefresh) {
      pendingOptimisticLiveRef.current = { ...(pendingOptimisticLiveRef.current || {}), ...update };
      pendingOptimisticUntilRef.current = Date.now() + 1500;
      if (pendingOptimisticClearTimerRef.current) window.clearTimeout(pendingOptimisticClearTimerRef.current);
    }
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
    }, 1000);
    return () => {
      window.clearInterval(timer);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const incomingDrawings = data?.live?.drawings || [];
    if (!coach) {
      setCoachDrawings(incomingDrawings);
      setDrawingsDirty(false);
      pendingDrawingsHashRef.current = "";
      return;
    }
    const incomingHash = serializeDrawings(incomingDrawings);
    if (drawingsDirty) {
      if (incomingHash === pendingDrawingsHashRef.current) {
        setCoachDrawings(incomingDrawings);
        setDrawingsDirty(false);
        pendingDrawingsHashRef.current = "";
      }
      return;
    }
    setCoachDrawings(incomingDrawings);
  }, [coach, data?.live?.drawings, drawingsDirty]);

  useEffect(() => {
    return () => {
      if (drawingsPersistTimerRef.current) window.clearTimeout(drawingsPersistTimerRef.current);
      if (pendingOptimisticClearTimerRef.current) window.clearTimeout(pendingOptimisticClearTimerRef.current);
      if (navigationPersistTimerRef.current) window.clearTimeout(navigationPersistTimerRef.current);
      if (coachMovePersistTimerRef.current) window.clearTimeout(coachMovePersistTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!boardShellRef.current) return;
    const resize = () => {
      const boardShell = boardShellRef.current;
      if (!boardShell) return;
      const width = boardShell.clientWidth || 620;
      const viewportWidth = typeof window === "undefined" ? width : window.innerWidth;
      const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
      const isMobile = viewportWidth < 768;
      const shellStyles = window.getComputedStyle(boardShell);
      const shellVerticalPadding = Number.parseFloat(shellStyles.paddingTop || "0") + Number.parseFloat(shellStyles.paddingBottom || "0");
      const coordinateRowHeight = data?.live?.showCoordinates === false ? 0 : viewportWidth >= 640 ? 22 : 18;
      const boardFrameHeight = (viewportWidth >= 640 ? 16 : 12) + 2;
      const controlsHeight = coach && boardControlsRef.current
        ? boardControlsRef.current.offsetHeight + 12
        : 0;
      const panelHeightLimit = boardShell.clientHeight - shellVerticalPadding - coordinateRowHeight - boardFrameHeight - controlsHeight - 8;
      const viewportHeightLimit = isMobile ? viewportHeight - 220 : viewportHeight - (coach ? 260 : 230);
      const heightLimit = isMobile ? viewportHeightLimit : Math.min(viewportHeightLimit, panelHeightLimit);
      const coordinateGutter = data?.live?.showCoordinates === false ? 12 : isMobile ? 72 : 56;
      const maxBoard = isMobile ? Math.min(520, viewportWidth - 104) : 700;
      const minBoard = isMobile ? Math.min(248, Math.max(180, viewportWidth - 120)) : 300;
      setBoardWidth(Math.max(minBoard, Math.min(maxBoard, width - coordinateGutter, heightLimit)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(boardShellRef.current);
    if (boardControlsRef.current) observer.observe(boardControlsRef.current);
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
  const students = useMemo(() => classroom?.students || [], [classroom?.students]);
  const pgnLibrary = useMemo(() => data?.pgnLibrary || [], [data?.pgnLibrary]);
  const defaultClassroomPgn = useMemo(() => {
    const fen = normalizeBoardResourceFen(live?.navigationStartFen || live?.fen) || "start";
    return {
      id: "__default_classroom_pgn",
      title: "Default Classroom PGN",
      pgn: "",
      fen,
      sideToMove: fenMoveContext(fen).side === "b" ? "black" : "white",
      defaultClassroom: true,
    };
  }, [live?.fen, live?.navigationStartFen]);
  const activePgnCollection = useMemo(() => {
    const loaded = Array.isArray(live?.challenge?.pgnCollection) ? live.challenge.pgnCollection : [];
    return [defaultClassroomPgn, ...loaded.filter((item: any) => !item?.defaultClassroom && pgnTabKey(item) !== defaultClassroomPgn.id)];
  }, [defaultClassroomPgn, live?.challenge?.pgnCollection]);
  const questionUsesBoardFlow = Boolean((Array.isArray(activeQuestion?.items) && activeQuestion.items.length > 0) || activeQuestion?.solution?.length);
  const studentQuizMode = Boolean(activeQuestion) && !coach && hiddenStudentQuizId !== String(activeQuestion?._id || "") && ((Array.isArray(activeQuestion?.items) && activeQuestion.items.length > 0) || activeQuestion?.solution?.length);
  const coachQuizMode = Boolean(activeQuestion) && coach;
  const studentPanelTabs = [
    { key: "chat" as TabKey, icon: <MessageSquare size={19} />, label: "Chat" },
    { key: "leaderboard" as TabKey, icon: <Crown size={19} />, label: "Leaderboard" },
  ];

  useEffect(() => {
    if (!coach && (activeTab === "moves" || activeTab === "engine" || activeTab === "pgns")) setActiveTab("chat");
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
      if (activePgnFolder === null && !q) return false;
      const inFolder = activePgnFolder === null
        ? true
        : activePgnFolder === "__unfiled__"
          ? !folder
          : folder === activePgnFolder;
      if (!inFolder) return false;
      if (!q) return true;
      return [pgn.title, pgn.white, pgn.black, pgn.event].filter(Boolean).some((value: any) => String(value).toLowerCase().includes(q));
    });
  }, [pgnLibrary, activePgnFolder, pgnFolderQuery]);
  const chatMessages = data?.chatMessages || [];
  const pgnMoves = useMemo(() => live?.pgnMoves || [], [live?.pgnMoves]);
  const sourcePgnTree = useMemo(() => live?.pgn ? parseLichessPgn(live.pgn) : null, [live?.pgn]);
  const sourcePgnLines = useMemo<LichessPgnLine[]>(() => sourcePgnTree ? lichessPgnLines(sourcePgnTree) : [], [sourcePgnTree]);
  const pgnVariations = useMemo<LivePgnVariation[]>(() => Array.isArray(live?.pgnVariations) ? live.pgnVariations : [], [live?.pgnVariations]);
  const activePgnVariation = useMemo(
    () => pgnVariations.find((variation) => variation.id === live?.activePgnVariationId) || null,
    [live?.activePgnVariationId, pgnVariations]
  );
  const activePgnMoves = activePgnVariation?.moves || pgnMoves;
  const currentMoveIndex = live?.pgnMoveIndex || 0;
  const activeSourcePgnLine = useMemo(
    () => sourcePgnLines.find((line) => line.id === (live?.activePgnVariationId || "")) || (!live?.activePgnVariationId ? sourcePgnLines[0] : null) || null,
    [live?.activePgnVariationId, sourcePgnLines]
  );
  const activeSourcePgnNode = currentMoveIndex > 0 ? activeSourcePgnLine?.nodes[currentMoveIndex - 1] : undefined;
  const sourcePgnShapes = useMemo(
    () => [...(activeSourcePgnNode?.startingComments || []), ...(activeSourcePgnNode?.comments || [])].flatMap((comment) => comment.shapes),
    [activeSourcePgnNode]
  );
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
  const studentPresenceRows = useMemo<StudentPresenceRow[]>(
    () => students.filter((student: any) => student?.status !== "inactive").map((student: any) => {
      const participant = (live?.participants || []).find((item: any) => item.role === "student" && entityId(item.user) === entityId(student));
      return { student, participant, presence: studentPresenceState(participant) };
    }),
    [students, live?.participants]
  );
  const joinedStudentCount = studentPresenceRows.filter((row: StudentPresenceRow) => row.presence.key === "joined" || row.presence.key === "idle").length;
  const activeCoachInRoom = (live?.participants || []).some((participant: any) => {
    if (!isCoach(participant.role)) return false;
    if (participant.leftAt || participant.presenceStatus === "left") return false;
    const lastSeen = participant.lastSeenAt ? new Date(participant.lastSeenAt) : null;
    return Boolean(lastSeen && Date.now() - lastSeen.getTime() <= 2 * 60000);
  });
  const activeCoachParticipants = useMemo(
    () =>
      (live?.participants || []).filter((participant: any) => {
        if (!isCoach(participant.role)) return false;
        if (participant.leftAt || participant.presenceStatus === "left") return false;
        const lastSeen = participant.lastSeenAt ? new Date(participant.lastSeenAt) : null;
        return Boolean(lastSeen && Date.now() - lastSeen.getTime() <= 2 * 60000);
      }),
    [live?.participants]
  );
  const joinedStudentRowsForStudents = useMemo(
    () => studentPresenceRows.filter((row: StudentPresenceRow) => row.presence.key === "joined" || row.presence.key === "idle"),
    [studentPresenceRows]
  );
  const canStudentLeaveWaitingRoom = !coach && !activeCoachInRoom;

  useEffect(() => {
    navigationIndexRef.current = Math.max(0, Math.min(activePgnMoves.length, currentMoveIndex));
  }, [activePgnMoves.length, currentMoveIndex, live?.activePgnVariationId]);

  useEffect(() => {
    pgnStateRef.current = {
      mainMoves: pgnMoves,
      variations: pgnVariations,
      activeVariationId: live?.activePgnVariationId || "",
    };
  }, [live?.activePgnVariationId, pgnMoves, pgnVariations]);

  useEffect(() => {
    activeLoadedPgnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activePgnCollection.length, live?.pgn, live?.pgnTitle]);

  function openBoardControl() {
    setBoardControlDraft(
      Array.from(new Set((live?.boardControlStudents || []).map((student: any) => entityId(student)).filter(Boolean))) as string[]
    );
    setBoardControlOpen(true);
  }

  function saveBoardControl() {
    const selected = Array.from(new Set(boardControlDraft.filter(Boolean)));
    patch({
      boardControlStudents: selected,
      studentMovesEnabled: selected.length > 0,
      mode: selected.length > 0 ? "student_move" : "teaching",
      challenge: { ...(live?.challenge || {}), active: false },
    });
    setBoardControlOpen(false);
    toast.success(selected.length ? `Board control given to ${selected.length} student${selected.length === 1 ? "" : "s"}` : "Student board control removed");
  }

  useEffect(() => {
    if (chatRecipient === "group") return;
    if (!studentPresenceRows.some((row: StudentPresenceRow) => entityId(row.student) === chatRecipient)) setChatRecipient("group");
  }, [studentPresenceRows, chatRecipient]);

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
    const nextSetupMode = live?.illegalMovesEnabled ? "free" : live?.fen?.split(" ")?.[1] === "b" ? "black" : "white";
    setSetupMovementMode(nextSetupMode);
    if (nextSetupMode === "white" || nextSetupMode === "black") setSetupPieceColor(nextSetupMode);
  }, [boardPieceMap, live?.fen, live?.illegalMovesEnabled, live?.setupMode, liveGamifiedObjects, setupOpen]);

  useEffect(() => {
    if (pgnOpen) setPgnMobilePanel("library");
  }, [pgnOpen]);

  useEffect(() => {
    if (!live?.engineEnabled || !live?.fen || activeTab !== "engine") {
      if (engineRef.current) engineRef.current.postMessage("stop");
      setEngineLines([]);
      if (!live?.engineEnabled) setEngineText("Engine disabled");
      return;
    }
    try {
      if (!engineRef.current) {
        engineRef.current = new Worker("/stockfish/stockfish.js");
        engineRef.current.onmessage = (event) => {
          const line = String(event.data || "");
          const best = line.match(/^bestmove\s+(\S+)/);
          const scoreInfo = line.match(/\bscore\s+(cp|mate)\s+(-?\d+).*?\bpv\s+(.+)$/);
          if (scoreInfo) {
            const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
            const multipv = multipvMatch ? Number(multipvMatch[1]) : 1;
            const evalText = scoreInfo[1] === "mate" ? `M${scoreInfo[2]}` : formatEval(Number(scoreInfo[2]));
            const variation = formatEnginePv(engineFenRef.current, scoreInfo[3]);
            setEngineLines((current) => {
              const next = current.filter((item) => item.multipv !== multipv);
              return [...next, { multipv, eval: evalText, variation }].sort((a, b) => a.multipv - b.multipv).slice(0, 3);
            });
          }
          if (best) {
            setEngineText(`Best line: ${formatEnginePv(engineFenRef.current, best[1])}`);
          }
        };
        engineRef.current.postMessage("uci");
        engineRef.current.postMessage("setoption name MultiPV value 3");
      }
      const analysisFen = normalizeEngineFen(live.fen);
      engineFenRef.current = analysisFen;
      setEngineText("Analyzing...");
      setEngineLines([]);
      engineRef.current.postMessage(`position fen ${analysisFen}`);
      engineRef.current.postMessage("go depth 8");
    } catch {
      setEngineText("Engine unavailable in this browser session");
    }
  }, [activeTab, live?.engineEnabled, live?.fen]);

  const patch = useCallback(async (update: any, options?: { optimistic?: boolean }) => {
    if (options?.optimistic !== false) {
      applyOptimisticLive(update, true);
    }
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
    if (pendingOptimisticClearTimerRef.current) window.clearTimeout(pendingOptimisticClearTimerRef.current);
    pendingOptimisticClearTimerRef.current = window.setTimeout(() => {
      pendingOptimisticLiveRef.current = null;
      pendingOptimisticUntilRef.current = 0;
      pendingOptimisticClearTimerRef.current = null;
    }, 350);
    queueRefresh(40);
  }, [liveUrl, queueRefresh]);

  function currentLive() {
    return dataRef.current?.live || live || {};
  }

  function resourceHistory(resource: any) {
    const current = Array.isArray(currentLive()?.usedResources) ? currentLive().usedResources : [];
    const key = `${resource.type}:${resource.title}:${resource.fen || ""}`;
    const withoutDuplicate = current.filter((item: any) => `${item.type}:${item.title}:${item.fen || ""}` !== key);
    return [...withoutDuplicate, { ...resource, loadedAt: new Date().toISOString() }].slice(-30);
  }

  function updateDrawings(mutator: (drawings: any[]) => any[]) {
    const snapshot = currentLive();
    const nextDrawings = mutator([...(snapshot.drawings || [])]);
    patch({ drawings: nextDrawings });
  }

  function scheduleDrawings(nextDrawings: any[]) {
    pendingDrawingsHashRef.current = serializeDrawings(nextDrawings);
    setCoachDrawings(nextDrawings);
    setDrawingsDirty(true);
    applyOptimisticLive({ drawings: nextDrawings });
    if (drawingsPersistTimerRef.current) window.clearTimeout(drawingsPersistTimerRef.current);
    drawingsPersistTimerRef.current = window.setTimeout(() => {
      drawingsPersistTimerRef.current = null;
      const snapshot = currentLive();
      if (serializeDrawings(snapshot.drawings || []) !== pendingDrawingsHashRef.current) {
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

  function openBoardSetup() {
    const fenSide = live?.fen?.split(" ")?.[1] === "b" ? "black" : "white";
    const nextSetupMode: SetupMovementMode = live?.illegalMovesEnabled ? "free" : fenSide;
    setSetupPosition(boardPieceMap);
    setGamifiedSetup(liveGamifiedObjects);
    setSetupMovementMode(nextSetupMode);
    setSetupPieceColor(fenSide);
    setSetupCastlingRights(inferCastlingRights(live?.fen));
    setSelectedPiece(`${fenSide === "white" ? "w" : "b"}Q`);
    setSetupTab("pieces");
    setSetupLoadText("");
    setSetupOpen(true);
  }

  function commitSetup(position = setupPosition, objects = liveGamifiedObjects) {
    patch({ fen: positionToFen(position, setupSideToMove(), setupCastlingRights), gamifiedObjects: removeObjectsOnPieceSquares(objects, position), setupMode: true, illegalMovesEnabled: setupMovementMode === "free" });
  }

  function updateSetupCastlingRight(key: keyof CastlingRights, checked: boolean) {
    const nextRights = { ...setupCastlingRights, [key]: checked };
    setSetupCastlingRights(nextRights);
    if (live?.setupMode || tool === "setup") {
      patch({ fen: positionToFen(setupPosition, setupSideToMove(), nextRights), setupMode: true, illegalMovesEnabled: setupMovementMode === "free" });
    }
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

  function navigationStartFen() {
    const snapshot = currentLive();
    const collectionItem = (Array.isArray(snapshot?.challenge?.pgnCollection) ? snapshot.challenge.pgnCollection : [])
      .find((pgn: any) => pgn.title === snapshot?.pgnTitle || pgn.pgn === snapshot?.pgn);
    const resources = Array.isArray(snapshot?.usedResources) ? snapshot.usedResources : [];
    const matchingResource = [...resources].reverse().find((resource: any) => resource?.fen && (resource.title === snapshot?.pgnTitle || resource.type === "position"));
    return normalizeBoardResourceFen(snapshot?.navigationStartFen || collectionItem?.fen || extractFen(snapshot?.pgn || "") || matchingResource?.fen) || "start";
  }

  function currentPgnFen() {
    if (!activePgnMoves.length) return live?.fen || "start";
    return applyMoves(navigationStartFen(), activePgnMoves, currentMoveIndex);
  }

  function restoreLoadedPgnPosition() {
    setSelectedMoveSquare(null);
    patch({
      fen: currentPgnFen(),
      moveHistory: activePgnMoves.slice(0, currentMoveIndex),
      illegalMovesEnabled: false,
      setupMode: false,
      drawings: [],
    });
  }

  function toggleFreeMove() {
    if (live?.illegalMovesEnabled) {
      restoreLoadedPgnPosition();
      return;
    }
    setSelectedMoveSquare(null);
    patch({ illegalMovesEnabled: true, setupMode: false });
  }

  async function clearClassroomLoad() {
    setSelectedMoveSquare(null);
    await patch({ action: "clear_classroom_load" }, { optimistic: false });
  }

  function collectGamifiedWithPiece(source: string, target: string, piece: string) {
    const objectId = liveGamifiedObjects[target] as GamifiedObjectId | undefined;
    if (!objectId) return false;
    const nextPosition = { ...boardPieceMap };
    delete nextPosition[source];
    nextPosition[target] = piece;
    const nextObjects = { ...liveGamifiedObjects };
    delete nextObjects[target];
    const sideToMove = live?.fen?.split(" ")?.[1] === "b" ? "b" : "w";
    const object = getGamifiedObject(objectId);
    patch({
      fen: positionToFen(nextPosition, sideToMove),
      gamifiedObjects: nextObjects,
      moveHistory: [...(live?.moveHistory || []), `${piece[1]}${source}x${target}`],
      setupMode: false,
      illegalMovesEnabled: Boolean(live?.illegalMovesEnabled),
      mode: live?.mode === "one_move_challenge" ? "teaching" : live?.mode,
      boardControlStudents: live?.mode === "one_move_challenge" ? [] : live?.boardControlStudents?.map((s: any) => s._id || s),
      challenge: live?.mode === "one_move_challenge" ? { active: false } : live?.challenge,
    });
    toast.success(`${gamifiedObjectIcon(object.id, object.icon)} ${object.label} collected: ${object.points > 0 ? "+" : ""}${object.points} points`);
    playMoveSound(live?.soundEnabled);
    return true;
  }

  function cancelPendingNavigationPersistence() {
    if (navigationPersistTimerRef.current) window.clearTimeout(navigationPersistTimerRef.current);
    navigationPersistTimerRef.current = null;
    pendingNavigationUpdateRef.current = null;
  }

  function scheduleCoachMovePersistence(update: Record<string, any>) {
    pendingCoachMoveUpdateRef.current = update;
    applyOptimisticLive(update, true);
    if (coachMovePersistTimerRef.current) window.clearTimeout(coachMovePersistTimerRef.current);
    coachMovePersistTimerRef.current = null;
    pendingCoachMoveUpdateRef.current = null;
    void patch(update, { optimistic: false });
  }

  function pgnUpdateForCoachMove(moveSan: string, moveStartFen: string) {
    const pgnState = pgnStateRef.current;
    const activeVariation = pgnState.variations.find((variation) => variation.id === pgnState.activeVariationId) || null;
    const activeMoves = activeVariation?.moves || pgnState.mainMoves;
    const startsNewLine = !pgnState.mainMoves.length && !pgnState.variations.length && !currentLive()?.navigationStartFen;
    const startUpdate = startsNewLine ? { navigationStartFen: moveStartFen } : {};

    const index = Math.max(0, Math.min(activeMoves.length, navigationIndexRef.current));
    const expectedMove = activeMoves[index];
    if (expectedMove === moveSan) {
      const nextIndex = index + 1;
      navigationIndexRef.current = nextIndex;
      return { ...startUpdate, activePgnVariationId: activeVariation?.id || "", pgnMoveIndex: nextIndex, moveHistory: activeMoves.slice(0, nextIndex) };
    }

    if (index === activeMoves.length) {
      const nextMoves = [...activeMoves, moveSan];
      const nextIndex = nextMoves.length;
      navigationIndexRef.current = nextIndex;
      if (activeVariation) {
        const nextVariations = pgnState.variations.map((variation) => variation.id === activeVariation.id ? { ...variation, moves: nextMoves } : variation);
        pgnStateRef.current = { ...pgnState, variations: nextVariations };
        return {
          ...startUpdate,
          pgnVariations: nextVariations,
          activePgnVariationId: activeVariation.id,
          pgnMoveIndex: nextIndex,
          moveHistory: nextMoves,
        };
      }
      pgnStateRef.current = { ...pgnState, mainMoves: nextMoves };
      return { ...startUpdate, pgnMoves: nextMoves, pgnMoveIndex: nextIndex, moveHistory: nextMoves };
    }

    const variationNumber = pgnState.variations.length + 1;
    const variation: LivePgnVariation = {
      id: `variation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: `Variation ${variationNumber}`,
      branchAt: index,
      moves: [...activeMoves.slice(0, index), moveSan],
      createdAt: new Date().toISOString(),
    };
    const nextIndex = index + 1;
    navigationIndexRef.current = nextIndex;
    const nextVariations = [...pgnState.variations, variation];
    pgnStateRef.current = { ...pgnState, variations: nextVariations, activeVariationId: variation.id };
    return {
      ...startUpdate,
      pgnVariations: nextVariations,
      activePgnVariationId: variation.id,
      pgnMoveIndex: nextIndex,
      moveHistory: variation.moves,
    };
  }

  function onDrop(source: string, target: string, piece: string, promotion: PromotionPiece = "q") {
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
      cancelPendingNavigationPersistence();
      const moveStartFen = game.fen();
      const move = game.move({ from: source, to: target, promotion });
      if (!move) return collectGamifiedWithPiece(source, target, piece);
      const collectedObjectId = liveGamifiedObjects[target] as GamifiedObjectId | undefined;
      const nextGamifiedObjects = collectedObjectId ? { ...liveGamifiedObjects } : liveGamifiedObjects;
      if (collectedObjectId && nextGamifiedObjects) delete nextGamifiedObjects[target];
      scheduleCoachMovePersistence({
        fen: game.fen(),
        gamifiedObjects: nextGamifiedObjects,
        ...pgnUpdateForCoachMove(move.san, moveStartFen),
        mode: live?.mode === "one_move_challenge" ? "teaching" : live?.mode,
        boardControlStudents: live?.mode === "one_move_challenge" ? [] : live?.boardControlStudents?.map((s: any) => s._id || s),
        challenge: live?.mode === "one_move_challenge" ? { active: false } : live?.challenge,
      });
      if (collectedObjectId) {
        const object = getGamifiedObject(collectedObjectId);
        toast.success(`${gamifiedObjectIcon(object.id, object.icon)} ${object.label} collected: ${object.points > 0 ? "+" : ""}${object.points} points`);
      }
      playMoveSound(live?.soundEnabled);
      return true;
    } catch {
      if (collectGamifiedWithPiece(source, target, piece)) return true;
      return false;
    }
  }

  function onPromotionPieceSelect(piece?: string, from?: string, to?: string) {
    const promotion = promotionFromBoardPiece(piece);
    const move = from && to ? { from, to } : pendingPromotion;
    setPendingPromotion(null);
    if (!promotion || !move) return false;
    const movingPiece = boardPieceMap[move.from];
    if (!movingPiece) return false;
    return onDrop(move.from, move.to, movingPiece, promotion);
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
    const fen = positionToFen(setupPosition, setupSideToMove(), setupCastlingRights);
    patch({ fen, orientation: orientationForFen(fen), gamifiedObjects: removeObjectsOnPieceSquares(gamifiedSetup, setupPosition), setupMode: false, illegalMovesEnabled: setupMovementMode === "free", pgn: "", pgnTitle: "Custom Position", navigationStartFen: fen, pgnMoves: [], pgnMoveIndex: 0, pgnVariations: [], activePgnVariationId: "", moveHistory: [], drawings: [], usedResources: resourceHistory({ type: "position", title: "Custom Position", fen }) });
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
      setSetupCastlingRights(inferCastlingRights(fenGame.fen()));
      setSetupLoadText("");
      toast.success("FEN loaded into setup board");
      return;
    } catch {
      // Try PGN next.
    }
    const permissiveFen = normalizeBoardResourceFen(value);
    if (permissiveFen) {
      setSetupPosition(fenToPosition(permissiveFen));
      setSetupCastlingRights(inferCastlingRights(permissiveFen));
      setSetupLoadText("");
      toast.success("Board position loaded into setup board");
      return;
    }
    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(value);
      setSetupPosition(fenToPosition(pgnGame.fen()));
      setSetupCastlingRights(inferCastlingRights(pgnGame.fen()));
      setSetupLoadText("");
      toast.success("PGN position loaded into setup board");
    } catch {
      toast.error("Paste a valid PGN or FEN");
    }
  }

  function squareFromPointer(clientX: number, clientY: number) {
    const rect = boardAreaRef.current?.getBoundingClientRect();
    if (!rect) return "";
    const x = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
    const fileIndex = Math.floor((x / rect.width) * 8);
    const rankIndex = Math.floor((y / rect.height) * 8);
    return `${files[fileIndex]}${ranks[rankIndex]}`;
  }

  function pointerInBoard(clientX: number, clientY: number) {
    const rect = boardAreaRef.current?.getBoundingClientRect();
    return Boolean(rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom);
  }

  function squareCenter(square: string) {
    const fileIndex = files.indexOf(square[0]);
    const rankIndex = ranks.indexOf(square[1]);
    const size = boardWidth / 8;
    return {
      x: fileIndex * size + size / 2,
      y: rankIndex * size + size / 2,
    };
  }

  function toggleDrawing(nextDrawing: any) {
    updateCoachDrawings((drawings) => {
      const same = drawings.some((drawing: any) =>
        drawing.type === nextDrawing.type &&
        drawing.from === nextDrawing.from &&
        drawing.to === nextDrawing.to &&
        drawing.color === nextDrawing.color
      );
      if (same) {
        return drawings.filter((drawing: any) => !(
          drawing.type === nextDrawing.type &&
          drawing.from === nextDrawing.from &&
          drawing.to === nextDrawing.to &&
          drawing.color === nextDrawing.color
        ));
      }
      return [...drawings, nextDrawing];
    });
  }

  function clearCoachDrawings() {
    if (!coach || !(displayedDrawings || []).length) return;
    scheduleDrawings([]);
  }

  function onBoardMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (!coach || event.button !== 2) return;
    const from = squareFromPointer(event.clientX, event.clientY);
    if (!from) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = boardAreaRef.current?.getBoundingClientRect();
    setAnnotationDrag({
      from,
      to: from,
      x: event.clientX - (rect?.left || 0),
      y: event.clientY - (rect?.top || 0),
    });
  }

  function onBoardMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!annotationDrag || !coach) return;
    const rect = boardAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const to = pointerInBoard(event.clientX, event.clientY) ? squareFromPointer(event.clientX, event.clientY) : annotationDrag.to;
    setAnnotationDrag({
      ...annotationDrag,
      to,
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    });
  }

  function onBoardMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    if (!annotationDrag || !coach || event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const to = pointerInBoard(event.clientX, event.clientY) ? squareFromPointer(event.clientX, event.clientY) : annotationDrag.to || annotationDrag.from;
    if (!to || to === annotationDrag.from) {
      toggleDrawing({ type: "highlight", from: annotationDrag.from, color: "#dc2626" });
    } else {
      toggleDrawing({ type: "arrow", from: annotationDrag.from, to, color: "#dc2626" });
    }
    setAnnotationDrag(null);
  }

  function onBoardContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!coach) return;
    event.preventDefault();
  }

  function onBoardClick() {
    if (coach) clearCoachDrawings();
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
        if (!live?.illegalMovesEnabled && isPromotionMove(game, selectedMoveSquare, square)) {
          setPendingPromotion({ from: selectedMoveSquare, to: square });
          return;
        }
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
    const color = "#dc2626";
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
    setQuizComposerMode("current");
    setQuizComposerItems([{
      id: `${live?._id || classroomId}-current`,
      title: "Current classroom position",
      fen: live?.fen || "start",
      pgn: live?.pgn,
      pgnTitle: live?.pgnTitle,
      solution: [],
    }]);
    setQuizTitle("Best move from current position");
    setQuizSolution([]);
    setQuizNegativeMarks(0);
    setQuizComposerOpen(true);
  }

  function openPgnLibrary(mode: "load" | "multiple_quiz" = "load") {
    setPgnOpenMode(mode);
    setPgnMobilePanel("library");
    setPgnOpen(true);
  }

  function openSelectedPgnQuizComposer(minimumPositions = 1) {
    const selected = pgnLibrary.filter((pgn: any) => selectedPgnIds.includes(pgn._id));
    if (selected.length < minimumPositions) {
      return toast.info(minimumPositions > 1 ? "Select at least two PGNs for a multiple-position quiz" : "Select at least one PGN");
    }
    const items = selected.map((pgn: any) => {
      const parsed = parsePgnPuzzle(pgn.pgn);
      return {
        id: pgn._id,
        title: pgn.title,
        pgn: pgn.pgn,
        pgnTitle: pgn.title,
        fen: parsed.start,
        solution: parsed.moves.map((move: any) => move.san),
      };
    });
    if (!items.some((item: QuizComposerItem) => item.solution.length)) {
      toast.error("Selected PGNs do not contain playable moves for a quiz");
      return;
    }
    setQuizComposerMode("pgn_collection");
    setQuizComposerItems(items);
    setQuizTitle(selected.length === 1 ? `One Move Challenge: ${selected[0].title}` : `Classroom Quiz: ${selected.length} PGNs`);
    setQuizSolution([]);
    setQuizNegativeMarks(0);
    setPgnOpen(false);
    setQuizComposerOpen(true);
  }

  async function launchComposedQuiz() {
    if (quizLaunching) return;
    const isCurrentPositionQuiz = quizComposerMode === "current";
    if (isCurrentPositionQuiz && !quizSolution.length) {
      toast.error("Play the correct answer on the board first");
      return;
    }
    const sourceItems = isCurrentPositionQuiz
      ? [{
          id: `${live?._id || classroomId}-current`,
          title: quizTitle,
          fen: live?.fen || "start",
          pgn: undefined,
          pgnTitle: live?.pgnTitle,
          solution: quizSolution,
        }]
      : quizComposerItems;
    if (!sourceItems.length) {
      toast.error("Choose at least one quiz position");
      return;
    }
    const items = sourceItems.map((item) => ({
      id: item.id,
      title: item.title,
      pgn: item.pgn,
      pgnTitle: item.pgnTitle,
      fen: item.fen,
      solution: item.solution,
      points: quizPoints,
      timerSeconds: quizTimePerPosition,
    }));
    const first = items[0];
    setQuizLaunching(true);
    try {
      const res = await fetch(liveUrl("/question"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: isCurrentPositionQuiz ? "best_move" : "move_sequence",
          title: quizTitle,
          topic: live?.topic || quizTitle || "Classroom Quiz",
          difficulty: "medium",
          instructions: isCurrentPositionQuiz
            ? "Solve the current classroom position by playing the answer line."
            : "Solve each PGN position by playing the side-to-move continuation.",
          fen: first.fen || live?.fen || "start",
          pgn: isCurrentPositionQuiz ? undefined : first.pgn || live?.pgn,
          moveHistory: live?.moveHistory || [],
          solution: first.solution || [],
          items,
          timer: { perQuestionSeconds: quizTimePerPosition || undefined },
          scoring: { correct: quizPoints, wrongPenalty: quizNegativeMarks, hintPenalty: 0, speedBonus: 0, attemptPenalty: 0 },
          attempts: "multiple",
          hintsEnabled: true,
          progressionMode: "auto",
          currentItemIndex: 0,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "Could not launch quiz");
        return;
      }
      toast.success("Live quiz launched");
      if (!isCurrentPositionQuiz && first) {
        await patch({
          fen: first.fen,
          orientation: orientationForFen(first.fen),
          pgn: first.pgn || "",
          pgnTitle: first.pgnTitle || first.title,
          navigationStartFen: first.fen,
          pgnMoves: first.solution || [],
          pgnMoveIndex: 0,
          pgnVariations: [],
          activePgnVariationId: "",
          moveHistory: [],
          mode: "one_move_challenge",
          studentMovesEnabled: true,
          boardControlStudents: students.map((student: any) => student._id),
          locked: false,
        });
      }
      setQuizComposerOpen(false);
      setPgnOpen(false);
      setActiveTab("leaderboard");
      queueRefresh(60);
    } finally {
      setQuizLaunching(false);
    }
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
        finalSubmitted: true,
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
        finalSubmitted: false,
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

  async function endLiveQuiz(resultsSnapshot?: CoachQuizResultsSnapshot) {
    if (!activeQuestion) return;
    const res = await fetch(liveUrl("/question"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: activeQuestion._id, status: "closed" }),
    });
    if (res.ok) {
      toast.success("Quiz ended. Returning everyone to the live board.");
      if (resultsSnapshot) setCoachQuizResults({ ...resultsSnapshot, endedAt: new Date().toISOString() });
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
      body: JSON.stringify({
        message: chatText,
        recipient: coach && chatRecipient !== "group" ? chatRecipient : undefined,
      }),
    });
    if (res.ok) {
      setChatText("");
      queueRefresh(40);
    }
  }

  async function openEndSummary() {
    setSummaryOpen(true);
  }

  async function leaveWaitingRoom() {
    if (!canStudentLeaveWaitingRoom || leavingClass) return;
    setLeavingClass(true);
    const res = await fetch(liveUrl(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "student_leave" }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setLeavingClass(false);
      toast.error(payload?.error || "Could not leave classroom");
      return;
    }
    toast.success("You left the waiting room. No credit will be used unless the class is later completed.");
    router.push("/classrooms");
  }

  async function saveAttendanceAndClose() {
    setEndingClass(true);
    const records = students.map((student: any) => ({
      student: entityId(student),
      status: classOutcome === "student_no_show" ? "student_no_show" : attendanceDraft[entityId(student)] || "absent",
      note: classOutcome === "student_no_show" ? "Student no-show marked from live classroom summary" : "Marked from live classroom summary",
    }));
    const summary = {
      ...classSummary,
      classOutcome,
      topicCompleted: classOutcome === "completed",
      creditPolicy: classOutcome === "completed" || classOutcome === "completed_continue_topic" ? "charge_present_students" : classOutcome === "student_no_show" ? "repeat_no_show_policy" : "no_charge",
    };
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classroom: classroomId,
        sessionId,
        sessionDate: scheduledSession?.scheduledFor || live?.startedAt || new Date().toISOString(),
        records,
        coach: classroom?.coach?._id || classroom?.instructor?._id,
        coachStatus: classOutcome === "technical_issue" ? "technical_issue" : "present",
        teachingMinutes: classSummary.durationMinutes || minutesBetween(live?.startedAt, new Date().toISOString()),
        classOutcome,
        metadata: { summary, liveSessionId: live?._id },
      }),
    });
    if (!res.ok) {
      setEndingClass(false);
      toast.error("Could not save attendance");
      return;
    }
    await patch({ endedAt: new Date().toISOString(), status: "ended", summary, participants: [], boardControlStudents: [], selectedStudents: [], challenge: { active: false } });
    toast.success("Class ended and attendance saved");
    setSummaryOpen(false);
    window.location.assign(`/classrooms?updated=${Date.now()}`);
  }

  function resetGame() {
    patch({ fen: "start", orientation: "white", navigationStartFen: "start", pgnMoves: [], pgnMoveIndex: 0, pgnVariations: [], activePgnVariationId: "", moveHistory: [], drawings: [], gamifiedObjects: {}, setupMode: false, illegalMovesEnabled: false });
  }

  function navigateMove(nextIndex: number, moves = activePgnMoves, variationId = live?.activePgnVariationId || "") {
    if (!moves.length) return;
    const boundedIndex = Math.max(0, Math.min(moves.length, nextIndex));
    const startFen = navigationStartFen();
    const navigationUpdate = {
      fen: applyMoves(startFen, moves, boundedIndex),
      pgnMoveIndex: boundedIndex,
      moveHistory: moves.slice(0, boundedIndex),
      activePgnVariationId: variationId,
    };
    if (coachMovePersistTimerRef.current) window.clearTimeout(coachMovePersistTimerRef.current);
    coachMovePersistTimerRef.current = null;
    const update = {
      ...(pendingCoachMoveUpdateRef.current || {}),
      ...navigationUpdate,
    };
    pendingCoachMoveUpdateRef.current = null;
    navigationIndexRef.current = boundedIndex;
    pgnStateRef.current = { ...pgnStateRef.current, activeVariationId: variationId };
    pendingNavigationUpdateRef.current = update;
    applyOptimisticLive(update, true);
    if (navigationPersistTimerRef.current) window.clearTimeout(navigationPersistTimerRef.current);
    navigationPersistTimerRef.current = window.setTimeout(() => {
      navigationPersistTimerRef.current = null;
      const pendingUpdate = pendingNavigationUpdateRef.current;
      pendingNavigationUpdateRef.current = null;
      if (pendingUpdate) void patch(pendingUpdate, { optimistic: false });
    }, 90);
  }

  function stepPgnMove(delta: number) {
    navigateMove(navigationIndexRef.current + delta);
  }

  function selectPgnLine(variationId: string) {
    const variation = pgnVariations.find((item) => item.id === variationId);
    const moves = variation?.moves || pgnMoves;
    const targetIndex = variation ? Math.min(moves.length, Math.max(variation.branchAt + 1, navigationIndexRef.current)) : Math.min(moves.length, navigationIndexRef.current);
    navigateMove(targetIndex, moves, variation?.id || "");
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.shiftKey) setModifier("shift");
      else if (event.ctrlKey || event.metaKey) setModifier("ctrl");
      else if (event.altKey) setModifier("alt");
      else setModifier("default");
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (event.shiftKey) loadAdjacentPgn(-1);
        else stepPgnMove(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (event.shiftKey) loadAdjacentPgn(1);
        else stepPgnMove(1);
      }
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
  });

  function collectionItems(items: any[]) {
    return items.map((item: any) => ({
      id: item.id || item._id,
      title: item.title,
      pgn: item.pgn,
      fen: pgnStartFen(item),
      sideToMove: item.sideToMove || (pgnStartFen(item).split(/\s+/)[1] === "b" ? "black" : "white"),
    }));
  }

  function pgnTabKey(item: any) {
    return String(item?.id || item?._id || `${item?.title || "PGN"}:${item?.pgn || item?.fen || ""}`);
  }

  function isCurrentPgn(item: any) {
    if (!item) return false;
    if (item.pgn && live?.pgn) return item.pgn === live.pgn;
    return Boolean(item.title && item.title === live?.pgnTitle);
  }

  function currentLoadedPgnIndex(collection: any[]) {
    if (!collection.length) return -1;
    const storedIndex = Number(live?.challenge?.currentIndex);
    if (Number.isFinite(storedIndex) && storedIndex >= 0 && storedIndex < collection.length) {
      const storedItem = collection[storedIndex];
      if (isCurrentPgn(storedItem)) return storedIndex;
    }
    const matchedIndex = collection.findIndex((item: any) => isCurrentPgn(item));
    if (matchedIndex >= 0) return matchedIndex;
    return Number.isFinite(storedIndex) ? Math.max(0, Math.min(collection.length - 1, storedIndex)) : 0;
  }

  function loadPgn(pgn: any, index: number, collection?: any[]) {
    if (pgn?.defaultClassroom) {
      const fen = normalizeBoardResourceFen(live?.navigationStartFen || live?.fen) || "start";
      patch({
        fen,
        pgn: "",
        pgnTitle: "Default Classroom PGN",
        navigationStartFen: fen,
        pgnMoves,
        pgnMoveIndex: Math.max(0, Math.min(pgnMoves.length, live?.pgnMoveIndex || 0)),
        pgnVariations,
        activePgnVariationId: live?.activePgnVariationId || "",
        setupMode: false,
        illegalMovesEnabled: false,
        challenge: {
          ...(live?.challenge || {}),
          active: false,
          currentIndex: 0,
        },
      });
      setActiveTab("moves");
      return;
    }
    const chess = new Chess();
    const startFen = pgnStartFen(pgn);
    const parsedTree = parseLichessPgn(pgn.pgn || "");
    const parsedLines = lichessPgnLines(parsedTree);
    const currentTabs = collectionItems(Array.isArray(live?.challenge?.pgnCollection) ? live.challenge.pgnCollection : []);
    const requestedItem = collectionItems([pgn])[0];
    const requestedKey = pgnTabKey(requestedItem);
    let selectedCollection = collection?.length ? collectionItems(collection) : currentTabs;
    let selectedIndex = selectedCollection.findIndex((item: any) => pgnTabKey(item) === requestedKey);
    if (selectedIndex < 0) {
      selectedCollection = [...selectedCollection, requestedItem];
      selectedIndex = selectedCollection.length - 1;
    }
    try {
      chess.loadPgn(pgn.pgn);
      if (lichessPgnHasInvalidMoves(parsedTree)) throw new Error("Invalid PGN variation");
      const moves = parsedLines[0]?.moves || chess.history();
      const importedVariations: LivePgnVariation[] = parsedLines.slice(1).map((line) => ({
        id: line.id,
        label: line.label,
        branchAt: line.branchAt,
        moves: line.moves,
      }));
      patch({
        pgn: pgn.pgn,
        pgnTitle: pgn.title,
        navigationStartFen: startFen,
        pgnMoves: moves,
        pgnMoveIndex: 0,
        pgnVariations: importedVariations,
        activePgnVariationId: "",
        fen: startFen,
        orientation: orientationForFen(startFen),
        moveHistory: [],
        setupMode: false,
        drawings: [],
        challenge: {
          ...(live?.challenge || {}),
          active: false,
          currentIndex: selectedIndex,
          pgnCollection: selectedCollection,
        },
        usedResources: resourceHistory({ type: "pgn", title: pgn.title, pgn: pgn.pgn, fen: startFen }),
      });
      setActiveTab("moves");
      setPgnOpen(false);
      toast.success(`Loaded ${pgn.title}`);
    } catch {
      if (!startFen || startFen === "start") {
        toast.error("This PGN could not be loaded");
        return;
      }
      patch({
        pgn: pgn.pgn,
        pgnTitle: pgn.title,
        navigationStartFen: startFen,
        pgnMoves: [],
        pgnMoveIndex: 0,
        pgnVariations: [],
        activePgnVariationId: "",
        fen: startFen,
        orientation: orientationForFen(startFen),
        moveHistory: [],
        setupMode: false,
        illegalMovesEnabled: isBoardResourceFen(startFen),
        drawings: [],
        challenge: {
          ...(live?.challenge || {}),
          active: false,
          currentIndex: selectedIndex,
          pgnCollection: selectedCollection,
        },
        usedResources: resourceHistory({ type: "pgn", title: pgn.title, pgn: pgn.pgn, fen: startFen }),
      });
      setActiveTab("moves");
      setPgnOpen(false);
      toast.success(`Loaded ${pgn.title}`);
    }
  }

  function loadManualPosition() {
    const value = manualLoadText.trim();
    if (!value) return;
    try {
      const fenGame = new Chess(value);
      patch({ fen: fenGame.fen(), orientation: orientationForFen(fenGame.fen()), pgn: "", pgnTitle: "Custom FEN", navigationStartFen: fenGame.fen(), pgnMoves: [], pgnMoveIndex: 0, pgnVariations: [], activePgnVariationId: "", moveHistory: [], setupMode: false, drawings: [], usedResources: resourceHistory({ type: "position", title: "Custom FEN", fen: fenGame.fen() }) });
      setManualLoadText("");
      setPgnOpen(false);
      toast.success("FEN loaded into classroom");
      return;
    } catch {
      // Try PGN next.
    }
    const permissiveFen = normalizeBoardResourceFen(value);
    if (permissiveFen) {
      patch({
        fen: permissiveFen,
        orientation: orientationForFen(permissiveFen),
        pgn: "",
        pgnTitle: "Custom Board",
        navigationStartFen: permissiveFen,
        pgnMoves: [],
        pgnMoveIndex: 0,
        pgnVariations: [],
        activePgnVariationId: "",
        moveHistory: [],
        setupMode: false,
        illegalMovesEnabled: true,
        drawings: [],
        usedResources: resourceHistory({ type: "position", title: "Custom Board", fen: permissiveFen }),
      });
      setManualLoadText("");
      setPgnOpen(false);
      toast.success("Board position loaded into classroom");
      return;
    }
    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(value);
      const startFen = extractFen(value) || "start";
      loadPgn({ title: "Pasted PGN", pgn: value, initialFen: startFen }, 0);
      setManualLoadText("");
    } catch {
      toast.error("Paste a valid PGN or FEN");
    }
  }

  function loadAdjacentPgn(direction: 1 | -1) {
    const collection = Array.isArray(live?.challenge?.pgnCollection) ? live.challenge.pgnCollection : [];
    if (!collection.length) return;
    const current = currentLoadedPgnIndex(collection);
    const next = current < 0 ? 0 : Math.max(0, Math.min(collection.length - 1, current + direction));
    loadPgn(collection[next], next, collection);
  }

  function closeLoadedPgnTab(item: any, index: number) {
    if (item?.defaultClassroom) return;
    const collection = Array.isArray(live?.challenge?.pgnCollection) ? live.challenge.pgnCollection : [];
    const closingKey = pgnTabKey(item);
    const remaining = collection.filter((entry: any) => pgnTabKey(entry) !== closingKey);
    if (!isCurrentPgn(item)) {
      patch({
        challenge: {
          ...(live?.challenge || {}),
          currentIndex: Math.max(0, remaining.findIndex((entry: any) => isCurrentPgn(entry))),
          pgnCollection: remaining,
        },
      });
      return;
    }
    if (!remaining.length) {
      void clearClassroomLoad();
      return;
    }
    const nextIndex = Math.min(index, remaining.length - 1);
    loadPgn(remaining[nextIndex], nextIndex, remaining);
  }

  function togglePgnSelection(id: string) {
    setSelectedPgnIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function loadSelectedPgns() {
    const selected = sortPgnCollection(pgnLibrary.filter((pgn: any) => selectedPgnIds.includes(pgn._id)));
    if (!selected.length) return toast.info("Select at least one PGN");
    loadPgn(selected[0], 0, selected);
  }

  const displayedDrawings = useMemo(
    () => (coach && drawingsDirty ? coachDrawings : (live?.drawings || [])),
    [coach, drawingsDirty, coachDrawings, live?.drawings]
  );
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
    for (const shape of sourcePgnShapes) {
      if (shape.from === shape.to) {
        styles[shape.from] = {
          ...(styles[shape.from] || {}),
          backgroundImage: `radial-gradient(circle, transparent 0 31%, ${pgnShapeHex[shape.color]}cc 32% 40%, transparent 41%)`,
        };
      }
    }
    if (annotationDrag?.from && (!annotationDrag.to || annotationDrag.to === annotationDrag.from)) {
      styles[annotationDrag.from] = {
        ...(styles[annotationDrag.from] || {}),
        boxShadow: "inset 0 0 0 999px rgba(220,38,38,0.28)",
      };
    }
    return mergeSquareStyles(styles as any, moveHintStyles as any) as any;
  }, [annotationDrag, displayedDrawings, moveHintStyles, sourcePgnShapes]);

  const arrows = useMemo(() => {
    const manualArrows = (displayedDrawings || [])
      .filter((drawing: any) => drawing.type === "arrow" && drawing.from && drawing.to)
      .map((drawing: any) => [drawing.from, drawing.to, drawing.color || "#7c1fa2"]);
    const importedArrows = sourcePgnShapes
      .filter((shape) => shape.from !== shape.to)
      .map((shape) => [shape.from, shape.to, pgnShapeHex[shape.color]]);
    return [...manualArrows, ...importedArrows];
  }, [displayedDrawings, sourcePgnShapes]);

  const leaderboardSourceResponses = data?.sessionResponses || data?.responses || [];

  const leaderboardRows = useMemo(() => {
    const responseMap = new Map<string, any[]>();
    for (const response of leaderboardSourceResponses) {
      const studentId = entityId(response.student);
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
  }, [leaderboardSourceResponses, students]);
  const privilegedLeaderboardViewer = role === "admin" || role === "sub-admin";
  const visibleLeaderboardRows = privilegedLeaderboardViewer ? leaderboardRows : leaderboardRows.slice(0, 5);
  const viewerLeaderboardRank = !coach
    ? leaderboardRows.findIndex((row: any) => entityId(row) === userId || entityId(row._id) === userId) + 1
    : 0;

  const classSummary = useMemo(() => {
    const now = live?.endedAt || new Date().toISOString();
    const studentParticipants = (live?.participants || []).filter((participant: any) => participant.role === "student");
    const participantMap = new Map(studentParticipants.map((participant: any) => [entityId(participant.user), participant]));
    const responses = data?.sessionResponses || data?.responses || [];
    const responseByStudent = new Map<string, any[]>();
    for (const response of responses) {
      const id = response.student?._id;
      if (!id) continue;
      responseByStudent.set(id, [...(responseByStudent.get(id) || []), response]);
    }
    const rows = students.map((student: any) => {
      const studentId = entityId(student);
      const participant: any = participantMap.get(entityId(student));
      const presence = studentPresenceState(participant);
      const studentResponses = responseByStudent.get(studentId) || [];
      const correct = studentResponses.filter((response) => response.correct).length;
      const submissions = studentResponses.length;
      const points = studentResponses.reduce((sum, response) => sum + Number(response.score || 0), 0);
      const timeMinutes = participant ? minutesBetween(participant.firstSeenAt, participant.lastSeenAt || now) : 0;
      const suggestedStatus: AttendanceStatus = timeMinutes >= 10 || submissions > 0 ? "present" : timeMinutes > 0 ? "late" : "absent";
      return {
        student,
        timeMinutes,
        submissions,
        participation: submissions,
        correct,
        accuracy: submissions ? Math.round((correct / submissions) * 100) : 0,
        points,
        suggestedStatus,
        presence,
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
      quizzes: Number(data?.sessionQuestionCount || (activeQuestion ? 1 : 0)),
      questions: Number(data?.sessionQuestionCount || (activeQuestion ? 1 : 0)),
      averageScore: responses.length ? Math.round(totalScore / responses.length) : 0,
      totalPoints: totalScore,
    };
  }, [activeQuestion, data?.responses, data?.sessionQuestionCount, data?.sessionResponses, live?.endedAt, live?.participants, live?.startedAt, students]);

  useEffect(() => {
    if (!summaryOpen) return;
    const draft: Record<string, AttendanceStatus> = {};
    for (const row of classSummary.rows) draft[entityId(row.student)] = row.suggestedStatus;
    setAttendanceDraft(draft);
    setClassOutcome(classSummary.durationMinutes >= 30 ? "completed" : "abandoned");
  }, [classSummary.durationMinutes, classSummary.rows, summaryOpen]);

  if (!data) {
    if (loadError) {
      return (
        <div className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-600">Classroom loading issue</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">The classroom did not open properly</h2>
            <p className="mt-2 text-sm text-slate-600">{loadError}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-purple-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-purple-800"
              >
                <RefreshCcw size={16} /> Try again
              </button>
              <button
                type="button"
                onClick={() => router.push("/classrooms")}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-purple-200 hover:text-purple-800"
              >
                Back to classes
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-200 border-t-purple-700" />
          Loading classroom...
        </div>
      </div>
    );
  }

  const orientation = (live?.orientation || "white") as "white" | "black";
  const files = coordinateFiles(orientation);
  const ranks = coordinateRanks(orientation);
  const notationStartFen = navigationStartFen();
  const notationMoves = activePgnMoves.length ? activePgnMoves : live?.moveHistory || [];
  const notationRows = buildNotationRows(notationMoves, notationStartFen);
  const notationVariationPreviews = pgnVariations.map((variation) => {
    const parsedLine = sourcePgnLines.find((line) => line.id === variation.id);
    const moves = parsedLine?.nodes.map((node) => node.san) || variation.moves;
    const branchMoves = moves.slice(variation.branchAt);
    const prefix = notationPlyPrefix(variation.branchAt, notationStartFen);
    return {
      id: variation.id,
      label: variation.label,
      branchAt: variation.branchAt,
      display: `${prefix}${branchMoves.length ? ` ${branchMoves.join(" ")}` : ""}`,
      firstNode: parsedLine?.nodes[variation.branchAt],
    };
  });
  const notationVariationGroups = notationVariationPreviews.reduce<Record<number, LivePgnVariationPreview[]>>((groups, variation) => {
    if (!groups[variation.branchAt]) groups[variation.branchAt] = [];
    groups[variation.branchAt].push(variation);
    return groups;
  }, {});
  const notationNotes = {
    intro: {
      comments: (sourcePgnTree?.comments || []).map(displayComment).filter(Boolean),
      glyphs: [],
      variations: [],
    },
    moves: (activeSourcePgnLine?.nodes || []).reduce<Record<number, PgnMoveNote>>((notes, node, index) => {
      notes[index] = noteFromPgnNode(node);
      return notes;
    }, {}),
  };
  const matchedPgnIndex = activePgnCollection.findIndex((item: any) => isCurrentPgn(item));
  const storedPgnIndex = Number(live?.challenge?.currentIndex || 0);
  const activePgnIndex = activePgnCollection.length
    ? matchedPgnIndex >= 0
      ? matchedPgnIndex
      : Math.max(0, Math.min(activePgnCollection.length - 1, storedPgnIndex))
    : -1;
  const closablePgnCount = activePgnCollection.filter((item: any) => !item?.defaultClassroom).length;
  const canLoadPreviousPgn = activePgnIndex > 0;
  const canLoadNextPgn = activePgnIndex >= 0 && activePgnIndex < activePgnCollection.length - 1;
  const setupBoardSize = Math.min(340, Math.max(220, boardWidth));
  const canLaunchBoardQuiz = Boolean(live?.fen);
  const canLoadPgnLibrary = coach && pgnLibrary.length > 0;
  const coachSidebarTabs = [
    { key: "students" as TabKey, icon: <Users size={19} />, label: "Class" },
    { key: "chat" as TabKey, icon: <MessageSquare size={19} />, label: "Chat" },
    { key: "moves" as TabKey, icon: <ClipboardList size={19} />, label: "Moves" },
    { key: "engine" as TabKey, icon: <Bot size={19} />, label: "Engine" },
    { key: "leaderboard" as TabKey, icon: <Crown size={19} />, label: "Scores" },
    { key: "pgns" as TabKey, icon: <Library size={19} />, label: "PGNs" },
  ];
  const classroomTabs = coach ? coachSidebarTabs : studentPanelTabs;
  const quizFocusMode = Boolean(studentQuizMode || coachQuizMode);
  const layoutStyle = !quizFocusMode
    ? ({ "--classroom-side-panel-width": `${sidePanelWidth}px` } as CSSProperties)
    : undefined;

  return (
    <div className="flex min-h-[calc(100dvh-76px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-brand/10 md:h-[calc(100vh-92px)] md:min-h-[640px]">
      <div className="flex min-h-11 flex-none items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <span className="inline-flex h-6 flex-none items-center gap-1.5 rounded-md bg-purple-50 px-2 text-[10px] font-black uppercase tracking-[0.12em] text-brand">
            <BookOpen size={13} />
            {coach ? "Teaching" : "Learning"}
          </span>
          <h2 className="min-w-[120px] max-w-[360px] truncate text-sm font-black text-slate-950">{classroomName}</h2>
          <span className="min-w-0 max-w-[170px] truncate rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{coachName}</span>
          <span className="min-w-0 max-w-[240px] truncate rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{live?.topic || "Topic not set"}</span>
          <span className="flex-none rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{duration} min</span>
          {activeQuestion ? <span className="flex-none rounded-md bg-purple-100 px-2 py-1 text-[11px] font-black text-purple-800">Live quiz</span> : null}
        </div>
        <div className="flex min-w-0 flex-none items-center gap-2">
          {canStudentLeaveWaitingRoom ? (
            <button
              type="button"
              onClick={leaveWaitingRoom}
              disabled={leavingClass}
              className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:px-3"
            >
              <X size={15} />
              <span className="hidden sm:inline">{leavingClass ? "Leaving..." : "Leave waiting room"}</span>
              <span className="sm:hidden">Leave</span>
            </button>
          ) : null}
          {classroom?.meetingUrl ? (
            <a
              href={classroom.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-brand/15 bg-white px-2.5 text-xs font-bold text-brand shadow-sm transition hover:bg-brand/5"
            >
              <ExternalLink size={15} /> Open Google Meet
            </a>
          ) : null}
        </div>
      </div>

      <div
        ref={classroomLayoutRef}
        className={`grid min-h-0 flex-1 grid-cols-1 overflow-y-auto bg-slate-50/70 md:overflow-hidden ${quizFocusMode ? "" : "xl:grid-cols-[minmax(0,1fr)_6px_var(--classroom-side-panel-width)]"}`}
        style={layoutStyle}
      >
        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-visible p-2 md:overflow-hidden md:p-3">
          <div
            ref={boardShellRef}
            data-quiz-viewport={quizFocusMode ? "true" : undefined}
            className={`min-h-0 min-w-0 flex-1 overflow-visible rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:p-3 ${quizFocusMode ? "md:overflow-auto lg:overflow-hidden" : "md:overflow-auto"}`}
          >
            {studentQuizMode ? (
              <div className="mx-auto w-full max-w-[1120px]">
                <LiveBoardQuiz
                  question={activeQuestion}
                  locked={activeQuestion?.status !== "live"}
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
                <div className="mx-auto w-full max-w-[720px] overflow-x-auto rounded-lg border border-slate-200 bg-[#f6f2ea] p-1.5 shadow-sm sm:p-2">
                  <div className="mx-auto grid w-fit grid-cols-[16px_auto_16px] grid-rows-[auto_18px] gap-x-1.5 sm:grid-cols-[22px_auto_22px] sm:grid-rows-[auto_22px] sm:gap-x-2">
                    {live?.showCoordinates !== false && (
                      <div className="col-start-1 row-start-1 grid text-center text-xs font-semibold text-slate-500" style={{ height: boardWidth }}>
                        {ranks.map((rank) => <span key={`left-${rank}`} className="flex items-center justify-center">{rank}</span>)}
                      </div>
                    )}
                    <div
                      ref={boardAreaRef}
                      className="relative col-start-2 row-start-1"
                      style={{ width: boardWidth, height: boardWidth }}
                      onMouseDown={onBoardMouseDown}
                      onMouseMove={onBoardMouseMove}
                      onMouseUp={onBoardMouseUp}
                      onContextMenu={onBoardContextMenu}
                      onClick={onBoardClick}
                    >
                      <Chessboard
                        id={`classroom-board-${classroomId}`}
                        position={boardPosition as any}
                        boardWidth={boardWidth}
                        boardOrientation={orientation}
                        onPieceDrop={onDrop}
                        onPromotionPieceSelect={onPromotionPieceSelect as any}
                        showPromotionDialog={!!pendingPromotion}
                        promotionToSquare={pendingPromotion?.to as any}
                        promotionDialogVariant="modal"
                        onPieceDropOffBoard={onPieceDropOffBoard as any}
                        onSquareClick={onSquareClick as any}
                        customSquareStyles={squareStyles as any}
                        areArrowsAllowed={false}
                        arePiecesDraggable={!live?.locked && (coach || canMove)}
                        arePremovesAllowed={!!live?.illegalMovesEnabled}
                        dropOffBoardAction={live?.setupMode || tool === "setup" ? "trash" : "snapback"}
                        showBoardNotation={false}
                        customDarkSquareStyle={{ backgroundColor: "#b9875f" }}
                        customLightSquareStyle={{ backgroundColor: "#f1d9aa" }}
                        customBoardStyle={{ borderRadius: "4px", overflow: "hidden" }}
                      />
                      <svg className="pointer-events-none absolute inset-0 z-20" width={boardWidth} height={boardWidth} viewBox={`0 0 ${boardWidth} ${boardWidth}`}>
                        <defs>
                          {arrows.map((arrow: any, index: number) => (
                            <marker key={`marker-${index}`} id={`classroom-arrow-head-${index}`} markerWidth="8" markerHeight="8" refX="6.3" refY="4" orient="auto" markerUnits="strokeWidth">
                              <path d="M 0 0 L 8 4 L 0 8 z" fill={arrow[2] || "#dc2626"} />
                            </marker>
                          ))}
                          {annotationDrag && annotationDrag.to && annotationDrag.to !== annotationDrag.from && (
                            <marker id="classroom-preview-arrow-head" markerWidth="8" markerHeight="8" refX="6.3" refY="4" orient="auto" markerUnits="strokeWidth">
                              <path d="M 0 0 L 8 4 L 0 8 z" fill="#dc2626" />
                            </marker>
                          )}
                        </defs>
                        {arrows.map((arrow: any, index: number) => {
                          const from = squareCenter(arrow[0]);
                          const to = squareCenter(arrow[1]);
                          const dx = to.x - from.x;
                          const dy = to.y - from.y;
                          const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                          const strokeWidth = Math.max(4, boardWidth / 120);
                          const endOffset = Math.min(boardWidth / 28, length * 0.24);
                          const end = { x: to.x - (dx / length) * endOffset, y: to.y - (dy / length) * endOffset };
                          return (
                            <line
                              key={`${arrow[0]}-${arrow[1]}-${arrow[2]}-${index}`}
                              x1={from.x}
                              y1={from.y}
                              x2={end.x}
                              y2={end.y}
                              stroke={arrow[2] || "#dc2626"}
                              strokeWidth={strokeWidth}
                              strokeLinecap="round"
                              markerEnd={`url(#classroom-arrow-head-${index})`}
                              opacity="0.78"
                            />
                          );
                        })}
                        {annotationDrag && annotationDrag.to && annotationDrag.to !== annotationDrag.from && (() => {
                          const from = squareCenter(annotationDrag.from);
                          return (
                            <line
                              x1={from.x}
                              y1={from.y}
                              x2={annotationDrag.x}
                              y2={annotationDrag.y}
                              stroke="#dc2626"
                              strokeWidth={Math.max(4, boardWidth / 120)}
                              strokeLinecap="round"
                              markerEnd="url(#classroom-preview-arrow-head)"
                              opacity="0.62"
                            />
                          );
                        })()}
                      </svg>
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
                    onClick={() => navigator.clipboard?.writeText(positionToFen(setupPosition, setupSideToMove(), setupCastlingRights)).then(() => toast.success("FEN copied"))}
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
                  <button onClick={() => { setSetupPosition({}); setSetupCastlingRights(emptyCastlingRights); commitSetup({}); }} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><Eraser size={15} /> Clear</button>
                  <button onClick={() => { const start = fenToPosition("start"); const rights = inferCastlingRights(new Chess().fen()); setSetupPosition(start); setSetupCastlingRights(rights); patch({ fen: positionToFen(start, setupSideToMove(), rights), gamifiedObjects: {}, setupMode: true, illegalMovesEnabled: setupMovementMode === "free" }); }} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><RotateCcw size={15} /> Reset</button>
                  <button onClick={() => commitSetup()} className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-3 text-sm font-semibold text-white"><CheckSquare size={15} /> Save Position</button>
                </div>
              </div>
                )}

                {coach && (
                  <div ref={boardControlsRef} className="mx-auto mt-3 flex w-full max-w-[720px] flex-col gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      <div className="hidden min-w-0 flex-1 items-center gap-2 px-1 text-xs font-semibold text-slate-500 lg:flex">
                        <span className="min-w-0 truncate text-slate-900">{live?.pgnTitle || "Classroom board"}</span>
                        <span className="flex-none rounded-md bg-slate-100 px-2 py-1 font-bold tabular-nums text-slate-600">{currentMoveIndex}/{activePgnMoves.length || (live?.moveHistory || []).length}</span>
                      </div>
                      <div className="flex flex-none items-center justify-end gap-1">
                        <div className="flex flex-none items-center gap-1 rounded-md bg-slate-50 p-0.5 ring-1 ring-inset ring-slate-200/70">
                          <ToolbarIconButton label="First move" disabled={!activePgnMoves.length} onClick={() => navigateMove(0)}><SkipBack size={14} /></ToolbarIconButton>
                          <ToolbarIconButton label="Previous move" disabled={!activePgnMoves.length || currentMoveIndex <= 0} onClick={() => stepPgnMove(-1)}><ChevronLeft size={14} /></ToolbarIconButton>
                          <ToolbarIconButton label="Next move" disabled={!activePgnMoves.length || currentMoveIndex >= activePgnMoves.length} onClick={() => stepPgnMove(1)}><ChevronRight size={14} /></ToolbarIconButton>
                          <ToolbarIconButton label="Last move" disabled={!activePgnMoves.length} onClick={() => navigateMove(activePgnMoves.length)}><SkipForward size={14} /></ToolbarIconButton>
                        </div>
                        <span aria-hidden="true" className="mx-0.5 h-5 w-px flex-none bg-slate-200" />
                        <div className="flex flex-none items-center gap-1 rounded-md bg-purple-50/60 p-0.5 ring-1 ring-inset ring-purple-100">
                          <ToolbarIconButton label={canLoadPreviousPgn ? "Previous PGN" : "First loaded PGN"} disabled={!canLoadPreviousPgn} onClick={() => loadAdjacentPgn(-1)}><ChevronsLeft size={14} /></ToolbarIconButton>
                          <ToolbarIconButton label="Flip board for everyone" onClick={() => patch({ orientation: orientation === "white" ? "black" : "white" })} accent><RotateCw size={14} /></ToolbarIconButton>
                          <ToolbarIconButton label={canLoadNextPgn ? "Next PGN" : "Last loaded PGN"} disabled={!canLoadNextPgn} onClick={() => loadAdjacentPgn(1)}><ChevronsRight size={14} /></ToolbarIconButton>
                        </div>
                        <span aria-hidden="true" className="mx-0.5 h-5 w-px flex-none bg-slate-200" />
                        <ToolbarIconButton label="Board setup" onClick={openBoardSetup}><Grid2X2 size={14} /></ToolbarIconButton>
                        <button
                          type="button"
                          onClick={openBoardControl}
                          title="Board Control"
                          aria-label="Board Control"
                          className="inline-flex h-7 flex-none items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-800 sm:px-2"
                        >
                          <MousePointer2 size={13} /> <span className="hidden sm:inline">Control</span>
                        </button>
                        <button
                          type="button"
                          onClick={createQuiz}
                          disabled={!canLaunchBoardQuiz}
                          title="Ask Quiz from Current Position"
                          aria-label="Ask Quiz from Current Position"
                          className="inline-flex h-7 flex-none items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-1.5 text-[11px] font-semibold text-purple-800 disabled:opacity-40 sm:px-2"
                        >
                          <Sparkles size={13} /> <span className="hidden sm:inline">Position Quiz</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openPgnLibrary("multiple_quiz")}
                          disabled={pgnLibrary.length < 2}
                          className="inline-flex h-7 flex-none items-center gap-1 rounded-md bg-purple-700 px-1.5 text-[11px] font-semibold text-white disabled:opacity-40 sm:px-2"
                          title={pgnLibrary.length < 2 ? "At least two PGNs are required" : "Ask Quiz with Multiple Positions"}
                          aria-label="Ask Quiz with Multiple Positions"
                        >
                          <FileQuestion size={13} /> <span className="hidden sm:inline">Multi Quiz</span>
                        </button>
                      </div>
                    </div>
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
                    {coach ? <button onClick={() => void endLiveQuiz()} className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white">End Quiz</button> : null}
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

        {!quizFocusMode && (
          <button
            type="button"
            aria-label="Resize classroom side panel"
            title="Drag to resize side panel"
            onPointerDown={(event) => {
              event.preventDefault();
              setResizingSidePanel(true);
            }}
            className={`hidden min-h-0 cursor-col-resize border-x border-slate-200 bg-slate-100 transition hover:bg-purple-100 xl:block ${resizingSidePanel ? "bg-purple-100" : ""}`}
          />
        )}

        {!quizFocusMode && <aside className="flex min-h-[240px] flex-col border-t border-slate-200 bg-white md:min-h-0 xl:border-l xl:border-t-0">
          <div className={`grid overflow-x-auto border-b border-slate-200 bg-white text-xs ${coach ? "grid-cols-6" : "grid-cols-2"}`}>
            {classroomTabs.map(({ key, icon, label }: any) => (
              <button key={key} onClick={() => setActiveTab(key)} className={`flex h-9 min-w-fit items-center justify-center gap-1 border-b-2 px-2 text-[11px] font-semibold transition ${activeTab === key ? "border-brand text-brand" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`} title={label}>
                {icon}
                <span className={coach ? "sr-only 2xl:not-sr-only" : "hidden sm:inline"}>{label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {activeTab === "students" && (
              <div className="space-y-2">
                {coach ? (
                  <>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-950">Classroom Students</h3>
                          <p className="mt-1 text-xs text-slate-500">Shows whether each assigned student has actually opened this live classroom.</p>
                        </div>
                        <span className="shrink-0 rounded-md bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-800">
                          {joinedStudentCount}/{activeStudents.length} joined
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {studentPresenceRows.map(({ student, presence }: StudentPresenceRow) => {
                        const studentKey = entityId(student);
                        const hasControl = (live?.boardControlStudents || []).some((s: any) => entityId(s) === studentKey);
                        return (
                          <div key={student._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="grid h-8 w-8 place-items-center rounded-full bg-purple-100 text-[11px] font-bold text-purple-800">{initials(student.name)}</div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-950">{student.name}</div>
                                <div className="truncate text-xs text-slate-500">{student.username || student.email}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", presence.className)}>{presence.label}</span>
                                  {presence.detail ? <span className="text-[10px] text-slate-400">{presence.detail}</span> : null}
                                </div>
                              </div>
                            </div>
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
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-950">Live Classroom Status</h3>
                          <p className="mt-1 text-xs text-slate-500">See whether the coach is online and which participants have joined the room.</p>
                        </div>
                        <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${activeCoachInRoom ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {activeCoachInRoom ? "Coach online" : "Coach offline"}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-slate-50 p-2">
                          <div className="font-semibold text-slate-900">Coach status</div>
                          <div className="mt-1 text-slate-500">
                            {activeCoachParticipants.length
                              ? activeCoachParticipants.map((participant: any) => publicUserLabel(participant.user)).join(", ")
                              : "No coach is active in the room right now."}
                          </div>
                        </div>
                        <div className="rounded-md bg-slate-50 p-2">
                          <div className="font-semibold text-slate-900">Students joined</div>
                          <div className="mt-1 text-slate-500">{joinedStudentRowsForStudents.length}/{activeStudents.length} currently active</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {joinedStudentRowsForStudents.length ? joinedStudentRowsForStudents.map(({ student, presence }: StudentPresenceRow) => (
                        <div key={student._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-purple-100 text-[11px] font-bold text-purple-800">{initials(publicUserLabel(student))}</div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-950">{publicUserLabel(student)}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", presence.className)}>{presence.label}</span>
                                {presence.detail ? <span className="text-[10px] text-slate-400">{presence.detail}</span> : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                          No students have joined yet.
                        </div>
                      )}
                    </div>
                  </>
                )}
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
                    <button onClick={() => openSelectedPgnQuizComposer()} className="h-10 rounded-md border border-purple-200 bg-purple-50 text-sm font-semibold text-purple-800">Ask as Quiz</button>
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">Challenge Timer</label>
                  <input value={quizTimePerPosition} onChange={(event) => setQuizTimePerPosition(Number(event.target.value || 0))} type="number" min={10} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm" />
                  <div className="mt-3 max-h-48 space-y-2 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2">
                    {pgnLibrary.length ? pgnLibrary.map((pgn: any) => (
                      <label key={pgn._id} className="flex cursor-pointer items-start gap-2 rounded-md bg-white p-2 text-xs text-slate-700">
                        <input checked={selectedPgnIds.includes(pgn._id)} onChange={() => togglePgnSelection(pgn._id)} type="checkbox" className="mt-0.5 h-4 w-4" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-950">{pgn.title}</span>
                          <span className="block truncate text-slate-500">{pgn.folder || "Library"} - {pgn.white || "White"} vs {pgn.black || "Black"} - {pgnSideToMoveLabel(pgn)}</span>
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
                      <div className="mt-1 text-xs text-slate-500">{pgn.folder || "Library"} · {pgn.white || "White"} vs {pgn.black || "Black"} · {pgnSideToMoveLabel(pgn)} {pgn.result ? `· ${pgn.result}` : ""}</div>
                    </button>
                  )) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No PGNs available yet.</div>}
                </div>
              </div>
            )}

            {activeTab === "chat" && (
              <div className="flex min-h-full flex-col">
                <div className="flex-1 space-y-2">
                  {chatMessages.length ? chatMessages.map((message: any) => {
                    const recipientName = message.recipient?.name || message.recipient?.username || "student";
                    return (
                      <div key={message._id} className="rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate text-xs font-semibold text-slate-500">{message.sender?.name || message.sender?.username || "User"}</div>
                          <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${message.recipient ? "bg-purple-100 text-purple-800" : "bg-slate-200 text-slate-600"}`}>
                            {message.recipient ? (coach ? `Private to ${recipientName}` : "Private") : "Everyone"}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-800">{message.message}</div>
                      </div>
                    );
                  }) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No classroom messages yet.</div>}
                </div>
                <div className="mt-4 space-y-2">
                  {coach && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <span className="flex-none">To</span>
                      <select
                        value={chatRecipient}
                        onChange={(event) => setChatRecipient(event.target.value)}
                        className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                      >
                        <option value="group">Everyone</option>
                        {activeStudents.map((student: any) => (
                          <option key={entityId(student)} value={entityId(student)}>
                            {student.name || student.username || "Student"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && sendChat()}
                      className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm"
                      placeholder={coach && chatRecipient !== "group" ? "Send a private message" : "Send a classroom message"}
                    />
                    <button onClick={sendChat} className="grid h-10 w-10 flex-none place-items-center rounded-md bg-purple-700 text-white"><Send size={17} /></button>
                  </div>
                </div>
              </div>
            )}

            {coach && activeTab === "moves" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">Notation</h3>
                  <p className="mt-2 text-xs text-slate-500">{live?.pgnTitle || "Current classroom game"}</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
                  {(pgnMoves.length || pgnVariations.length) && activePgnVariation ? (
                    <div className="border-b border-slate-200 bg-white p-2">
                      <button
                        type="button"
                        onClick={() => selectPgnLine("")}
                        className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600"
                      >
                        Back to main line
                      </button>
                    </div>
                  ) : null}
                  {(notationNotes.intro.comments.length || notationNotes.intro.variations.length) ? (
                    <div className="space-y-1 border-b border-slate-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {notationNotes.intro.comments.map((comment, index) => <p key={`intro-comment-${index}`} className="whitespace-pre-wrap break-words italic">{comment}</p>)}
                      {notationNotes.intro.variations.map((variation, index) => <p key={`intro-variation-${index}`} className="break-words"><span className="font-bold">Variation:</span> {variation}</p>)}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[48px_1fr_1fr] bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-500">
                    <span>No.</span><span>White</span><span>Black</span>
                  </div>
                  {notationRows.length ? notationRows.map((row) => {
                    const whiteMove = row.white;
                    const blackMove = row.black;
                    return (
                      <div key={row.number} className="border-t border-slate-100 px-2 py-1">
                        <div className="grid grid-cols-[48px_1fr_1fr] items-center">
                          <span className="text-xs font-semibold text-slate-400">{row.number}.</span>
                          <button
                            disabled={!activePgnMoves.length || row.whiteIndex === undefined}
                            onClick={() => row.whiteIndex !== undefined && navigateMove(row.whiteIndex + 1)}
                            className={`min-h-9 rounded-md px-2 text-left font-medium ${row.whiteIndex !== undefined && currentMoveIndex === row.whiteIndex + 1 && !activePgnVariation ? "bg-purple-700 text-white" : "text-slate-800 hover:bg-slate-50 disabled:hover:bg-transparent"}`}
                          >
                            <NotationMoveText move={whiteMove} note={row.whiteIndex === undefined ? undefined : notationNotes.moves[row.whiteIndex]} active={row.whiteIndex !== undefined && currentMoveIndex === row.whiteIndex + 1 && !activePgnVariation} />
                          </button>
                          <button
                            disabled={!activePgnMoves.length || row.blackIndex === undefined}
                            onClick={() => row.blackIndex !== undefined && navigateMove(row.blackIndex + 1)}
                            className={`min-h-9 rounded-md px-2 text-left font-medium ${row.blackIndex !== undefined && currentMoveIndex === row.blackIndex + 1 && !activePgnVariation ? "bg-purple-700 text-white" : "text-slate-800 hover:bg-slate-50 disabled:hover:bg-transparent"}`}
                          >
                            <NotationMoveText move={blackMove} note={row.blackIndex === undefined ? undefined : notationNotes.moves[row.blackIndex]} active={row.blackIndex !== undefined && currentMoveIndex === row.blackIndex + 1 && !activePgnVariation} />
                          </button>
                        </div>
                        {row.whiteIndex !== undefined && (notationVariationGroups[row.whiteIndex + 1] || []).map((variation) => (
                          <InlineVariationButton key={variation.id} variation={variation} active={activePgnVariation?.id === variation.id} onClick={() => selectPgnLine(variation.id)} />
                        ))}
                        {row.blackIndex !== undefined && (notationVariationGroups[row.blackIndex + 1] || []).map((variation) => (
                          <InlineVariationButton key={variation.id} variation={variation} active={activePgnVariation?.id === variation.id} onClick={() => selectPgnLine(variation.id)} />
                        ))}
                      </div>
                    );
                  }) : <div className="p-6 text-center text-sm text-slate-500">No moves loaded yet.</div>}
                </div>
              </div>
            )}

            {coach && activeTab === "engine" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="inline-flex items-center gap-2 font-semibold text-slate-950"><Bot size={17} /> Stockfish Engine</h3>
                      <p className="mt-1 text-xs text-slate-500">Analyze the current classroom board position.</p>
                    </div>
                    <button onClick={() => patch({ engineEnabled: !live?.engineEnabled })} className={`inline-flex flex-none items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${live?.engineEnabled ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {live?.engineEnabled ? "Enabled" : "Enable"}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {live?.engineEnabled && engineLines.length ? (
                    <div className="space-y-2">
                      {engineLines.map((line) => (
                        <div key={line.multipv} className="rounded-md bg-white px-3 py-2 text-xs text-slate-700">
                          <span className="mr-2 font-bold text-slate-950">{line.eval}</span>
                          <span>{line.variation}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="break-words text-xs text-slate-600">{live?.engineEnabled ? engineText : "Engine disabled"}</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "leaderboard" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-950">Live Leaderboard</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Quiz and Ask Everyone results update here.
                    {!privilegedLeaderboardViewer ? " Only the top 5 students are shown in this view." : ""}
                  </p>
                  {!coach && viewerLeaderboardRank > 0 ? (
                    <div className="mt-3 inline-flex rounded-md bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800">
                      Your rank: #{viewerLeaderboardRank}
                    </div>
                  ) : null}
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[60px_1fr_86px_88px] border-b bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
                    <span>Rank</span><span>Student</span><span>Points</span><span>Done</span>
                  </div>
                  {visibleLeaderboardRows.length ? visibleLeaderboardRows.map((row: any) => {
                    const rank = leaderboardRows.findIndex((entry: any) => entityId(entry) === entityId(row)) + 1;
                    return (
                    <div key={row._id} className="grid grid-cols-[60px_1fr_86px_88px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <span className="font-semibold text-slate-500">#{rank}</span>
                      <span className="font-semibold text-slate-950">{publicUserLabel(row)}<span className="block text-xs font-normal text-slate-500">{row.move || "No response yet"}</span></span>
                      <span>{row.points}</span>
                      <span>{row.completed ? "Yes" : "No"}</span>
                    </div>
                    );
                  }) : <div className="p-8 text-center text-sm text-slate-500">No quiz responses yet.</div>}
                </div>
              </div>
            )}

            {coach && activeTab === "pgns" && (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5">
                    <div className="inline-flex min-w-0 flex-1 items-center gap-2">
                      <BookOpen size={16} className="flex-none text-slate-600" />
                      <h3 className="min-w-0 truncate font-semibold text-slate-950">Loaded PGNs</h3>
                    </div>
                    <span className="flex-none text-xs font-semibold tabular-nums text-slate-500">
                      {activePgnCollection.length ? `${activePgnIndex + 1} / ${activePgnCollection.length}` : "0 / 0"}
                    </span>
                    {closablePgnCount > 0 && (
                      <button type="button" onClick={clearClassroomLoad} className="grid h-8 w-8 flex-none place-items-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="Close all loaded PGNs" aria-label="Close all loaded PGNs">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {activePgnCollection.length ? (
                    <div className="max-h-[calc(100dvh-260px)] space-y-2 overflow-y-auto bg-slate-50/60 p-2">
                      {activePgnCollection.map((item: any, index: number) => {
                        const active = index === activePgnIndex;
                        return (
                          <div key={pgnTabKey(item)} className={`flex items-start gap-2 rounded-md border bg-white p-2 transition ${active ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-200"}`}>
                            <button
                              type="button"
                              ref={active ? activeLoadedPgnRef : undefined}
                              onClick={() => loadPgn(item, index, activePgnCollection)}
                              className="min-w-0 flex-1 text-left"
                              title={`Open ${item.title || `PGN ${index + 1}`}`}
                            >
                              <span className={`block truncate text-sm font-semibold ${active ? "text-blue-800" : "text-slate-950"}`}>{index + 1}. {item.title || `PGN ${index + 1}`}</span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">{item.sideToMove ? `${item.sideToMove} to move` : "Ready to play"} - {item.defaultClassroom ? "always available" : item.pgn ? `${(item.pgn.match(/\d+\./g) || []).length || 1} moves` : "position"}</span>
                            </button>
                            {item.defaultClassroom ? (
                              <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Default</span>
                            ) : (
                              <button type="button" onClick={() => closeLoadedPgnTab(item, index)} className="grid h-7 w-7 flex-none place-items-center rounded-md text-slate-500 transition hover:bg-red-50 hover:text-red-600" title={`Close ${item.title || "PGN"}`} aria-label={`Close ${item.title || "PGN"}`}>
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-slate-500">No PGNs loaded yet.</div>
                  )}
                </div>
                <button type="button" onClick={() => openPgnLibrary("load")} className="h-9 w-full rounded-md bg-purple-700 text-xs font-semibold text-white">Load PGNs</button>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{classroomName}</h3>
                <p className="text-xs text-slate-500">Instructor: {coachName}</p>
              </div>
              <button onClick={() => void load(true)} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-700 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800" title="Refresh classroom panel">
                <RefreshCcw size={15} />
              </button>
            </div>
            {coach && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={openBoardSetup} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-900"><Grid2X2 size={14} /> Board Setup</button>
                <button type="button" onClick={() => openPgnLibrary("load")} className="h-9 rounded-md bg-purple-700 text-xs font-semibold text-white">Load PGNs</button>
                <button type="button" onClick={openEndSummary} className="col-span-2 h-9 rounded-md bg-red-500 text-xs font-semibold text-white">End Classroom</button>
              </div>
            )}
          </div>
        </aside>}
      </div>

      {coachQuizResults && coach && (
        <CoachQuizResultsDialog snapshot={coachQuizResults} onClose={() => setCoachQuizResults(null)} />
      )}

      {boardControlOpen && coach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={() => setBoardControlOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <h3 className="text-xl font-black text-slate-950">Give Board Control</h3>
                <p className="mt-1 text-sm text-slate-500">Choose which students can move pieces on the live classroom board.</p>
              </div>
              <button type="button" onClick={() => setBoardControlOpen(false)} className="grid h-9 w-9 flex-none place-items-center rounded-md border border-slate-200" aria-label="Close board control"><X size={16} /></button>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto p-5">
              {activeStudents.length ? activeStudents.map((student: any) => {
                const studentKey = entityId(student);
                const selected = boardControlDraft.includes(studentKey);
                return (
                  <label key={studentKey} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setBoardControlDraft((current) => selected ? current.filter((id) => id !== studentKey) : [...current, studentKey])}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-purple-100 text-xs font-black text-purple-800">{initials(student.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-950">{student.name}</span>
                      <span className="block truncate text-xs text-slate-500">{student.username || student.email}</span>
                    </span>
                  </label>
                );
              }) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No active students are assigned to this classroom.</div>}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={() => setBoardControlDraft([])} disabled={!boardControlDraft.length} className="h-10 rounded-md px-3 text-sm font-semibold text-red-600 disabled:opacity-40">Remove all</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setBoardControlOpen(false)} className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
                <button type="button" onClick={saveBoardControl} className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">Save permissions</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pgnOpen && coach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4">
          <div className="flex h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl sm:max-h-[88vh] sm:h-auto">
            <div className="flex flex-none items-start justify-between gap-3 border-b border-slate-200 p-3 sm:gap-4 sm:p-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">{pgnOpenMode === "multiple_quiz" ? "Choose Multiple Quiz Positions" : "Classroom PGN Library"}</h3>
                <p className="text-sm text-slate-500">{pgnOpenMode === "multiple_quiz" ? "Select at least two PGNs. Each selected position will become a separate quiz question." : "Load a PGN onto the classroom board or turn selected PGNs into a quiz."}</p>
              </div>
              <button onClick={() => setPgnOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-slate-50 p-2 lg:hidden">
              {[
                { id: "library" as const, label: "Library", count: visiblePgnLibrary.length + pgnFolders.length },
                { id: "selection" as const, label: pgnOpenMode === "multiple_quiz" ? "Quiz selection" : "Load", count: selectedPgnIds.length },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPgnMobilePanel(item.id)}
                  className={cn(
                    "flex min-h-9 items-center justify-center gap-1 rounded-md px-2 text-xs font-black transition",
                    pgnMobilePanel === item.id ? "bg-white text-purple-800 shadow-sm" : "text-slate-600"
                  )}
                >
                  {item.label}
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{item.count > 99 ? "99+" : item.count}</span>
                </button>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4">
              <div className={cn("min-h-0 space-y-3 overflow-hidden lg:block", pgnMobilePanel === "library" ? "block" : "hidden")}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1 sm:max-w-xs">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={pgnFolderQuery}
                      onChange={(event) => setPgnFolderQuery(event.target.value)}
                      className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm"
                      placeholder={activePgnFolder ? "Search PGNs in folder" : "Search folders or files"}
                    />
                  </div>
                  <button onClick={() => { setSelectedPgnIds(visiblePgnLibrary.map((pgn: any) => pgn._id)); setPgnMobilePanel("selection"); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold"><CheckSquare size={14} /> Select All</button>
                  <button onClick={() => setSelectedPgnIds([])} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold"><X size={14} /> Clear</button>
                  <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800">{selectedPgnIds.length} selected</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <button onClick={() => setActivePgnFolder(null)} className={`inline-flex items-center gap-1 ${activePgnFolder ? "text-blue-600" : "font-semibold text-slate-900"}`}><Home size={14} /> Library</button>
                  {activePgnFolder && folderBreadcrumbs(activePgnFolder).map((item) => (
                    <span key={item.path} className="contents">
                      <ChevronRight size={14} className="text-slate-400" />
                      <button onClick={() => setActivePgnFolder(item.path)} className={`font-semibold ${item.path === activePgnFolder ? "text-slate-900" : "text-blue-600"}`}>{item.name}</button>
                    </span>
                  ))}
                </div>
                {activePgnFolder === null ? (
                  <div className="grid max-h-[calc(100dvh-230px)] gap-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-2 lg:max-h-[56vh]">
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
                    )) : null}
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
                    {visiblePgnLibrary.length ? visiblePgnLibrary.map((pgn: any, index: number) => (
                      <div key={pgn._id} className={`rounded-lg border bg-white p-3 transition ${selectedPgnIds.includes(pgn._id) ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-200"}`}>
                        <label className="grid cursor-pointer grid-cols-[88px_minmax(0,1fr)_20px] items-start gap-3 sm:grid-cols-[112px_minmax(0,1fr)_20px]">
                          <MiniFenBoard fen={previewFenFromPgn(pgn.pgn, pgn.initialFen)} className="w-[88px] sm:w-[112px]" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-950">{pgn.title}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{pgn.white || "White"} vs {pgn.black || "Black"}{pgn.result ? ` - ${pgn.result}` : ""}</span>
                            <span className="mt-2 inline-flex rounded bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">{pgnSideToMoveLabel(pgn)}</span>
                          </span>
                          <input checked={selectedPgnIds.includes(pgn._id)} onChange={() => togglePgnSelection(pgn._id)} type="checkbox" className="mt-1 h-4 w-4" />
                        </label>
                        <button onClick={() => loadPgn(pgn, index)} className="mt-3 h-9 w-full rounded-md bg-purple-700 text-xs font-semibold text-white">Load this PGN</button>
                      </div>
                    )) : (!pgnFolders.length && !pgnLibrary.some((pgn: any) => !String(pgn.folder || "").trim()) ? <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 md:col-span-2">No PGNs found in the library yet.</div> : null)}
                  </div>
                ) : (
                  <div className="grid max-h-[calc(100dvh-230px)] gap-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-2 lg:max-h-[56vh]">
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
                      <label className="grid cursor-pointer grid-cols-[88px_minmax(0,1fr)_20px] items-start gap-3 sm:grid-cols-[112px_minmax(0,1fr)_20px]">
                        <MiniFenBoard fen={previewFenFromPgn(pgn.pgn, pgn.initialFen)} className="w-[88px] sm:w-[112px]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-950">{pgn.title}</span>
                          <span className="mt-1 block truncate text-xs text-slate-500">{pgn.white || "White"} vs {pgn.black || "Black"}{pgn.result ? ` - ${pgn.result}` : ""}</span>
                          <span className="mt-2 inline-flex rounded bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">{pgnSideToMoveLabel(pgn)}</span>
                        </span>
                        <input checked={selectedPgnIds.includes(pgn._id)} onChange={() => togglePgnSelection(pgn._id)} type="checkbox" className="mt-1 h-4 w-4" />
                      </label>
                      <button onClick={() => loadPgn(pgn, index)} className="mt-3 h-9 w-full rounded-md bg-purple-700 text-xs font-semibold text-white">Load this PGN</button>
                    </div>
                  )) : pgnFolders.length ? null : <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 md:col-span-2">No PGNs found in this folder.</div>}
                </div>)}
              </div>
              <div className={cn("min-h-0 space-y-4 overflow-y-auto lg:block", pgnMobilePanel === "selection" ? "block" : "hidden")}>
                <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
                  <label className="text-xs font-semibold text-slate-600">Selected PGNs</label>
                  <div className="mt-3 grid gap-2">
                    {pgnOpenMode === "load" && <button onClick={loadSelectedPgns} className="h-10 rounded-md bg-purple-700 text-sm font-semibold text-white">Load Selected Collection</button>}
                    <button onClick={() => openSelectedPgnQuizComposer(pgnOpenMode === "multiple_quiz" ? 2 : 1)} className="h-10 rounded-md border border-purple-200 bg-white text-sm font-semibold text-purple-800">
                      {pgnOpenMode === "multiple_quiz" ? "Continue to Multiple-Position Quiz" : "Ask Selected as Quiz"}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" onMouseDown={() => setSetupOpen(false)}>
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[90vh]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex flex-none items-start justify-between gap-4 border-b border-slate-200 p-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">Board Setup</h3>
                <p className="text-sm text-slate-500">Arrange pieces, choose whose move it is, and share the position with every student.</p>
              </div>
              <button type="button" onClick={() => setSetupOpen(false)} className="grid h-9 w-9 flex-none place-items-center rounded-md border border-slate-200" aria-label="Close board setup"><X size={16} /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-2 sm:p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
                  <button onClick={() => setSetupTab("pieces")} className={`rounded-lg px-5 py-2 text-sm font-semibold ${setupTab === "pieces" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Chess Pieces</button>
                  <button onClick={() => setSetupTab("objects")} className={`rounded-lg px-5 py-2 text-sm font-semibold ${setupTab === "objects" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Gamified Objects</button>
                </div>
                {setupTab === "pieces" && (
                  <div className="mb-2 space-y-2">
                    <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
                      {(["white", "black"] as const).map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            setSetupPieceColor(color);
                            setSelectedPiece(`${color === "white" ? "w" : "b"}Q`);
                            setSetupMovementMode(color);
                          }}
                          className={`h-8 rounded-md text-xs font-bold capitalize ${setupPieceColor === color ? "bg-white text-purple-800 shadow-sm" : "text-slate-500"}`}
                        >
                          {color} pieces
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {["P", "N", "B", "R", "Q", "K"].map((piece) => {
                        const pieceCode = `${setupPieceColor === "white" ? "w" : "b"}${piece}`;
                        return (
                          <button
                            key={pieceCode}
                            onClick={() => setSelectedPiece(pieceCode)}
                            className={`h-9 rounded-md border text-xl ${selectedPiece === pieceCode ? "border-purple-700 bg-purple-700 text-white" : setupPieceColor === "black" ? "border-slate-800 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}
                          >
                            {pieceDisplaySymbols[pieceCode] || pieceCode}
                          </button>
                        );
                      })}
                      <button onClick={() => setSelectedPiece("erase")} className={`h-9 rounded-md border text-xs font-bold ${selectedPiece === "erase" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 bg-white"}`}>Del</button>
                    </div>
                  </div>
                )}
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
                <button onClick={setupTab === "objects" ? () => setSelectedObject("delete") : () => setSelectedPiece("erase")} className={`mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold ${setupTab === "objects" && selectedObject === "delete" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-300 text-slate-600"}`}>
                  <Trash2 size={17} /> Delete {setupTab === "objects" ? "objects" : "pieces"}
                </button>
              </div>

              <div className="min-h-0 space-y-3">
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
                        onClick={() => {
                          setSetupMovementMode(mode as SetupMovementMode);
                          if (mode === "white" || mode === "black") {
                            setSetupPieceColor(mode as "white" | "black");
                            setSelectedPiece(`${mode === "white" ? "w" : "b"}Q`);
                          }
                        }}
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
                {setupTab === "pieces" && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-sm font-semibold text-slate-950">Castling</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["K", "White 0-0", "Needs Ke1 + Rh1"],
                        ["Q", "White 0-0-0", "Needs Ke1 + Ra1"],
                        ["k", "Black 0-0", "Needs Ke8 + Rh8"],
                        ["q", "Black 0-0-0", "Needs Ke8 + Ra8"],
                      ].map(([key, label, hint]) => {
                        const rightKey = key as keyof CastlingRights;
                        const enabled = setupCastlingRights[rightKey];
                        const active = legalCastlingText(setupPosition, { ...emptyCastlingRights, [rightKey]: true }) !== "-";
                        return (
                          <label key={key} className={`flex min-h-14 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${enabled ? "border-purple-300 bg-purple-50" : "border-slate-200 bg-slate-50"}`}>
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) => updateSetupCastlingRight(rightKey, event.target.checked)}
                              className="h-4 w-4"
                            />
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-slate-900">{label}</span>
                              <span className={`block text-[11px] ${active ? "text-slate-500" : "text-amber-700"}`}>{active ? hint : `${hint} first`}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {setupTab === "objects" ? (
                  <div>
                    <div className="mb-3 text-sm font-semibold text-slate-950">Gamified Objects</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {gamifiedObjects.map((object) => (
                        <button key={object.id} onClick={() => setSelectedObject(object.id)} className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition ${selectedObject === object.id ? "border-purple-700 bg-purple-50 text-purple-900 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-300"}`}>
                          <span className="text-2xl">{gamifiedObjectIcon(object.id, object.icon)}</span>
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
                  <button onClick={() => { setSetupPosition({}); setGamifiedSetup({}); setSetupCastlingRights(emptyCastlingRights); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><Eraser size={15} /> Clear</button>
                  <button onClick={() => { setSetupPosition(fenToPosition("start")); setGamifiedSetup({}); setSetupCastlingRights(inferCastlingRights(new Chess().fen())); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><RotateCcw size={15} /> Reset</button>
                  <button onClick={() => navigator.clipboard?.writeText(positionToFen(setupPosition, setupSideToMove(), setupCastlingRights)).then(() => toast.success("FEN copied"))} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold"><Download size={15} /> Export</button>
                </div>
                <button onClick={loadSetupIntoClassroom} className="h-11 w-full rounded-md bg-purple-700 text-sm font-semibold text-white">Load Position into Classroom</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {quizComposerOpen && coach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-none items-start justify-between gap-4 border-b border-slate-200 p-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">{quizComposerMode === "current" ? "Ask Quiz from Current Position" : "Create Multiple-Position Quiz"}</h3>
                <p className="mt-1 text-sm text-slate-500">{quizComposerMode === "current" ? "Play the correct answer directly on the board, then set the timer and marks." : "Review the questions, then set per-position timing, marks and negative marks before sending the quiz to students."}</p>
              </div>
              <button disabled={quizLaunching} onClick={() => setQuizComposerOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 disabled:cursor-not-allowed disabled:opacity-40"><X size={16} /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 lg:grid-cols-[minmax(300px,420px)_1fr]">
              {quizComposerMode === "current" ? (
                <QuizAnswerComposer startFen={live?.fen || "start"} onChange={setQuizSolution} />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-black text-slate-950">Selected positions</div>
                  <div className="mt-3 max-h-[430px] space-y-2 overflow-auto pr-1">
                    {quizComposerItems.map((item, index) => (
                      <div key={item.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-white p-2">
                        <MiniFenBoard fen={item.fen} className="w-[96px]" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">{index + 1}. {item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.solution.length ? `${item.solution.length} move${item.solution.length === 1 ? "" : "s"} in answer line` : "No answer line found"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">Quiz title</span>
                  <input value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} className="input mt-1 h-11" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Time per position</span>
                    <input type="number" min={0} value={quizTimePerPosition} onChange={(event) => setQuizTimePerPosition(Math.max(0, Number(event.target.value || 0)))} className="input mt-1 h-11" />
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Marks per position</span>
                    <input type="number" min={1} value={quizPoints} onChange={(event) => setQuizPoints(Math.max(1, Number(event.target.value || 1)))} className="input mt-1 h-11" />
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Negative marks</span>
                    <input type="number" min={0} value={quizNegativeMarks} onChange={(event) => setQuizNegativeMarks(Math.max(0, Number(event.target.value || 0)))} className="input mt-1 h-11" />
                  </label>
                </div>
                <div className="rounded-2xl border border-brand/10 bg-brand/5 p-4">
                  <div className="text-sm font-black text-brand">{quizComposerMode === "current" ? "Recorded answer" : "Quiz settings"}</div>
                  <div className="mt-2 min-h-10 text-sm text-slate-700">
                    {quizComposerMode === "current"
                      ? quizSolution.length ? quizSolution.join(" ") : "Play the answer line on the board."
                      : `${quizComposerItems.length} position${quizComposerItems.length === 1 ? "" : "s"} selected. ${quizTimePerPosition || "Flexible"} seconds per position.`}
                  </div>
                </div>
                <button onClick={launchComposedQuiz} disabled={quizLaunching || (quizComposerMode === "current" && !quizSolution.length)} className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-40">
                  <Sparkles size={16} /> {quizLaunching ? "Launching..." : "Launch Quiz"}
                </button>
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
            <div className="mt-5 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-black text-slate-950">Class outcome</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">Only completed classes of 30+ minutes consume the topic and regular student credits.</p>
                {classSummary.durationMinutes < 30 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
                    This class is under 30 minutes. It will carry the topic forward unless an admin later overrides it.
                  </div>
                ) : null}
                <select value={classOutcome} onChange={(event) => setClassOutcome(event.target.value as ClassOutcome)} className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                  <option value="completed">Completed: topic taught</option>
                  <option value="completed_continue_topic">Completed: continue same topic next class</option>
                  <option value="abandoned">Not completed: carry topic forward</option>
                  <option value="student_no_show">Student no-show</option>
                  <option value="technical_issue">Technical issue</option>
                  <option value="cancelled">Cancel / no class</option>
                </select>
                <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
                  {classOutcome === "completed"
                    ? "Present/late students are charged and the topic is marked taught."
                    : classOutcome === "completed_continue_topic"
                      ? "Present/late students are charged. The same topic repeats next class, later topics shift down, and an extra class is added at the end."
                    : classOutcome === "student_no_show"
                      ? "Coach availability is recorded. Student credit is deducted only after repeated no-shows."
                      : "No regular credit is charged and the topic is carried forward."}
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="hidden grid-cols-[1.35fr_96px_74px_86px_74px_90px_160px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 lg:grid">
                  <span>Student</span><span>Join</span><span>Time</span><span>Submits</span><span>Accuracy</span><span>Points</span><span>Attendance</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {classSummary.rows.map((row: any) => (
                    <div key={entityId(row.student)} className="grid gap-3 px-3 py-3 text-sm lg:grid-cols-[1.35fr_96px_74px_86px_74px_90px_160px] lg:items-center lg:gap-0 lg:py-2">
                      <span className="font-semibold text-slate-950">{row.student.name}</span>
                      <span className={cn("w-fit rounded-full px-2 py-0.5 text-[11px] font-bold", row.presence.className)} title={row.presence.detail || row.presence.label}>{row.presence.label}</span>
                      <div className="grid grid-cols-4 gap-2 text-xs text-slate-600 lg:contents lg:text-sm">
                        <span>{row.timeMinutes} min</span>
                        <span>{row.submissions} submits</span>
                        <span>{row.accuracy}%</span>
                        <span>{row.points} pts</span>
                      </div>
                      <select
                        value={classOutcome === "student_no_show" ? "student_no_show" : attendanceDraft[entityId(row.student)] || row.suggestedStatus}
                        disabled={classOutcome === "student_no_show"}
                        onChange={(event) => setAttendanceDraft((current) => ({ ...current, [entityId(row.student)]: event.target.value as AttendanceStatus }))}
                        className="h-9 rounded-md border border-slate-200 px-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                        <option value="technical_issue">Technical issue</option>
                        <option value="student_no_show">Student no-show</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={saveAttendanceAndClose} className="h-10 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">Save Attendance and Finalize</button>
            </div>
          </div>
        </div>
      )}
      <PageLoadingOverlay visible={endingClass} message="Saving attendance and closing the classroom..." />
      <PageLoadingOverlay visible={leavingClass} message="Leaving the waiting room..." />
    </div>
  );
}

function QuizAnswerComposer({ startFen, onChange }: { startFen: string; onChange: (moves: string[]) => void }) {
  const makeGame = () => buildGame(startFen);
  const [fen, setFen] = useState(() => makeGame().fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const game = makeGame();
    setFen(game.fen());
    setMoves([]);
    setSelected(null);
    onChange([]);
  }, [startFen]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(from: string, to: string) {
    try {
      const game = buildGame(fen);
      const move = game.move({ from, to, promotion: "q" });
      if (!move) return false;
      const next = [...moves, move.san];
      setFen(game.fen());
      setMoves(next);
      setSelected(null);
      onChange(next);
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    const game = makeGame();
    setFen(game.fen());
    setMoves([]);
    setSelected(null);
    onChange([]);
  }

  return (
    <div>
      <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-lg border-4 border-[#8f4f20]">
        <Chessboard
          id="quiz-answer-composer"
          position={fen}
          onPieceDrop={play}
          onSquareClick={(square) => {
            if (selected) {
              if (!play(selected, square)) setSelected(square);
            } else {
              setSelected(square);
            }
          }}
          customDarkSquareStyle={{ backgroundColor: "#b9875f" }}
          customLightSquareStyle={{ backgroundColor: "#f1d9aa" }}
          customSquareStyles={selected ? { [selected]: { boxShadow: "inset 0 0 0 4px rgba(90,19,114,.55)" } } : {}}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">{moves.length ? `${moves.length} move${moves.length === 1 ? "" : "s"} recorded` : "Play the correct line"}</div>
        <button type="button" onClick={reset} className="btn-outline"><RotateCcw size={15} /> Reset answer</button>
      </div>
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
  const items = useMemo(
    () => (Array.isArray(question.items) && question.items.length
      ? question.items
      : [{
          id: `${question._id}-single`,
          title: question.title,
          fen: question.fen,
          pgn: question.pgn,
          solution: question.solution || [],
          points: question.scoring?.correct ?? 5,
          timerSeconds: question.timer?.perQuestionSeconds || 0,
        }]),
    [question]
  );
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, Number(serverIndex || 0)));
  const [results, setResults] = useState<Record<string, LiveBoardQuizResult>>(existingItemResults || {});
  const [quizStartedAt] = useState(Date.now());
  const [itemStartedAt, setItemStartedAt] = useState(Date.now());
  const [remaining, setRemaining] = useState(Number(question.timer?.perQuestionSeconds || items[0]?.timerSeconds || 0));
  const submittedRef = useRef(false);

  const activeItem = items[currentIndex];
  const parsed = useMemo(() => {
    const solution = Array.isArray(activeItem?.solution) ? activeItem.solution : [];
    const start = activeItem?.fen || question.fen || "start";
    if (solution.length) return parseQuizSolution(start, solution);
    if (activeItem?.pgn) return parsePgnPuzzle(activeItem.pgn);
    return {
      start,
      moves: [],
      valid: false,
    };
  }, [activeItem?.fen, activeItem?.pgn, activeItem?.solution, question.fen]);
  const [game, setGame] = useState(() => buildGame(parsed.start));
  const [position, setPosition] = useState(parsed.start);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [solved, setSolved] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const [quizBoardWidth, setQuizBoardWidth] = useState(420);
  const [feedback, setFeedback] = useState("Make the best move on the board.");
  const [lastStudentMove, setLastStudentMove] = useState("");
  const [attemptMoves, setAttemptMoves] = useState<string[]>([]);
  const [correctLineMoves, setCorrectLineMoves] = useState<string[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [quizPendingPromotion, setQuizPendingPromotion] = useState<PendingPromotion | null>(null);
  const advancedRef = useRef(false);
  const submitPromptedRef = useRef(false);
  const quizBoardShellRef = useRef<HTMLDivElement | null>(null);
  const startingTurn = useMemo(() => buildGame(parsed.start).turn(), [parsed.start]);
  const quizOrientation = startingTurn === "b" ? "black" : "white";
  const sideToMoveLabel = startingTurn === "b" ? "Black to move" : "White to move";
  const quizFiles = quizOrientation === "black" ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const quizRanks = quizOrientation === "black" ? ["1", "2", "3", "4", "5", "6", "7", "8"] : ["8", "7", "6", "5", "4", "3", "2", "1"];
  const positionTopic = activeItem?.title || activeItem?.pgnTitle || question.topic || question.title || `Position ${currentIndex + 1}`;
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

  const answeredCount = useCallback((nextResults: Record<string, LiveBoardQuizResult>) => {
    return items.filter((item: any) => Boolean(nextResults[item.id]?.solved || nextResults[item.id]?.skipped)).length;
  }, [items]);

  const nextReviewIndex = useCallback((nextResults: Record<string, LiveBoardQuizResult>, fromIndex: number) => {
    for (let index = fromIndex + 1; index < items.length; index++) {
      if (!nextResults[items[index].id]) return index;
    }
    for (let index = 0; index < items.length; index++) {
      if (!nextResults[items[index].id]) return index;
    }
    return Math.min(items.length - 1, fromIndex);
  }, [items]);

  const skipCurrent = useCallback(() => {
    if (!activeItem) return;
    const result = { solved: false, skipped: true, mistakes, hintsUsed, timeTakenSeconds: Math.round((Date.now() - itemStartedAt) / 1000), submittedMove: lastStudentMove, attempts: attemptMoves, currentFen: position };
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
  }, [activeItem, answeredCount, attemptMoves, currentIndex, hintsUsed, itemStartedAt, lastStudentMove, mistakes, nextReviewIndex, onProgress, position, progressionMode, quizFinished, quizStartedAt, results, items.length]);

  useEffect(() => {
    submittedRef.current = false;
    setCurrentIndex(Math.max(0, Number(serverIndex || 0)));
    setResults(existingItemResults || {});
    setQuizFinished(false);
    setQuizSubmitted(false);
  }, [question._id, existingItemResults, serverIndex]);

  useEffect(() => {
    submitPromptedRef.current = false;
    setSubmitConfirmationOpen(false);
  }, [question._id]);

  useEffect(() => {
    if (!quizBoardShellRef.current) return;
    const resize = () => {
      const shell = quizBoardShellRef.current;
      if (!shell) return;
      const shellWidth = shell.clientWidth || 420;
      const shellTop = shell.getBoundingClientRect().top;
      const quizViewport = shell.closest('[data-quiz-viewport="true"]');
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const viewportBottom = quizViewport ? Math.min(viewportHeight, quizViewport.getBoundingClientRect().bottom) : viewportHeight;
      const coordinateGutter = 18;
      const belowBoardSpace = 118;
      const availableHeight = viewportBottom - shellTop - coordinateGutter - belowBoardSpace;
      setQuizBoardWidth(Math.max(160, Math.floor(Math.min(680, shellWidth - coordinateGutter - 16, availableHeight))));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(quizBoardShellRef.current);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (!quizFinished || quizSubmitted || submitPromptedRef.current) return;
    submitPromptedRef.current = true;
    setSubmitConfirmationOpen(true);
  }, [quizFinished, quizSubmitted]);

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
    const next = buildGame(parsed.start);
    setGame(next);
    setPosition(parsed.start);
    setPly(0);
    setMistakes(0);
    setHintsUsed(0);
    setSolved(false);
    setFeedback(parsed.moves.length === 0 ? "No answer line was provided for this position." : quizFinished ? "Review this position and update your answer if needed." : "Make your move on the board.");
    setLastStudentMove("");
    setAttemptMoves([]);
    setCorrectLineMoves([]);
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
  }, [remaining, skipCurrent, solved]);

  const submitQuiz = useCallback((nextResults = results, nextFeedback = "Quiz submitted successfully. Waiting for the coach.") => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitConfirmationOpen(false);
    setQuizSubmitted(true);
    setFeedback(nextFeedback);
    onComplete(nextResults, Math.round((Date.now() - quizStartedAt) / 1000));
    onSubmitted?.();
  }, [onComplete, onSubmitted, quizStartedAt, results]);

  useEffect(() => {
    if (!solved || advancedRef.current || !activeItem) return;
    const result = {
      solved: true,
      mistakes,
      hintsUsed,
      timeTakenSeconds: Math.round((Date.now() - itemStartedAt) / 1000),
      submittedMove: lastStudentMove || correctLineMoves.at(-1) || parsed.moves[0]?.san || "",
      attempts: attemptMoves,
      correctLine: correctLineMoves,
      currentPly: correctLineMoves.length,
      currentFen: position,
    };
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
    window.setTimeout(() => moveNext(nextResults), 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  function moveNext(nextResults: Record<string, LiveBoardQuizResult>) {
    setCurrentIndex(nextReviewIndex(nextResults, currentIndex));
  }

  function applyAutoReply(nextGame: Chess, nextPly: number) {
    if (nextPly >= parsed.moves.length) {
      return { nextPly, finished: true };
    }
    const reply = parsed.moves[nextPly];
    const move = reply.from && reply.to
      ? nextGame.move({ from: reply.from, to: reply.to, promotion: reply.promotion || "q" })
      : nextGame.move(reply.san);
    if (!move) return { nextPly, finished: false };
    const updatedPly = nextPly + 1;
    return { nextPly: updatedPly, finished: updatedPly >= parsed.moves.length };
  }

  function commitQuizMove(source: string, target: string, promotion: PromotionPiece = "q") {
    if (locked || quizSubmitted || ply >= parsed.moves.length) return false;
    const expected = parsed.moves[ply];
    const nextGame = new Chess(game.fen());
    const move = nextGame.move({ from: source, to: target, promotion });
    if (!move) return false;
    const expectedPromotion = expected.promotion && expected.promotion !== "q" ? expected.promotion : move.promotion || "q";
    const matchesExpectedSquares = expected.from && expected.to
      ? expected.from === source && expected.to === target && (!expected.promotion || expectedPromotion === (move.promotion || "q"))
      : false;
    const matchesExpectedSan = move.san === expected.san;
    if (!matchesExpectedSquares && !matchesExpectedSan) {
      const nextMistakes = mistakes + 1;
      const nextAttempts = [...attemptMoves, move.san];
      setMistakes(nextMistakes);
      setAttemptMoves(nextAttempts);
      const nextResults = {
        ...results,
        [activeItem.id]: {
          solved: false,
          pending: true,
          mistakes: nextMistakes,
          hintsUsed,
          timeTakenSeconds: Math.round((Date.now() - itemStartedAt) / 1000),
          submittedMove: move.san,
          attempts: nextAttempts,
          correctLine: correctLineMoves,
          currentPly: correctLineMoves.length,
          currentFen: position,
        },
      };
      setResults(nextResults);
      onProgress?.(nextResults, Math.round((Date.now() - quizStartedAt) / 1000));
      setFeedback("Move not accepted. Try another continuation.");
      return false;
    }
    const nextAttempts = [...attemptMoves, move.san];
    setAttemptMoves(nextAttempts);
    setLastStudentMove(move.san);
    const studentPly = ply + 1;
    const studentFen = nextGame.fen();
    const studentCorrectLine = parsed.moves.slice(0, studentPly).map((item) => item.san);
    const studentFinished = studentPly >= parsed.moves.length;
    setCorrectLineMoves(studentCorrectLine);
    setGame(nextGame);
    setPosition(studentFen);
    setPly(studentPly);
    setSelectedSquare(null);
    const nextResults: Record<string, LiveBoardQuizResult> = {
      ...results,
      [activeItem.id]: {
        solved: false,
        pending: true,
        mistakes,
        hintsUsed,
        timeTakenSeconds: Math.round((Date.now() - itemStartedAt) / 1000),
        submittedMove: move.san,
        attempts: nextAttempts,
        correctLine: studentCorrectLine,
        currentPly: studentPly,
        currentFen: studentFen,
      },
    };
    setResults(nextResults);
    onProgress?.(nextResults, Math.round((Date.now() - quizStartedAt) / 1000));
    setFeedback(studentFinished ? "Move recorded." : "Move recorded. Updating the reply...");
    window.setTimeout(() => {
      const replyState = applyAutoReply(nextGame, studentPly);
      const replyCorrectLine = parsed.moves.slice(0, replyState.nextPly).map((item) => item.san);
      const replyFen = nextGame.fen();
      setCorrectLineMoves(replyCorrectLine);
      setGame(nextGame);
      setPosition(replyFen);
      setPly(replyState.nextPly);
      const replyResults: Record<string, LiveBoardQuizResult> = {
        ...nextResults,
        [activeItem.id]: {
          ...nextResults[activeItem.id],
          solved: replyState.finished,
          pending: !replyState.finished,
          timeTakenSeconds: Math.round((Date.now() - itemStartedAt) / 1000),
          correctLine: replyCorrectLine,
          currentPly: replyState.nextPly,
          currentFen: replyFen,
        },
      };
      setResults(replyResults);
      onProgress?.(replyResults, Math.round((Date.now() - quizStartedAt) / 1000));
      if (replyState.finished) {
        setSolved(true);
        setFeedback("Answer recorded for this position.");
      } else {
        setFeedback("Continue from the new position.");
      }
    }, 520);
    return true;
  }

  function onDrop(source: string, target: string) {
    return commitQuizMove(source, target);
  }

  function onQuizPromotionPieceSelect(piece?: string, from?: string, to?: string) {
    const promotion = promotionFromBoardPiece(piece);
    const move = from && to ? { from, to } : quizPendingPromotion;
    setQuizPendingPromotion(null);
    if (!promotion || !move) return false;
    return commitQuizMove(move.from, move.to, promotion);
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
      if (isPromotionMove(game, selectedSquare, square)) {
        setQuizPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
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
          <SummaryCard label="Time per Position" value={Number(question.timer?.perQuestionSeconds || activeItem?.timerSeconds || 0) ? `${Number(question.timer?.perQuestionSeconds || activeItem?.timerSeconds || 0)}s` : "No timer"} icon={<Clock size={16} />} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid min-h-0 gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-brand/10 sm:p-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <aside className="order-2 min-w-0 space-y-3 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <div className="text-sm font-bold text-slate-700">Position {Math.min(currentIndex + 1, items.length)} of {items.length}</div>
          <div className="text-xs font-semibold text-slate-500">{activeItem.title || activeItem.pgnTitle || `Board ${currentIndex + 1}`}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800"><Clock size={12} className="mr-1 inline" /> {remaining ? `${remaining}s left` : "No timer"}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${quizFinished ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}>{quizFinished ? "Ready to submit" : "Not submitted"}</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <SummaryCard label="Questions Completed" value={`${summary.completedCount}/${items.length}`} icon={<CheckSquare size={16} />} />
        <SummaryCard label="Questions Remaining" value={summary.remainingCount} icon={<HourglassIcon />} />
        <SummaryCard label="Current Status" value={quizFinished ? "Review answers" : results[activeItem.id] ? "Answered" : "In progress"} icon={<ClipboardList size={16} />} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Quiz Progress</div>
        <div className="flex flex-wrap gap-2">
          {items.map((item: any, index: number) => {
            const itemResult = results[item.id];
            const itemComplete = Boolean(itemResult?.solved || itemResult?.skipped);
            const stateLabel = itemResult?.skipped ? "Skipped" : itemComplete ? "Answered" : "Unanswered";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                  currentIndex === index
                    ? "border-purple-600 bg-purple-700 text-white"
                    : itemComplete
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

      </aside>

      <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Topic</div>
          <div className="truncate text-sm font-bold text-slate-800">{positionTopic}</div>
        </div>
        <span className={`flex-none rounded-full px-3 py-1 text-xs font-black ${startingTurn === "b" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-900"}`}>
          {sideToMoveLabel}
        </span>
      </div>

      <div ref={quizBoardShellRef} className="flex min-w-0 justify-center overflow-hidden rounded-2xl bg-[#31210f] p-2 shadow-inner">
        <div
          className="grid flex-none"
          style={{ gridTemplateColumns: `18px ${quizBoardWidth}px`, gridTemplateRows: `${quizBoardWidth}px 18px` }}
        >
          <div aria-hidden="true" className="grid grid-rows-8 select-none text-[#f0d9b5]">
            {quizRanks.map((rank) => <span key={rank} className="grid place-items-center text-[10px] font-bold leading-none">{rank}</span>)}
          </div>
          <div className="overflow-hidden rounded-md">
            <Chessboard
              position={position}
              boardOrientation={quizOrientation}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick as any}
              onPromotionPieceSelect={onQuizPromotionPieceSelect as any}
              showPromotionDialog={!!quizPendingPromotion}
              promotionToSquare={quizPendingPromotion?.to as any}
              promotionDialogVariant="modal"
              boardWidth={quizBoardWidth}
              showBoardNotation={false}
              customSquareStyles={moveHintStyles as any}
              customDarkSquareStyle={{ backgroundColor: "#b58863" }}
              customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
            />
          </div>
          <div aria-hidden="true" className="col-start-2 grid grid-cols-8 select-none text-[#f0d9b5]">
            {quizFiles.map((file) => <span key={file} className="grid place-items-center text-[10px] font-bold leading-none">{file}</span>)}
          </div>
        </div>
      </div>

      <div className={`mt-2 rounded-xl px-3 py-2 text-sm font-semibold ${feedback.startsWith("Try") || feedback.startsWith("Move not") ? "bg-red-50 text-red-700" : feedback.startsWith("Hint") ? "bg-amber-50 text-amber-700" : solved ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}`}>
        {feedback}
      </div>

      {quizFinished ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Quiz Completed</div>
          <p className="mt-2 text-sm text-slate-600">You have completed all positions. Review your answers and submit when ready.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoTile label="Positions Answered" value={`${summary.completedCount}/${items.length}`} />
            <InfoTile label="Time per Position" value={remaining ? `${Number(question.timer?.perQuestionSeconds || activeItem?.timerSeconds || 0)}s` : "No timer"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white" onClick={() => setSubmitConfirmationOpen(true)}>Submit Quiz</button>
          </div>
        </div>
      ) : (
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700" onClick={skipCurrent}>Skip</button>
      </div>)}
      </div>

      {submitConfirmationOpen && !quizSubmitted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-submit-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckSquare size={24} /></div>
            <h3 id="quiz-submit-title" className="mt-3 text-center text-xl font-black text-slate-950">All positions completed</h3>
            <p className="mt-2 text-center text-sm text-slate-600">You have completed all the positions. Do you want to submit the quiz now?</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSubmitConfirmationOpen(false)} className="h-11 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700">Review answers</button>
              <button type="button" onClick={() => submitQuiz()} className="h-11 rounded-lg bg-purple-700 text-sm font-bold text-white">Yes, submit quiz</button>
            </div>
          </div>
        </div>,
        document.body
      )}
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
  onEndQuiz: (snapshot?: CoachQuizResultsSnapshot) => void;
}) {
  const items = useMemo(
    () => (Array.isArray(question?.items) && question.items.length
      ? question.items
      : [{
          id: `${question?._id || "quiz"}-single`,
          title: question?.title || "Live quiz",
          fen: question?.fen || "start",
          points: question?.scoring?.correct ?? 5,
        }]),
    [question]
  );
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
  const [studentFilter, setStudentFilter] = useState("all");
  const autoEndRequestedRef = useRef(false);
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
  const submitted = submissionRows.filter((row) => row.response?.finalSubmitted).length;
  const solvedCount = submissionRows.filter((row) => row.activeItemResult?.solved).length;
  const skippedCount = submissionRows.filter((row) => row.activeItemResult?.skipped).length;
  const waitingCount = Math.max(0, totalStudents - solvedCount - skippedCount);
  const positionSubmissionRows = submissionRows
    .filter((row) => studentFilter === "all" || String(row.student._id) === studentFilter)
    .flatMap((row) => {
      const itemResults = row.response?.itemResults || {};
      const completedCount = items.filter((item: any) => itemResults[item.id]?.solved || itemResults[item.id]?.skipped).length;
      const inferredActiveIndex = Math.min(items.length - 1, completedCount);
      return items.flatMap((item: any, index: number) => {
        const result = itemResults[item.id];
        const inferredInProgress = Boolean(row.response && !row.response.finalSubmitted && index === inferredActiveIndex && !result);
        if (!result && !inferredInProgress) return [];
        const attempts = Array.isArray(result?.attempts) ? result.attempts : [];
        const submittedMove = String(result?.submittedMove || "").trim();
        const moves = submittedMove && !attempts.includes(submittedMove) ? [...attempts, submittedMove] : attempts;
        const correctLine = Array.isArray(result?.correctLine) && result.correctLine.length
          ? result.correctLine.filter(Boolean)
          : result?.solved && Array.isArray(item.solution)
            ? item.solution.filter(Boolean)
            : [];
        const wrongMoves = moves.filter((move: string) => !correctLine.includes(move));
        const expectedLineLength = Array.isArray(item.solution) ? item.solution.length : 0;
        const basePoints = Number(item.points ?? question?.scoring?.correct ?? 5);
        const hints = Number(result?.hintsUsed || 0);
        const mistakes = Number(result?.mistakes || 0);
        const score = result?.solved
          ? Math.max(0, basePoints - hints * Number(question?.scoring?.hintPenalty || 0))
          : result?.pending
            ? -Number(question?.scoring?.wrongPenalty || 0)
            : 0;
        const status = result?.solved ? "Solved" : result?.skipped ? "Skipped" : result?.pending ? "Attempting" : "In progress";
        return [{ ...row, item, index, result, moves, wrongMoves, correctLine, expectedLineLength, hints, mistakes, score, status }];
      });
    });
  const livePositionRow = [...positionSubmissionRows]
    .filter((row: any) => row.index === effectiveIndex && row.result?.currentFen)
    .sort((a: any, b: any) => new Date(b.response?.updatedAt || b.response?.submittedAt || 0).getTime() - new Date(a.response?.updatedAt || a.response?.submittedAt || 0).getTime())[0];
  const liveBoardPosition = livePositionRow?.result?.currentFen || position;
  const liveBoardLabel = livePositionRow
    ? `${livePositionRow.student.name || livePositionRow.student.username || "Student"} live board`
    : activeItem?.title || "Current position";
  const allStudentsSubmitted = totalStudents > 0 && submitted === totalStudents;
  const timerSeconds = Number(question?.timer?.perQuestionSeconds || activeItem?.timerSeconds || 0);
  const timerResetKey = `${question?._id || "quiz"}-${effectiveIndex}-${question?.updatedAt || question?.launchedAt || ""}`;

  useEffect(() => {
    setCurrentIndex(Math.max(0, manualProgression ? Number(question?.currentItemIndex || 0) : autoSuggestedIndex));
  }, [autoSuggestedIndex, manualProgression, question?.currentItemIndex]);

  useEffect(() => {
    autoEndRequestedRef.current = false;
    setStudentFilter("all");
  }, [question?._id]);

  useEffect(() => {
    if (!allStudentsSubmitted || autoEndRequestedRef.current) return;
    autoEndRequestedRef.current = true;
    onEndQuiz({ question, items, students, responses });
  }, [allStudentsSubmitted, items, onEndQuiz, question, responses, students]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-152px)] min-h-[360px] w-full max-w-[1180px] flex-col gap-3 overflow-hidden">
      <div className="flex flex-none flex-wrap items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-purple-700">Live Quiz</span>
            <h3 className="truncate text-sm font-black text-purple-950 sm:text-base">{question?.title || "Classroom Quiz"}</h3>
          </div>
          <p className="mt-1 truncate text-xs text-purple-800">{question?.instructions || "Students are solving directly on their boards."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-700">
          <span className="rounded-md bg-white px-2 py-1">{submitted}/{totalStudents} submitted</span>
          <span className="rounded-md bg-white px-2 py-1">{solvedCount} solved</span>
          <span className="rounded-md bg-white px-2 py-1">{waitingCount} waiting</span>
          <span className="rounded-md bg-white px-2 py-1"><CountdownValue seconds={timerSeconds} resetKey={timerResetKey} /></span>
          <button
            onClick={() => onUpdateProgression({ progressionMode: manualProgression ? "auto" : "manual", currentItemIndex: effectiveIndex })}
            className={`h-8 rounded-md px-3 text-xs font-bold ${manualProgression ? "bg-slate-900 text-white" : "border border-purple-200 bg-white text-purple-800"}`}
          >
            {manualProgression ? "Manual on" : "Manual"}
          </button>
          <button onClick={() => onEndQuiz({ question, items, students, responses })} className="h-8 rounded-md bg-purple-700 px-3 text-xs font-bold text-white">End Quiz</button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="h-fit rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-700">Current position</div>
            {items.length > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!manualProgression}
                  onClick={() => {
                    const nextIndex = Math.max(0, effectiveIndex - 1);
                    if (manualProgression) onUpdateProgression({ currentItemIndex: nextIndex });
                  }}
                  className={`grid h-7 w-7 place-items-center rounded-md border ${manualProgression ? "border-slate-200 bg-white text-slate-700" : "border-slate-100 bg-slate-50 text-slate-300"}`}
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
                  className={`grid h-7 w-7 place-items-center rounded-md border ${manualProgression ? "border-slate-200 bg-white text-slate-700" : "border-slate-100 bg-slate-50 text-slate-300"}`}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : null}
          </div>
          <div className="mx-auto w-fit overflow-hidden rounded-md border border-slate-200">
            <Chessboard
              position={liveBoardPosition}
              boardWidth={260}
              arePiecesDraggable={false}
              showBoardNotation={false}
              customDarkSquareStyle={{ backgroundColor: "#b58863" }}
              customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
            />
          </div>
          <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
            {liveBoardLabel} - {activeItem?.points || question?.scoring?.correct || 5} pts
          </div>
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <InfoTile label="Mode" value={manualProgression ? "Coach-controlled" : "Auto progression"} />
            <InfoTile label="Question" value={`${effectiveIndex + 1} of ${items.length}`} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex flex-none flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-700">Student submissions by position</div>
              <div className="text-xs text-slate-500">A new entry appears as each student starts the next PGN.</div>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="live-quiz-student-filter" className="text-xs font-bold text-slate-500">Student</label>
              <select
                id="live-quiz-student-filter"
                value={studentFilter}
                onChange={(event) => setStudentFilter(event.target.value)}
                className="h-9 max-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All students ({students.length})</option>
                {students.map((student: any) => <option key={student._id} value={student._id}>{student.name || student.username || "Student"}</option>)}
              </select>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-2 overflow-y-auto overscroll-contain pr-2 lg:grid-cols-2 2xl:grid-cols-3">
            {positionSubmissionRows.map((row: any) => {
              const updatedAt = row.response?.updatedAt || row.response?.submittedAt;
              const correctNotation = formatNumberedNotation(row.correctLine, row.item?.fen || question?.fen || "start");
            return (
                <div key={`${row.student._id}-${row.item.id}`} className="min-h-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-950">{row.student.name || "Student"}</div>
                      <div className="truncate text-xs text-slate-500">{row.student.username || row.student.email || ""}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1 text-[10px] font-black">
                      <span className="rounded bg-white px-2 py-1 text-slate-600">P{row.index + 1}</span>
                      <span className={`rounded px-2 py-1 ${row.status === "Solved" ? "bg-emerald-100 text-emerald-700" : row.status === "Skipped" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{row.status}</span>
                      <span className="rounded bg-purple-100 px-2 py-1 text-purple-700">{row.score} pts</span>
                    </div>
                  </div>
                  <div className="mt-2 rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-700">
                    {row.item.title || row.item.pgnTitle || `Position ${row.index + 1}`}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <InfoTile label="Time" value={`${Number(row.result?.timeTakenSeconds || 0)} sec`} />
                    <InfoTile label="Progress" value={`${row.correctLine.length}/${row.expectedLineLength || "-"}`} />
                    <InfoTile label="Mistakes" value={row.mistakes} />
                    <InfoTile label="Hints" value={row.hints} />
                  </div>
                  <div className="mt-2 space-y-1 break-words rounded-md border border-slate-200 bg-white p-2 text-[11px] leading-4 text-slate-600">
                    <div><span className="font-bold text-slate-700">Latest correct move:</span> {row.correctLine.at(-1) || (row.status === "Solved" ? row.result?.submittedMove : "-")}</div>
                    <div><span className="font-bold text-slate-700">Correct notation:</span> {correctNotation || "No correct move yet"}</div>
                    <div><span className="font-bold text-slate-700">Wrong attempts:</span> {row.wrongMoves.length ? row.wrongMoves.join(", ") : "No wrong move recorded"}</div>
                    <div><span className="font-bold text-slate-700">Student status:</span> {row.response?.finalSubmitted ? "Quiz submitted" : "Quiz in progress"}</div>
                    <div><span className="font-bold text-slate-700">Last update:</span> {updatedAt ? new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "-"}</div>
                  </div>
                </div>
              );
            })}
            {!positionSubmissionRows.length && (
              <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No recorded attempts for {studentFilter === "all" ? "the class" : "this student"} yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachQuizResultsDialog({ snapshot, onClose }: { snapshot: CoachQuizResultsSnapshot; onClose: () => void }) {
  const [studentFilter, setStudentFilter] = useState("all");
  const responseByStudent = new Map<string, any>();
  for (const response of snapshot.responses || []) {
    const studentId = String(response.student?._id || response.student || "");
    if (studentId) responseByStudent.set(studentId, response);
  }
  const visibleStudents = (snapshot.students || []).filter((student: any) => studentFilter === "all" || String(student._id) === studentFilter);
  const submittedCount = (snapshot.students || []).filter((student: any) => responseByStudent.get(String(student._id))?.finalSubmitted).length;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="coach-quiz-results-title" onMouseDown={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex flex-none flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Quiz ended</div>
            <h3 id="coach-quiz-results-title" className="mt-1 text-xl font-black text-slate-950">{snapshot.question?.title || "Classroom quiz"} results</h3>
            <p className="mt-1 text-sm text-slate-500">{submittedCount}/{snapshot.students.length} students submitted all {snapshot.items.length} positions.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 flex-none place-items-center rounded-md border border-slate-200" aria-label="Close quiz results"><X size={16} /></button>
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-sm font-bold text-slate-700">Student result details</div>
          <div className="flex items-center gap-2">
            <label htmlFor="quiz-results-student-filter" className="text-xs font-bold text-slate-500">Student</label>
            <select
              id="quiz-results-student-filter"
              value={studentFilter}
              onChange={(event) => setStudentFilter(event.target.value)}
              className="h-9 max-w-[240px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
            >
              <option value="all">All students ({snapshot.students.length})</option>
              {snapshot.students.map((student: any) => <option key={student._id} value={student._id}>{student.name || student.username || "Student"}</option>)}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {visibleStudents.map((student: any) => {
            const response = responseByStudent.get(String(student._id));
            const itemResults = response?.itemResults || {};
            const completed = snapshot.items.filter((item: any) => itemResults[item.id]?.solved || itemResults[item.id]?.skipped).length;
            const solved = snapshot.items.filter((item: any) => itemResults[item.id]?.solved).length;
            return (
              <section key={student._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-slate-950">{student.name || "Student"}</div>
                    <div className="text-xs text-slate-500">{student.username || student.email || ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-black">
                    <span className={`rounded px-2 py-1 ${response?.finalSubmitted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{response?.finalSubmitted ? "Submitted" : "Incomplete"}</span>
                    <span className="rounded bg-white px-2 py-1 text-slate-700">{completed}/{snapshot.items.length} answered</span>
                    <span className="rounded bg-white px-2 py-1 text-slate-700">{solved} solved</span>
                    <span className="rounded bg-purple-100 px-2 py-1 text-purple-700">{Number(response?.score || 0)} pts</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <InfoTile label="Attempts" value={Number(response?.attemptsUsed || 0)} />
                  <InfoTile label="Hints" value={Number(response?.hintsUsed || 0)} />
                  <InfoTile label="Submitted" value={response?.submittedAt ? new Date(response.submittedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "-"} />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {snapshot.items.map((item: any, index: number) => {
                    const result = itemResults[item.id];
                    const attempts = Array.isArray(result?.attempts) ? result.attempts : [];
                    const submittedMove = String(result?.submittedMove || "").trim();
                    const moves = submittedMove && !attempts.includes(submittedMove) ? [...attempts, submittedMove] : attempts;
                    const correctLine = Array.isArray(result?.correctLine) && result.correctLine.length
                      ? result.correctLine.filter(Boolean)
                      : result?.solved && Array.isArray(item.solution)
                        ? item.solution.filter(Boolean)
                        : [];
                    const wrongMoves = moves.filter((move: string) => !correctLine.includes(move));
                    const status = result?.solved ? "Solved" : result?.skipped ? "Skipped" : result?.pending ? "Attempted" : "Not answered";
                    const correctNotation = formatNumberedNotation(correctLine, item?.fen || snapshot.question?.fen || "start");
                    return (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-black text-purple-700">Position {index + 1}</div>
                            <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-700">{item.title || item.pgnTitle || `Position ${index + 1}`}</div>
                          </div>
                          <span className={`flex-none rounded px-2 py-1 text-[10px] font-black ${result?.solved ? "bg-emerald-100 text-emerald-700" : result?.skipped ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{status}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                          <div>Time: <b>{Number(result?.timeTakenSeconds || 0)}s</b></div>
                          <div>Mistakes: <b>{Number(result?.mistakes || 0)}</b></div>
                          <div>Hints: <b>{Number(result?.hintsUsed || 0)}</b></div>
                          <div>Progress: <b>{correctLine.length}/{Array.isArray(item.solution) ? item.solution.length : "-"}</b></div>
                        </div>
                        <div className="mt-2 space-y-1 break-words rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                          <div><b>Correct notation:</b> {correctNotation || "No correct move"}</div>
                          <div><b>Wrong attempts:</b> {wrongMoves.length ? wrongMoves.join(", ") : "No wrong move"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
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
                {gamifiedObjectIcon(object.id, object.icon)}
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
                {gamifiedObjectIcon(object.id, object.icon)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
