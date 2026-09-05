"use client";

import { useEffect, useState } from "react";

/**
 * A ticking "now".
 *
 * The clock display used to be a `useMemo` keyed on the game object: the
 * once-a-second re-render recomputed nothing, so the clock sat frozen until the
 * next server response arrived. Deriving from a value that actually changes
 * every second is what makes it tick.
 *
 * Pass this into any clock calculation as an explicit dependency.
 */
export function useNow(intervalMs = 250, active = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    // A backgrounded tab throttles timers, so the clock is resynced the moment
    // the page is visible again rather than catching up a second at a time.
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, active]);

  return now;
}

export type ClockBaseline = {
  whiteClockMs: number;
  blackClockMs: number;
  turn: "w" | "b";
  /** Client-clock timestamp the baseline was taken at. */
  since: number;
  running: boolean;
};

/**
 * Remaining time for both sides at `now`, from a server-supplied baseline.
 *
 * The client never invents a clock value: it counts down from what the server
 * last told it and is corrected by the next authoritative update.
 */
export function deriveClocks(baseline: ClockBaseline | null, now: number) {
  if (!baseline) return { whiteClockMs: 0, blackClockMs: 0 };
  if (!baseline.running) return { whiteClockMs: baseline.whiteClockMs, blackClockMs: baseline.blackClockMs };
  const elapsed = Math.max(0, now - baseline.since);
  return baseline.turn === "w"
    ? { whiteClockMs: Math.max(0, baseline.whiteClockMs - elapsed), blackClockMs: baseline.blackClockMs }
    : { whiteClockMs: baseline.whiteClockMs, blackClockMs: Math.max(0, baseline.blackClockMs - elapsed) };
}

/**
 * Build a baseline from a game payload, correcting for the difference between
 * the server's clock and this device's. Without that correction a device whose
 * clock is a few seconds off shows a few seconds of phantom time.
 */
export function clockBaselineFromGame(game: any, receivedAt = Date.now()): ClockBaseline | null {
  if (!game) return null;
  const running = game.status === "active";
  const serverNow = Number(game.serverNow || 0);
  const lastMoveAt = new Date(game.lastMoveAt || game.startedAt || serverNow || receivedAt).getTime();
  const skew = serverNow ? receivedAt - serverNow : 0;
  return {
    whiteClockMs: Number(game.whiteClockMs || 0),
    blackClockMs: Number(game.blackClockMs || 0),
    turn: game.turn === "b" ? "b" : "w",
    since: lastMoveAt + skew,
    running,
  };
}

export function formatClock(ms: number) {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Under ten seconds, tenths tell a player whether they can still move.
  if (safe < 10_000) return `${seconds}.${Math.floor((safe % 1000) / 100)}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
