"use client";

import Link from "next/link";
import { useState } from "react";
import { Crown, Eye } from "lucide-react";
import { MoveList } from "./MoveList";

type Tab = "moves" | "standings" | "boards";

/**
 * The context panel: moves, standings and the other live boards.
 *
 * Inline rather than behind a dialog, deliberately — during a game nothing
 * should cover the board to answer "what is my score?". On desktop all three
 * are stacked and visible; on smaller screens they share a tab strip below the
 * board so the board itself keeps the full width.
 */
export function SidePanel({
  moves,
  standings,
  myPlayerKey,
  tieBreak,
  liveGames,
  tournamentId,
  stacked,
}: {
  moves: string[];
  standings: any[];
  myPlayerKey: string;
  tieBreak?: { key: string; label: string } | null;
  liveGames: any[];
  tournamentId: string;
  /** Desktop shows every section at once; narrow screens use the tab strip. */
  stacked: boolean;
}) {
  const [tab, setTab] = useState<Tab>("moves");

  const movesSection = (
    <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 bg-white">
      <MoveList moves={moves} />
    </div>
  );

  const standingsSection = (
    <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 bg-white">
      {standings.length ? (
        <ol className="divide-y divide-slate-100">
          {standings.slice(0, 25).map((entry: any, index: number) => (
            <li
              key={entry.playerKey}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${entry.playerKey === myPlayerKey ? "bg-brand-50/70" : ""}`}
            >
              <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">
                {index === 0 ? <Crown size={13} className="ml-auto text-accent-500" aria-label="Leader" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{entry.displayName}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">{entry.points}</span>
              {tieBreak && entry[tieBreak.key] !== undefined ? (
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-400" title={tieBreak.label}>
                  {Number(entry[tieBreak.key] || 0).toFixed(1)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-3 py-6 text-center text-sm text-slate-400">Standings appear once games finish.</div>
      )}
    </div>
  );

  const boardsSection = (
    <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 bg-white">
      {liveGames.length ? (
        <ol className="divide-y divide-slate-100">
          {liveGames.slice(0, 12).map((game: any) => (
            <li key={String(game._id)} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{game.tableNumber || "-"}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {game.whiteName} <span className="text-slate-400">vs</span> {game.blackName || "Bye"}
              </span>
              <Link
                href={`/tournaments/${tournamentId}/games/${game._id}`}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-brand-50"
              >
                <Eye size={13} aria-hidden /> Watch
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-3 py-6 text-center text-sm text-slate-400">No other boards are live.</div>
      )}
    </div>
  );

  if (stacked) {
    return (
      <div className="space-y-4">
        <Section title="Moves">{movesSection}</Section>
        <Section title="Standings" hint={tieBreak?.label}>
          {standingsSection}
        </Section>
        <Section title="Live boards">{boardsSection}</Section>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "moves", label: "Moves" },
    { id: "standings", label: "Standings" },
    { id: "boards", label: `Boards${liveGames.length ? ` (${liveGames.length})` : ""}` },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Game information" className="mb-2 flex gap-1 rounded-lg bg-slate-100/80 p-1">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`game-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`game-panel-${entry.id}`}
            onClick={() => setTab(entry.id)}
            className={[
              "min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition-colors",
              tab === entry.id ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`game-panel-${tab}`} aria-labelledby={`game-tab-${tab}`}>
        {tab === "moves" ? movesSection : tab === "standings" ? standingsSection : boardsSection}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{title}</h2>
        {hint ? <span className="text-[11px] text-slate-400">Ties: {hint}</span> : null}
      </div>
      {children}
    </section>
  );
}
