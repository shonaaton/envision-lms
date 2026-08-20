import { createHmac, timingSafeEqual } from "crypto";
import type { cookies as cookiesFn } from "next/headers";

export const TOURNAMENT_GUEST_COOKIE_PREFIX = "lms_tournament_guest_";
const TOURNAMENT_GUEST_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type TournamentGuestSession = {
  username: string;
  tournamentToken: string;
  issuedAt: number;
  expiresAt: number;
};

export function normalizeTournamentGuestUsername(username: string) {
  return String(username || "").trim();
}

export function tournamentGuestCookieName(token: string) {
  return `${TOURNAMENT_GUEST_COOKIE_PREFIX}${String(token || "").trim()}`;
}

type CookieStore = Awaited<ReturnType<typeof cookiesFn>>;

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function guestSessionSecret() {
  const secret = String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? "" : "development-tournament-guest-secret";
}

function signGuestSession(payload: string) {
  const secret = guestSessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeGuestSession(session: TournamentGuestSession) {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = signGuestSession(payload);
  if (!signature) return "";
  return `${payload}.${signature}`;
}

function decodeGuestSession(rawValue: string, token: string) {
  const [payload, signature] = String(rawValue || "").split(".");
  if (!payload || !signature) return null;
  const expected = signGuestSession(payload);
  if (!expected) return null;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as TournamentGuestSession;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.tournamentToken !== token) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    const username = normalizeTournamentGuestUsername(parsed.username);
    if (!username) return null;
    return { ...parsed, username };
  } catch {
    return null;
  }
}

function parseCookieValue(cookieHeader: string, name: string) {
  const cookies = String(cookieHeader || "").split(";");
  for (const entry of cookies) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(trimmed.slice(separator + 1));
  }
  return "";
}

export function getTournamentGuestSession(store: CookieStore, token: string) {
  return decodeGuestSession(store.get(tournamentGuestCookieName(token))?.value || "", token);
}

export function getTournamentGuestSessionFromCookieHeader(cookieHeader: string, token: string) {
  return decodeGuestSession(parseCookieValue(cookieHeader, tournamentGuestCookieName(token)), token);
}

export function getTournamentGuestUsername(store: CookieStore, token: string) {
  return getTournamentGuestSession(store, token)?.username || "";
}

export function setTournamentGuestUsername(store: CookieStore, token: string, username: string, options?: { expiresAt?: Date | number | string | null }) {
  const normalizedUsername = normalizeTournamentGuestUsername(username);
  if (!normalizedUsername) return;
  const requestedExpiry = options?.expiresAt ? new Date(options.expiresAt).getTime() : 0;
  const expiresAt = Math.min(
    requestedExpiry && Number.isFinite(requestedExpiry) ? requestedExpiry : Date.now() + TOURNAMENT_GUEST_SESSION_TTL_MS,
    Date.now() + TOURNAMENT_GUEST_SESSION_TTL_MS
  );
  const value = encodeGuestSession({
    username: normalizedUsername,
    tournamentToken: String(token || "").trim(),
    issuedAt: Date.now(),
    expiresAt,
  });
  if (!value) return;
  store.set(tournamentGuestCookieName(token), value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
  });
}

export function clearTournamentGuestUsername(store: CookieStore, token: string) {
  store.set(tournamentGuestCookieName(token), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
