"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";

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
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(400);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;

    const resize = () => {
      const available = Math.min(element.clientWidth, window.innerWidth - 32);
      setBoardWidth(Math.max(220, Math.min(400, available)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  function commitMove(source: string, target: string, promotion: PromotionPiece = "q") {
    if (status !== "playing") return false;
    try {
      const move = game.move({ from: source, to: target, promotion });
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

  function onDrop(source: string, target: string) {
    return commitMove(source, target);
  }

  function onPromotionPieceSelect(piece?: string, from?: string, to?: string) {
    const promotion = promotionFromBoardPiece(piece);
    const move = from && to ? { from, to } : pendingPromotion;
    setPendingPromotion(null);
    if (!promotion || !move) return false;
    return commitMove(move.from, move.to, promotion);
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
  }, [selectedSquare, status, game]);
  const moveHintStyles = useMemo(() => buildMoveHintStyles(moveTargets, selectedSquare), [moveTargets, selectedSquare]);

  function onSquareClick(square: string) {
    if (status !== "playing") return;
    const clickedPiece = game.get(square as any);
    if (selectedSquare && selectedSquare !== square) {
      if (isPromotionMove(game, selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
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
      <div ref={boardWrapRef} className="w-full max-w-md">
        <Chessboard position={position} onPieceDrop={onDrop} onSquareClick={onSquareClick as any} boardWidth={boardWidth}
          onPromotionPieceSelect={onPromotionPieceSelect as any}
          showPromotionDialog={!!pendingPromotion}
          promotionToSquare={pendingPromotion?.to as any}
          promotionDialogVariant="modal"
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
