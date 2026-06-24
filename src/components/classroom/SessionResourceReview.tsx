"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

const Chessboard = dynamic(() => import("react-chessboard").then((module) => module.Chessboard), { ssr: false });

function pgnFen(pgn?: string) {
  return pgn?.match(/\[FEN\s+"([^"]+)"\]/)?.[1] || "start";
}

export default function SessionResourceReview({ resources }: { resources: any[] }) {
  const normalized = useMemo(
    () => resources.map((resource, index) => ({
      ...resource,
      key: resource.loadedAt || `${resource.title}-${index}`,
      fen: resource.fen || pgnFen(resource.pgn),
    })),
    [resources]
  );
  const [active, setActive] = useState(0);
  if (!normalized.length) {
    return <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No PGN or custom board was recorded for this session.</div>;
  }
  const selected = normalized[Math.min(active, normalized.length - 1)];
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-2">
        {normalized.map((resource, index) => (
          <button
            key={resource.key}
            type="button"
            onClick={() => setActive(index)}
            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${index === active ? "border-brand bg-brand/5 text-brand" : "border-slate-200 bg-white text-slate-700"}`}
          >
            <div className="truncate font-bold">{resource.title || `Board ${index + 1}`}</div>
            <div className="mt-0.5 text-xs capitalize text-slate-500">{resource.type || "position"}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[420px]">
          <Chessboard
            id={`session-resource-${selected.key}`}
            position={selected.fen || "start"}
            arePiecesDraggable={false}
            customDarkSquareStyle={{ backgroundColor: "#b9875f" }}
            customLightSquareStyle={{ backgroundColor: "#f1d9aa" }}
          />
        </div>
        <div className="min-w-0 rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
          <div className="mb-2 font-bold text-white">{selected.title || "Classroom board"}</div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono leading-5">{selected.pgn || selected.fen || "No notation saved."}</pre>
        </div>
      </div>
    </div>
  );
}
