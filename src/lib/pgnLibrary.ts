import { Chess } from "chess.js";

export type PgnSummary = {
  title: string;
  white?: string;
  black?: string;
  event?: string;
  site?: string;
  round?: string;
  result?: string;
  eco?: string;
  opening?: string;
  date?: string;
  whiteElo?: number;
  blackElo?: number;
  moveCount: number;
  initialFen: string;
  finalFen: string;
  sideToMove: "white" | "black";
  hasAnnotations: boolean;
  hasVariations: boolean;
  commentsText?: string;
};

export const startFen = "rnbqkbnr/pppppppp/8/8/8/8/8/8 w - - 0 1";
export const chessStartFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function normalizeFolderPath(value?: string | null) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

export function folderLabel(path: string) {
  const normalized = normalizeFolderPath(path);
  return normalized.split("/").filter(Boolean).pop() || normalized || "Unfiled";
}

export function parentFolderPath(path?: string | null) {
  const normalized = normalizeFolderPath(path);
  if (!normalized.includes("/")) return "";
  return normalized.split("/").slice(0, -1).join("/");
}

export function getImmediateChildPath(basePath: string, candidatePath: string) {
  const base = normalizeFolderPath(basePath);
  const candidate = normalizeFolderPath(candidatePath);
  if (!candidate) return "";
  if (!base) return candidate.includes("/") ? candidate.split("/")[0] : candidate;
  if (candidate === base || !candidate.startsWith(`${base}/`)) return "";
  const rest = candidate.slice(base.length + 1);
  return `${base}/${rest.split("/")[0]}`;
}

export function folderBreadcrumbs(path: string) {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean);
  return parts.map((part, index) => ({
    id: parts.slice(0, index + 1).join("/"),
    name: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

export function extractHeader(pgn: string, key: string): string | undefined {
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return match?.[1]?.trim() || undefined;
}

export function splitPgnGames(pgn: string) {
  const normalized = pgn.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const eventStarts = Array.from(normalized.matchAll(/(^|\n)\s*(?=\[Event\s+")/g)).map((match) => match.index + match[1].length);
  const fenStarts = Array.from(normalized.matchAll(/(^|\n)\s*(?=\[FEN\s+")/g)).map((match) => match.index + match[1].length);
  const setupStarts = Array.from(normalized.matchAll(/(^|\n)\s*(?=\[SetUp\s+")/g)).map((match) => match.index + match[1].length);
  const starts = eventStarts.length > 1
    ? eventStarts
    : fenStarts.length > 1
      ? fenStarts
      : setupStarts.length > 1
        ? setupStarts
        : [];
  if (starts.length <= 1) return [normalized];
  return starts.map((start, index) => normalized.slice(start, starts[index + 1]).trim()).filter(Boolean);
}

export function invalidPgnIndexes(games: string[]) {
  return games.reduce((indexes, game, index) => {
    if (!isValidPgnOrFenSetup(game)) indexes.push(index + 1);
    return indexes;
  }, [] as number[]);
}

function numberHeader(pgn: string, key: string) {
  const value = Number(extractHeader(pgn, key));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function commentsFromPgn(pgn: string) {
  const comments = Array.from(pgn.matchAll(/\{([^}]*)\}/g)).map((match) => match[1].trim()).filter(Boolean);
  return comments.join("\n").slice(0, 4000) || undefined;
}

export function sideToMoveFromFen(fen?: string | null): "white" | "black" {
  return String(fen || "").split(/\s+/)[1] === "b" ? "black" : "white";
}

export function normalizePermissiveFen(value?: string | null) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  const board = parts[0] || "";
  const ranks = board.split("/");
  if (ranks.length !== 8) return "";
  const validBoard = ranks.every((rank) => {
    let count = 0;
    for (const char of rank) {
      if (/^[1-8]$/.test(char)) count += Number(char);
      else if (/^[pnbrqkPNBRQK]$/.test(char)) count += 1;
      else return false;
    }
    return count === 8;
  });
  if (!validBoard) return "";

  const turn = parts[1] === "b" ? "b" : "w";
  const castling = parts[2] && /^(-|[KQkq]+)$/.test(parts[2]) ? parts[2] : "-";
  const enPassant = parts[3] && /^(-|[a-h][36])$/.test(parts[3]) ? parts[3] : "-";
  const halfMove = parts[4] && /^\d+$/.test(parts[4]) ? parts[4] : "0";
  const fullMove = parts[5] && /^[1-9]\d*$/.test(parts[5]) ? parts[5] : "1";
  return `${board} ${turn} ${castling} ${enPassant} ${halfMove} ${fullMove}`;
}

export function summarizePgn(pgn: string, fallbackTitle = "Untitled PGN"): PgnSummary {
  const game = new Chess();
  const fenHeader = extractHeader(pgn, "FEN");
  let moveCount = 0;
  let initialFen = normalizePermissiveFen(fenHeader) || fenHeader || chessStartFen;
  let finalFen = initialFen;

  try {
    game.loadPgn(pgn);
    const history = game.history({ verbose: true }) as Array<{ before?: string }>;
    moveCount = Math.ceil(history.length / 2);
    initialFen = history[0]?.before || fenHeader || chessStartFen;
    finalFen = game.fen();
  } catch {
    const permissiveFen = normalizePermissiveFen(fenHeader);
    if (permissiveFen) {
      initialFen = permissiveFen;
      finalFen = permissiveFen;
    } else if (fenHeader) {
      try {
        const fenGame = new Chess(fenHeader);
        initialFen = fenGame.fen();
        finalFen = fenGame.fen();
      } catch {
        initialFen = chessStartFen;
        finalFen = chessStartFen;
      }
    }
  }

  const event = extractHeader(pgn, "Event");
  const white = extractHeader(pgn, "White");
  const black = extractHeader(pgn, "Black");
  const opening = extractHeader(pgn, "Opening") || extractHeader(pgn, "Variation");
  const title = [white, black].filter(Boolean).length === 2
    ? `${white} vs ${black}`
    : event || fallbackTitle;

  return {
    title,
    white,
    black,
    event,
    site: extractHeader(pgn, "Site"),
    round: extractHeader(pgn, "Round"),
    result: extractHeader(pgn, "Result") || "*",
    eco: extractHeader(pgn, "ECO"),
    opening,
    date: extractHeader(pgn, "Date"),
    whiteElo: numberHeader(pgn, "WhiteElo"),
    blackElo: numberHeader(pgn, "BlackElo"),
    moveCount,
    initialFen,
    finalFen,
    sideToMove: sideToMoveFromFen(initialFen),
    hasAnnotations: /\{[^}]+\}|\$\d+|!|\?/.test(pgn),
    hasVariations: /\([^)]*\d+\./.test(pgn),
    commentsText: commentsFromPgn(pgn),
  };
}

export function isValidPgnOrFenSetup(pgn: string) {
  try {
    new Chess().loadPgn(pgn);
    return true;
  } catch {
    const fen = extractHeader(pgn, "FEN");
    if (!fen) return false;
    if (normalizePermissiveFen(fen)) return true;
    try {
      new Chess(fen);
      return true;
    } catch {
      return false;
    }
  }
}
