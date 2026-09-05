"use client";

import { formatClock } from "@/lib/useLiveClock";

/**
 * The clock is the loudest thing on the screen after the board, because in a
 * blitz game it is the thing a player checks most often. It grows, gains
 * contrast and turns red as the time runs out.
 */
export function GameClock({
  ms,
  active,
  running,
  label,
  compact = false,
}: {
  ms: number;
  /** This side is to move. */
  active: boolean;
  /** The game is still in progress, so the clock means something. */
  running: boolean;
  label: string;
  compact?: boolean;
}) {
  const critical = running && ms < 10_000;
  const low = running && ms < 30_000;

  return (
    <div
      // Announced only when it matters: a clock read out every second would
      // make a screen reader unusable.
      aria-live={critical && active ? "assertive" : "off"}
      aria-label={`${label}: ${formatClock(ms)}`}
      className={[
        "flex items-center justify-center rounded-lg border tabular-nums font-semibold transition-colors duration-200",
        compact ? "min-w-[76px] px-2.5 py-1 text-lg" : "min-w-[104px] px-3.5 py-1.5 text-2xl sm:text-3xl",
        active && critical
          ? "border-red-300 bg-red-50 text-red-700"
          : active
            ? "border-brand/30 bg-brand-50 text-brand-600 shadow-sm shadow-brand-900/10"
            : low
              ? "border-red-200 bg-white text-red-600"
              : "border-slate-200 bg-white text-slate-500",
      ].join(" ")}
    >
      <span className="sr-only">{label}: </span>
      {formatClock(ms)}
    </div>
  );
}
