import type { cookies as cookiesFn } from "next/headers";

export const TOURNAMENT_GUEST_COOKIE_PREFIX = "lms_tournament_guest_";

export function normalizeTournamentGuestUsername(username: string) {
  return String(username || "").trim();
}

export function tournamentGuestCookieName(token: string) {
  return `${TOURNAMENT_GUEST_COOKIE_PREFIX}${String(token || "").trim()}`;
}

type CookieStore = Awaited<ReturnType<typeof cookiesFn>>;

export function getTournamentGuestUsername(store: CookieStore, token: string) {
  return normalizeTournamentGuestUsername(store.get(tournamentGuestCookieName(token))?.value || "");
}

export function setTournamentGuestUsername(store: CookieStore, token: string, username: string) {
  store.set(tournamentGuestCookieName(token), normalizeTournamentGuestUsername(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
