"use client";

import { useEffect, useRef } from "react";
import { plyIndex, toMoveRows } from "@/lib/tournament/boardLayout";

/**
 * A numbered move table.
 *
 * This replaces joining every move into one run-on string, which was
 * unreadable past a dozen plies. The latest move is marked and scrolled into
 * view, so a player returning to the board can see where the game got to.
 *
 * Only the list's own scroll box moves. `scrollIntoView` scrolled every
 * ancestor too — on a phone, where the list sits under the board, each move
 * dragged the whole page down and away from the board.
 */
export function MoveList({ moves, className = "" }: { moves: string[]; className?: string }) {
  const rows = toMoveRows(moves);
  const latest = moves.length - 1;
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const box = listRef.current?.parentElement;
    if (box && box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight;
  }, [moves.length]);

  if (!rows.length) {
    return <div className={`px-3 py-6 text-center text-sm text-slate-400 ${className}`}>No moves yet.</div>;
  }

  const cell = (san: string, ply: number) =>
    san ? (
      <span
        className={[
          "inline-block rounded px-1.5 py-0.5 tabular-nums",
          ply === latest ? "bg-accent-100 font-semibold text-brand-700" : "text-slate-700",
        ].join(" ")}
      >
        {san}
      </span>
    ) : (
      <span className="text-slate-300">&mdash;</span>
    );

  return (
    <ol ref={listRef} className={`divide-y divide-slate-100 text-sm ${className}`} aria-label="Move list">
      {rows.map((row) => (
        <li key={row.number} className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1 px-2 py-1">
          <span className="text-right text-xs font-semibold tabular-nums text-slate-400">{row.number}.</span>
          {cell(row.white, plyIndex(row.number, "white"))}
          {cell(row.black, plyIndex(row.number, "black"))}
        </li>
      ))}
    </ol>
  );
}
