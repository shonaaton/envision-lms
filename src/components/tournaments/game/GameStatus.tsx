"use client";

import { AlertTriangle, Loader2, MonitorSmartphone, Radio, Swords } from "lucide-react";

export type GameStatusKind = "your-move" | "their-move" | "draw-offered" | "reconnecting" | "read-only" | "premove" | "over";

/**
 * One line that always says what is happening and, when it matters, what to do
 * about it. It sits directly under the board so a player never has to work out
 * the state of the game from the absence of something.
 */
export function GameStatus({ kind, detail, action }: { kind: GameStatusKind; detail?: string; action?: React.ReactNode }) {
  const config: Record<GameStatusKind, { icon: React.ReactNode; label: string; className: string }> = {
    "your-move": {
      icon: <Swords size={14} aria-hidden />,
      label: "Your move",
      className: "border-brand/25 bg-brand-50 text-brand-700",
    },
    "their-move": {
      icon: <Radio size={14} aria-hidden />,
      label: "Opponent to move",
      className: "border-slate-200 bg-white text-slate-600",
    },
    "draw-offered": {
      icon: <AlertTriangle size={14} aria-hidden />,
      label: "Draw offered",
      className: "border-accent-500/40 bg-accent-50 text-brand-700",
    },
    reconnecting: {
      icon: <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />,
      label: "Reconnecting",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    "read-only": {
      icon: <MonitorSmartphone size={14} aria-hidden />,
      label: "Read-only",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    premove: {
      icon: <Swords size={14} aria-hidden />,
      label: "Premove ready",
      className: "border-teal-200 bg-teal-50 text-teal-800",
    },
    over: {
      icon: <Swords size={14} aria-hidden />,
      label: "Game over",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    },
  };

  const { icon, label, className } = config[kind];

  return (
    <div
      // Polite: the player is told what changed without interrupting them.
      aria-live="polite"
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-sm font-semibold ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {detail ? <span className="font-normal opacity-80">{detail}</span> : null}
      {action ? <span className="ml-auto">{action}</span> : null}
    </div>
  );
}
