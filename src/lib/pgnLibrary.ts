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

export type PgnMoveNote = {
  comments: string[];
  glyphs: string[];
  variations: string[];
};

export type ParsedPgnNotes = {
  intro: PgnMoveNote;
  moves: Record<number, PgnMoveNote>;
};

type PgnMovetextToken = {
  kind: "text" | "comment" | "variation";
  value: string;
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

function tokenizeMainlinePgn(pgn: string): PgnMovetextToken[] {
  const body = pgn.replace(/^\s*\[[^\r\n]*\]\s*$/gm, " ");
  const tokens: PgnMovetextToken[] = [];
  let current = "";

  function flushText() {
    const value = current.trim();
    if (value) tokens.push({ kind: "text", value });
    current = "";
  }

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (/\s/.test(char)) {
      flushText();
      continue;
    }
    if (char === "{") {
      flushText();
      const end = body.indexOf("}", index + 1);
      const finalIndex = end >= 0 ? end : body.length - 1;
      const value = body.slice(index + 1, finalIndex).trim();
      if (value) tokens.push({ kind: "comment", value });
      index = finalIndex;
      continue;
    }
    if (char === ";") {
      flushText();
      const newline = body.indexOf("\n", index + 1);
      const finalIndex = newline >= 0 ? newline : body.length;
      const value = body.slice(index + 1, finalIndex).trim();
      if (value) tokens.push({ kind: "comment", value });
      index = finalIndex;
      continue;
    }
    if (char === "(") {
      flushText();
      let depth = 1;
      let cursor = index + 1;
      let inBraceComment = false;
      let inLineComment = false;
      for (; cursor < body.length && depth > 0; cursor += 1) {
        const variationChar = body[cursor];
        if (inBraceComment) {
          if (variationChar === "}") inBraceComment = false;
          continue;
        }
        if (inLineComment) {
          if (variationChar === "\n" || variationChar === "\r") inLineComment = false;
          continue;
        }
        if (variationChar === "{") inBraceComment = true;
        else if (variationChar === ";") inLineComment = true;
        else if (variationChar === "(") depth += 1;
        else if (variationChar === ")") depth -= 1;
      }
      const finalIndex = depth === 0 ? cursor - 1 : body.length;
      const value = body.slice(index + 1, finalIndex).trim().replace(/\s+/g, " ");
      if (value) tokens.push({ kind: "variation", value });
      index = finalIndex;
      continue;
    }
    current += char;
  }
  flushText();
  return tokens;
}

function emptyPgnMoveNote(): PgnMoveNote {
  return { comments: [], glyphs: [], variations: [] };
}

function nagLabel(value: string) {
  return ({ "1": "!", "2": "?", "3": "!!", "4": "??", "5": "!?", "6": "?!" } as Record<string, string>)[value] || `$${value}`;
}

export function parsePgnNotes(pgn?: string | null, moveCount = Number.POSITIVE_INFINITY): ParsedPgnNotes {
  const result: ParsedPgnNotes = { intro: emptyPgnMoveNote(), moves: {} };
  if (!pgn?.trim()) return result;
  let moveIndex = -1;

  function currentNote() {
    if (moveIndex < 0) return result.intro;
    result.moves[moveIndex] ||= emptyPgnMoveNote();
    return result.moves[moveIndex];
  }

  tokenizeMainlinePgn(pgn).forEach((token) => {
    if (token.kind === "comment") {
      currentNote().comments.push(token.value);
      return;
    }
    if (token.kind === "variation") {
      currentNote().variations.push(token.value);
      return;
    }

    const nags = Array.from(token.value.matchAll(/\$(\d+)/g)).map((match) => nagLabel(match[1]));
    let moveToken = token.value
      .replace(/\$\d+/g, "")
      .replace(/^\d+\.(?:\.\.)?/, "")
      .trim();
    if (!moveToken || /^\.+$/.test(moveToken)) {
      currentNote().glyphs.push(...nags);
      return;
    }
    if (/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(moveToken)) return;

    const symbolicGlyph = moveToken.match(/([!?]{1,2})$/)?.[1];
    if (symbolicGlyph) moveToken = moveToken.slice(0, -symbolicGlyph.length);
    if (!moveToken) {
      if (symbolicGlyph) currentNote().glyphs.push(symbolicGlyph);
      currentNote().glyphs.push(...nags);
      return;
    }
    if (moveIndex + 1 >= moveCount) return;
    moveIndex += 1;
    const note = currentNote();
    if (symbolicGlyph) note.glyphs.push(symbolicGlyph);
    note.glyphs.push(...nags);
  });

  return result;
}

const naturalPgnCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function sortPgnCollection<T extends { title?: string; round?: string | number }>(items: T[]) {
  return [...items].sort((left, right) => {
    const titleOrder = naturalPgnCollator.compare(String(left.title || ""), String(right.title || ""));
    if (titleOrder) return titleOrder;
    return naturalPgnCollator.compare(String(left.round || ""), String(right.round || ""));
  });
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
