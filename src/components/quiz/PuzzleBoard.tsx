"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

export default function PuzzleBoard({
  fen,
  solution = [],
  onSolved,
}: {
  fen: string;
  solution?: string[];
  onSolved?: () => void;
}) {
  const game = useMemo(() => new Chess(fen), [fen]);
  const [position, setPosition] = useState(fen);
  const [moves, setMoves] = useState<string[]>([]);
  const [status, setStatus] = useState<"playing" | "wrong" | "solved">("playing");

  function onDrop(source: string, target: string) {
    if (status !== "playing") return false;
    try {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      const next = [...moves, move.san];
      const expected = solution[moves.length];
      if (expected && move.san !== expected) {
        setStatus("wrong");
        game.undo();
        return false;
      }
      setMoves(next);
      setPosition(game.fen());
      if (next.length === solution.length) {
        setStatus("solved");
        onSolved?.();
      }
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    game.load(fen);
    setPosition(fen);
    setMoves([]);
    setStatus("playing");
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-md">
        <Chessboard position={position} onPieceDrop={onDrop} boardWidth={400}
          customDarkSquareStyle={{ backgroundColor: "#5a1372" }}
          customLightSquareStyle={{ backgroundColor: "#fde75a" }} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-outline" onClick={reset}>Reset</button>
        {status === "wrong" && <span className="chip text-red-300">Try again</span>}
        {status === "solved" && <span className="chip-accent">Solved!</span>}
      </div>
      <div className="text-xs text-gray-400">Moves: {moves.join(" ") || "—"}</div>
    </div>
  );
}
