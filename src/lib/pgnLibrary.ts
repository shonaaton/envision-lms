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
  const starts = Array.from(normalized.matchAll(/(^|\n)\s*(?=\[Event\s+")/g)).map((match) => match.index + match[1].length);
  if (starts.length <= 1) return [normalized];
  return starts.map((start, index) => normalized.slice(start, starts[index + 1]).trim()).filter(Boolean);
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

export function summarizePgn(pgn: string, fallbackTitle = "Untitled PGN"): PgnSummary {
  const game = new Chess();
  const fenHeader = extractHeader(pgn, "FEN");
  let moveCount = 0;
  let initialFen = fenHeader || chessStartFen;
  let finalFen = initialFen;

  try {
    game.loadPgn(pgn);
    const history = game.history({ verbose: true }) as Array<{ before?: string }>;
    moveCount = Math.ceil(history.length / 2);
    initialFen = history[0]?.before || fenHeader || chessStartFen;
    finalFen = game.fen();
  } catch {
    if (fenHeader) {
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
    try {
      new Chess(fen);
      return true;
    } catch {
      return false;
    }
  }
}
