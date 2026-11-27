"use client";

import { Flame, Zap } from "lucide-react";
import { GameClock } from "./GameClock";
import { OnlineDot } from "../OnlineDot";

function initials(name: string) {
  const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

export type PlayerInfo = {
  name: string;
  rating?: number;
  rank?: number;
  points?: number;
  onStreak?: boolean;
  berserk?: boolean;
  isYou?: boolean;
  /** Whether this player is in the room. Left out, no dot is drawn. */
  online?: boolean;
};

/**
 * Avatar, name and "#2 · 2 pts · 1500" on one line.
 *
 * The name is the only part that may shrink: it truncates, while the badges
 * and the meta line never wrap. On a phone the meta used to break into
 * "2 / pts" and the name collapsed to a single letter beside a wide clock.
 */
export function PlayerIdentity({ name, rating, rank, points, onStreak, berserk, isYou, online, small = false }: PlayerInfo & { small?: boolean }) {
  const meta = [
    rank ? `#${rank}` : "",
    points !== undefined ? `${points} pts` : "",
    rating ? String(rating) : "",
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <div className="relative shrink-0">
        <div
          aria-hidden
          className={[
            "grid place-items-center rounded-full font-bold",
            small ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs",
            isYou ? "bg-brand text-white" : "bg-slate-200 text-slate-600",
          ].join(" ")}
        >
          {initials(name)}
        </div>
        {online !== undefined ? (
          <OnlineDot online={online} className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ring-2 ring-white" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`min-w-0 truncate font-semibold text-slate-900 ${small ? "text-sm" : "text-[15px]"}`} title={name}>
            {name || "Waiting"}
          </span>
          {isYou ? <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand ring-1 ring-brand/15">You</span> : null}
          {onStreak ? (
            <span
              title="On a streak - the next game scores double"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-px text-[10px] font-bold text-orange-600 ring-1 ring-orange-200"
            >
              <Flame size={10} aria-hidden /> 2x
            </span>
          ) : null}
          {berserk ? (
            <span
              title="Berserked - half the clock, no increment"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-50 px-1.5 py-px text-[10px] font-bold text-brand-600 ring-1 ring-accent-500/40"
            >
              <Zap size={10} aria-hidden />
              <span className="hidden sm:inline">Berserk</span>
            </span>
          ) : null}
        </div>
        {meta.length ? (
          <div className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-slate-500">
            {meta.map((part, index) => (
              <span key={index} className={index === 0 && rank ? "font-semibold text-slate-600" : ""}>
                {index ? <span className="px-1 text-slate-300" aria-hidden>·</span> : null}
                {part}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One side of the board as a slim row: who they are, where they stand, and
 * their clock. Used above and below the board on phones and tablets, and by
 * the spectator board. On desktop the play screen moves the clocks into the
 * game panel beside the board instead.
 */
export function PlayerBar({
  clockMs,
  active,
  running,
  compact = false,
  ...player
}: PlayerInfo & {
  clockMs: number;
  active: boolean;
  running: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-200",
        active ? "border-brand/25 bg-brand-50/60" : "border-slate-200/80 bg-white/90",
      ].join(" ")}
    >
      <PlayerIdentity {...player} small />
      <GameClock ms={clockMs} active={active} running={running} label={`${player.name} clock`} compact={compact} />
    </div>
  );
}
