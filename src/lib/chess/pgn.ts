import crypto from "crypto";
import type { ChessColor, ChessResult, TimeControlCategory } from "./types";

const HEADER_PATTERN = /^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/;

export function parsePgnHeaders(pgn: string) {
  const headers: Record<string, string> = {};
  const moveLines: string[] = [];
  for (const rawLine of pgn.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(HEADER_PATTERN);
    if (match) headers[match[1]] = match[2].replace(/\\"/g, "\"");
    else if (!line.startsWith("[")) moveLines.push(line);
  }
  return { headers, moves: moveLines.join(" ").replace(/\s+/g, " ").trim() };
}

export function splitPgnGames(pgn: string) {
  return pgn
    .replace(/\r\n/g, "\n")
    .split(/\n(?=\[Event\s+")/g)
    .map((game) => game.trim())
    .filter(Boolean);
}

export function parsePgnDate(headers: Record<string, string>) {
  const rawDate = headers.UTCDate || headers.Date;
  if (!rawDate || rawDate.includes("?")) return new Date();
  const [year, month, day] = rawDate.split(".").map(Number);
  const rawTime = headers.UTCTime || headers.Time || "00:00:00";
  const [hour = 0, minute = 0, second = 0] = rawTime.split(":").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

export function normalizeTimeControl(timeControl?: string): TimeControlCategory {
  if (!timeControl || timeControl === "-") return "unknown";
  const normalized = timeControl.toLowerCase();
  if (normalized.includes("correspondence") || normalized.includes("/")) return "correspondence";
  const base = Number(normalized.split(/[+|/]/)[0]);
  if (!Number.isFinite(base)) return "unknown";
  if (base < 30) return "ultrabullet";
  if (base < 180) return "bullet";
  if (base < 600) return "blitz";
  if (base < 1800) return "rapid";
  return "classical";
}

export function resultForPlayer(result: string | undefined, color: ChessColor): ChessResult {
  if (result === "1-0") return color === "white" ? "win" : "loss";
  if (result === "0-1") return color === "black" ? "win" : "loss";
  return "draw";
}

export function createGameHash(input: {
  platform?: string;
  platformGameId?: string;
  headers?: Record<string, string>;
  moves?: string;
  pgn?: string;
}) {
  if (input.platform && input.platformGameId) return sha256(`${input.platform}:${input.platformGameId}`);
  const headers = input.headers || parsePgnHeaders(input.pgn || "").headers;
  const moves = input.moves ?? parsePgnHeaders(input.pgn || "").moves;
  return sha256([
    headers.Date || headers.UTCDate || "",
    headers.White || "",
    headers.Black || "",
    headers.Result || "",
    moves.replace(/\s+/g, " ").slice(0, 240),
  ].join("|").toLowerCase());
}

export function inferMoveCount(moves: string) {
  const stripped = moves
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ");
  return stripped.split(/\d+\.(?:\.\.)?/g).filter((part) => part.trim()).length;
}

export function parseGameFromPgn(pgn: string, username: string, platform: "CHESS_COM" | "LICHESS", platformGameId?: string) {
  const { headers, moves } = parsePgnHeaders(pgn);
  const white = headers.White;
  const black = headers.Black;
  if (!white || !black) return null;
  const normalizedUser = username.toLowerCase();
  const color: ChessColor | null = white.toLowerCase() === normalizedUser ? "white" : black.toLowerCase() === normalizedUser ? "black" : null;
  if (!color) return null;
  const whiteRating = numberFrom(headers.WhiteElo || headers.WhiteRating);
  const blackRating = numberFrom(headers.BlackElo || headers.BlackRating);
  const studentRating = color === "white" ? whiteRating : blackRating;
  const opponentRating = color === "white" ? blackRating : whiteRating;
  return {
    platform,
    platformGameId,
    playedAt: parsePgnDate(headers),
    whiteUsername: white,
    blackUsername: black,
    whiteRating,
    blackRating,
    studentColor: color,
    studentRating,
    opponentUsername: color === "white" ? black : white,
    opponentRating,
    ratingChange: numberFrom(color === "white" ? headers.WhiteRatingDiff : headers.BlackRatingDiff),
    result: resultForPlayer(headers.Result, color),
    termination: headers.Termination,
    timeControl: headers.TimeControl,
    timeControlCategory: normalizeTimeControl(headers.TimeControl),
    rated: String(headers.Rated || "").toLowerCase() === "true",
    opening: headers.Opening,
    eco: headers.ECO,
    pgn,
    gameUrl: headers.Site,
    gameHash: createGameHash({ platform, platformGameId, headers, moves }),
    moveCount: inferMoveCount(moves),
  };
}

function numberFrom(value?: string | number) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
