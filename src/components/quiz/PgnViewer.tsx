"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

export default function PgnViewer({ pgn }: { pgn: string }) {
  const game = useMemo(() => {
    const g = new Chess();
    try { g.loadPgn(pgn); } catch {}
    return g;
  }, [pgn]);
  const moves = useMemo(() => game.history(), [game]);
  const [idx, setIdx] = useState(moves.length);
  const [position, setPosition] = useState<string>("");

  useEffect(() => {
    const g = new Chess();
    try { g.loadPgn(pgn); } catch {}
    // Replay up to idx
    const all = g.history({ verbose: true });
    const g2 = new Chess();
    for (let i = 0; i < idx; i++) g2.move(all[i] as any);
    setPosition(g2.fen());
  }, [idx, pgn]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <div className="card">
        <Chessboard
          position={position}
          arePiecesDraggable={false}
          boardWidth={480}
          customDarkSquareStyle={{ backgroundColor: "#5a1372" }}
          customLightSquareStyle={{ backgroundColor: "#fde75a" }}
        />
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-outline" onClick={() => setIdx(0)}>«</button>
          <button className="btn-outline" onClick={() => setIdx((i) => Math.max(0, i - 1))}>‹</button>
          <button className="btn-outline" onClick={() => setIdx((i) => Math.min(moves.length, i + 1))}>›</button>
          <button className="btn-outline" onClick={() => setIdx(moves.length)}>»</button>
        </div>
      </div>
      <div className="card max-h-[520px] overflow-y-auto">
        <div className="text-xs uppercase text-gray-400">Moves</div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 text-sm text-gray-200">
          {moves.map((m, i) => (
            <button key={i} onClick={() => setIdx(i + 1)} className={`text-left ${i + 1 === idx ? "text-accent" : ""}`}>
              {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ""} {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
