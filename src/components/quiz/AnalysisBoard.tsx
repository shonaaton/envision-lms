"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

declare global {
  interface Window { Stockfish?: () => Worker; }
}

export default function AnalysisBoard({ initialFen, withEngine = true }: { initialFen?: string; withEngine?: boolean }) {
  const game = useMemo(() => new Chess(initialFen || undefined), [initialFen]);
  const [position, setPosition] = useState(initialFen || game.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [bestMove, setBestMove] = useState<string>("");
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!withEngine) return;
    // Engine loaded from public CDN — drop stockfish.js in /public for offline.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const w = new Worker("/stockfish/stockfish.js");
      workerRef.current = w;
      w.postMessage("uci");
      w.onmessage = (e) => {
        const line = typeof e.data === "string" ? e.data : "";
        const bm = line.match(/^bestmove\s(\S+)/);
        if (bm) setBestMove(bm[1]);
        const cp = line.match(/score cp (-?\d+)/);
        if (cp) setEvalCp(parseInt(cp[1], 10));
      };
    } catch (e) {
      // Engine not available — analysis still works without it.
    }
    return () => workerRef.current?.terminate();
  }, [withEngine]);

  function analyze() {
    const w = workerRef.current;
    if (!w) return;
    w.postMessage("ucinewgame");
    w.postMessage(`position fen ${game.fen()}`);
    w.postMessage("go depth 16");
  }

  function onDrop(source: string, target: string) {
    try {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      setPosition(game.fen());
      setHistory(game.history());
      setBestMove("");
      return true;
    } catch {
      return false;
    }
  }

  function undo() {
    game.undo();
    setPosition(game.fen());
    setHistory(game.history());
  }

  function reset() {
    game.reset();
    if (initialFen) game.load(initialFen);
    setPosition(game.fen());
    setHistory([]);
    setBestMove("");
    setEvalCp(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="card">
        <Chessboard
          position={position}
          onPieceDrop={onDrop}
          boardWidth={520}
          customDarkSquareStyle={{ backgroundColor: "#5a1372" }}
          customLightSquareStyle={{ backgroundColor: "#fde75a" }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={undo}>Undo</button>
          <button className="btn-outline" onClick={reset}>Reset</button>
          {withEngine && <button className="btn-accent" onClick={analyze}>Analyze with engine</button>}
        </div>
      </div>
      <div className="space-y-4">
        <div className="card">
          <div className="text-xs uppercase text-gray-400">Engine</div>
          <div className="mt-2 text-lg text-white">
            {bestMove ? `Best: ${bestMove}` : "—"}
          </div>
          <div className="mt-1 text-sm text-gray-400">Eval: {evalCp !== null ? `${(evalCp / 100).toFixed(2)}` : "—"}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase text-gray-400">Moves</div>
          <ol className="mt-2 list-decimal pl-5 text-sm text-gray-200">
            {history.map((m, i) => <li key={i}>{m}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
