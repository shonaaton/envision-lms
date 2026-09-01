import type { ChessPlatform, ChessPlatformProvider, GameFetchOptions, NormalizedGame, PlatformProfile, PlatformRating } from "./types";
import { parseGameFromPgn } from "./pgn";

const CHESS_COM_BASE = "https://api.chess.com/pub/player";
const LICHESS_BASE = "https://lichess.org/api";
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = "EnvisionChessAcademyLMS/1.0";

export class ChessProviderError extends Error {
  status?: number;
  retryAfterMs?: number;
  constructor(message: string, options?: { status?: number; retryAfterMs?: number }) {
    super(message);
    this.name = "ChessProviderError";
    this.status = options?.status;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export class ChessComProvider implements ChessPlatformProvider {
  async validateUsername(username: string) {
    const response = await fetchWithTimeout(`${CHESS_COM_BASE}/${encodeURIComponent(normalizeUsername(username))}`, { method: "GET" });
    return response.ok;
  }

  async getProfile(username: string): Promise<PlatformProfile> {
    const response = await fetchJson(`${CHESS_COM_BASE}/${encodeURIComponent(normalizeUsername(username))}`);
    return {
      platformUserId: String(response.player_id || response.uuid || normalizeUsername(username)),
      username: String(response.username || username),
      displayName: response.name ? String(response.name) : undefined,
    };
  }

  async getRatings(username: string): Promise<PlatformRating[]> {
    const data = await fetchJson(`${CHESS_COM_BASE}/${encodeURIComponent(normalizeUsername(username))}/stats`);
    const now = new Date();
    return [
      ratingFromChessCom(data.chess_rapid, "rapid", now),
      ratingFromChessCom(data.chess_blitz, "blitz", now),
      ratingFromChessCom(data.chess_bullet, "bullet", now),
      ratingFromChessCom(data.chess_daily, "correspondence", now),
    ].filter(Boolean) as PlatformRating[];
  }

  async getGames(username: string, options?: GameFetchOptions): Promise<NormalizedGame[]> {
    const archiveData = await fetchJson(`${CHESS_COM_BASE}/${encodeURIComponent(normalizeUsername(username))}/games/archives`);
    const archives: string[] = Array.isArray(archiveData.archives) ? archiveData.archives.map((archive: unknown) => String(archive)) : [];
    const sinceMonth = options?.since ? `${options.since.getUTCFullYear()}-${String(options.since.getUTCMonth() + 1).padStart(2, "0")}` : null;
    const filtered = archives.filter((archive: string) => {
      if (!sinceMonth) return true;
      const match = archive.match(/\/games\/(\d{4})\/(\d{2})$/);
      return !match || `${match[1]}-${match[2]}` >= sinceMonth;
    });

    const games: NormalizedGame[] = [];
    for (const archiveUrl of filtered) {
      await delay(500);
      const archive = await fetchJson(archiveUrl);
      for (const game of Array.isArray(archive.games) ? archive.games : []) {
        if (!game?.pgn) continue;
        const parsed = parseGameFromPgn(String(game.pgn), username, "CHESS_COM", game.uuid || game.url);
        if (!parsed) continue;
        games.push({
          ...parsed,
          platformGameId: game.uuid ? String(game.uuid) : parsed.platformGameId,
          gameUrl: game.url ? String(game.url) : parsed.gameUrl,
          rated: Boolean(game.rated ?? parsed.rated),
          timeControl: game.time_control ? String(game.time_control) : parsed.timeControl,
        });
        if (options?.maxGames && games.length >= options.maxGames) return games;
      }
    }
    return games.filter((game) => !options?.since || game.playedAt >= options.since);
  }
}

export class LichessProvider implements ChessPlatformProvider {
  async validateUsername(username: string) {
    const response = await fetchWithTimeout(`${LICHESS_BASE}/user/${encodeURIComponent(username)}`, { method: "GET" });
    return response.ok;
  }

  async getProfile(username: string): Promise<PlatformProfile> {
    const data = await fetchJson(`${LICHESS_BASE}/user/${encodeURIComponent(username)}`);
    return {
      platformUserId: String(data.id || username),
      username: String(data.username || username),
      displayName: String(data.title ? `${data.title} ${data.username}` : data.username || username),
    };
  }

  async getRatings(username: string): Promise<PlatformRating[]> {
    const data = await fetchJson(`${LICHESS_BASE}/user/${encodeURIComponent(username)}`);
    const now = new Date();
    const perfs = data.perfs || {};
    return [
      ratingFromLichess(perfs.rapid, "rapid", now),
      ratingFromLichess(perfs.blitz, "blitz", now),
      ratingFromLichess(perfs.bullet, "bullet", now),
      ratingFromLichess(perfs.classical, "classical", now),
      ratingFromLichess(perfs.correspondence, "correspondence", now),
    ].filter(Boolean) as PlatformRating[];
  }

  async getGames(username: string, options?: GameFetchOptions): Promise<NormalizedGame[]> {
    const params = new URLSearchParams({
      moves: "true",
      tags: "true",
      clocks: "false",
      evals: "false",
      opening: "true",
      pgnInJson: "false",
      sort: "dateAsc",
    });
    if (options?.since) params.set("since", String(options.since.getTime()));
    if (options?.maxGames) params.set("max", String(options.maxGames));
    const response = await fetchWithRetry(`${LICHESS_BASE}/games/user/${encodeURIComponent(username)}?${params.toString()}`, {
      headers: { Accept: "application/x-chess-pgn" },
      timeoutMs: 120_000,
    });
    const pgnText = await response.text();
    const games = pgnText
      .split(/\n\n(?=\[Event\s+")/g)
      .map((pgn) => parseGameFromPgn(pgn, username, "LICHESS"))
      .filter((game): game is NonNullable<ReturnType<typeof parseGameFromPgn>> => Boolean(game))
      .filter((game) => !options?.since || game.playedAt >= options.since);
    return games;
  }
}

export function getChessProvider(platform: ChessPlatform): ChessPlatformProvider {
  return platform === "CHESS_COM" ? new ChessComProvider() : new LichessProvider();
}

function ratingFromChessCom(perf: any, ratingType: PlatformRating["ratingType"], recordedAt: Date) {
  const rating = Number(perf?.last?.rating);
  return Number.isFinite(rating) ? { ratingType, rating, recordedAt } : null;
}

function ratingFromLichess(perf: any, ratingType: PlatformRating["ratingType"], recordedAt: Date) {
  const rating = Number(perf?.rating);
  return Number.isFinite(rating) ? { ratingType, rating, recordedAt } : null;
}

async function fetchJson(url: string) {
  const response = await fetchWithRetry(url);
  return response.json();
}

async function fetchWithRetry(url: string, options?: { method?: string; headers?: Record<string, string>; timeoutMs?: number }) {
  let backoff = 2_000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchWithTimeout(url, { method: options?.method || "GET", headers: options?.headers, timeoutMs: options?.timeoutMs });
    if (response.ok) return response;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : backoff);
      backoff = Math.min(backoff * 2, 60_000);
      continue;
    }
    if (response.status === 404) throw new ChessProviderError("Chess account was not found.", { status: 404 });
    throw new ChessProviderError(`Chess platform request failed with status ${response.status}.`, { status: response.status });
  }
  throw new ChessProviderError("Chess platform request failed after retries.");
}

async function fetchWithTimeout(url: string, options?: { method?: string; headers?: Record<string, string>; timeoutMs?: number }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: options?.method || "GET",
      headers: {
        "User-Agent": USER_AGENT,
        ...(options?.headers || {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new ChessProviderError(error instanceof Error && error.name === "AbortError" ? "Chess platform request timed out." : "Chess platform request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
