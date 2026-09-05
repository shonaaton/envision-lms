"use client";

import { Flame, Zap } from "lucide-react";
import { GameClock } from "./GameClock";

function initials(name: string) {
  const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

/**
 * One side of the board: who they are, where they stand, and their clock.
 *
 * A row rather than a card, so the two of them frame the board instead of
 * competing with it. The opponent sits above the board and the player below,
 * which is the arrangement every chess player already expects.
 */
export function PlayerBar({
  name,
  rating,
  clockMs,
  active,
  running,
  rank,
  points,
  onStreak,
  berserk,
  isYou,
  compact = false,
}: {
  name: string;
  rating?: number;
  clockMs: number;
  active: boolean;
  running: boolean;
  rank?: number;
  points?: number;
  onStreak?: boolean;
  berserk?: boolean;
  isYou?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-200",
        active ? "border-brand/25 bg-brand-50/60" : "border-slate-200/80 bg-white/90",
      ].join(" ")}
    >
      <div
        aria-hidden
        className={[
          "grid shrink-0 place-items-center rounded-full text-xs font-bold",
          compact ? "h-8 w-8" : "h-10 w-10",
          isYou ? "bg-brand text-white" : "bg-slate-100 text-slate-600",
        ].join(" ")}
      >
        {initials(name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate font-semibold text-slate-900 ${compact ? "text-sm" : "text-[15px]"}`}>{name || "Waiting"}</span>
          {isYou ? <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand ring-1 ring-brand/15">You</span> : null}
          {onStreak ? (
            <span
              title="On a streak - the next game scores double"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 ring-1 ring-orange-200"
            >
              <Flame size={10} aria-hidden /> 2x
            </span>
          ) : null}
          {berserk ? (
            <span
              title="Berserked - half the clock, no increment"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600 ring-1 ring-accent-500/40"
            >
              <Zap size={10} aria-hidden /> Berserk
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
          {rank ? <span className="font-semibold tabular-nums text-slate-600">#{rank}</span> : null}
          {points !== undefined ? <span className="tabular-nums">{points} pts</span> : null}
          {rating ? <span className="tabular-nums">{rating}</span> : null}
        </div>
      </div>

      <GameClock ms={clockMs} active={active} running={running} label={`${name} clock`} compact={compact} />
    </div>
  );
}
