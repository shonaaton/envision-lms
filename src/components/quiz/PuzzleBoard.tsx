"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";

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
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

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
      setSelectedSquare(null);
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
    setSelectedSquare(null);
  }

  const moveTargets = useMemo(() => {
    if (!selectedSquare || status !== "playing") return [];
    return legalTargetsFromGame(game, selectedSquare);
  }, [selectedSquare, status, position, game]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedSquare), [moveTargets, selectedSquare]);

  function onSquareClick(square: string) {
    if (status !== "playing") return;
    const clickedPiece = game.get(square as any);
    if (selectedSquare && selectedSquare !== square) {
      const moved = onDrop(selectedSquare, square);
      if (moved) return;
    }
    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }
    if (clickedPiece && clickedPiece.color === game.turn()) {
      setSelectedSquare(square);
      return;
    }
    setSelectedSquare(null);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-md">
        <Chessboard position={position} onPieceDrop={onDrop} onSquareClick={onSquareClick as any} boardWidth={400}
          customSquareStyles={moveHintStyles as any}
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
