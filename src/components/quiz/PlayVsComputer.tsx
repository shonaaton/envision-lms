"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

export default function PlayVsComputer({ depth = 8 }: { depth?: number }) {
  const game = useMemo(() => new Chess(), []);
  const [position, setPosition] = useState(game.fen());
  const [thinking, setThinking] = useState(false);
  const [over, setOver] = useState<string>("");
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      const w = new Worker("/stockfish/stockfish.js");
      workerRef.current = w;
      w.postMessage("uci");
      w.onmessage = (e) => {
        const line = typeof e.data === "string" ? e.data : "";
        const bm = line.match(/^bestmove\s(\S+)/);
        if (bm) {
          const uci = bm[1];
          const move = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
          try { game.move(move as any); } catch {}
          setPosition(game.fen());
          setThinking(false);
          checkOver();
        }
      };
    } catch {}
    return () => workerRef.current?.terminate();
  }, []);

  function checkOver() {
    if (game.isCheckmate()) setOver(`Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`);
    else if (game.isDraw()) setOver("Draw");
  }

  function onDrop(source: string, target: string) {
    if (over) return false;
    try {
      const m = game.move({ from: source, to: target, promotion: "q" });
      if (!m) return false;
      setPosition(game.fen());
      checkOver();
      // Ask engine for reply
      const w = workerRef.current;
      if (w && !game.isGameOver()) {
        setThinking(true);
        w.postMessage(`position fen ${game.fen()}`);
        w.postMessage(`go depth ${depth}`);
      }
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    game.reset();
    setPosition(game.fen());
    setOver("");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <div className="card">
        <Chessboard
          position={position}
          onPieceDrop={onDrop}
          boardWidth={520}
          customDarkSquareStyle={{ backgroundColor: "#5a1372" }}
          customLightSquareStyle={{ backgroundColor: "#fde75a" }}
        />
      </div>
      <div className="card space-y-3">
        <div className="text-xs uppercase text-gray-400">Status</div>
        <div className="text-white">{thinking ? "Computer thinking..." : over || "Your move"}</div>
        <button className="btn-outline w-full" onClick={reset}>New game</button>
      </div>
    </div>
  );
}
