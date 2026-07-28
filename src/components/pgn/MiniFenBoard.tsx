"use client";

const fallbackFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fenPieces(fen: string) {
  const board = String(fen || fallbackFen).split(" ")[0] || "";
  const pieces: string[] = [];
  board.split("/").forEach((rank) => {
    for (const char of rank) {
      const empty = Number(char);
      if (Number.isInteger(empty) && empty > 0) pieces.push(...Array.from({ length: empty }, () => ""));
      else pieces.push(char);
    }
  });
  return pieces.slice(0, 64);
}

export function previewFenFromPgn(pgn?: string, initialFen?: string) {
  return initialFen || String(pgn || "").match(/\[FEN\s+"([^"]+)"\]/)?.[1] || fallbackFen;
}

export default function MiniFenBoard({ fen, className = "" }: { fen: string; className?: string }) {
  const pieceMap: Record<string, string> = {
    p: "\u265F", n: "\u265E", b: "\u265D", r: "\u265C", q: "\u265B", k: "\u265A",
    P: "\u2659", N: "\u2658", B: "\u2657", R: "\u2656", Q: "\u2655", K: "\u2654",
  };
  const pieces = fenPieces(fen);
  return (
    <div className={`grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${className}`} aria-hidden="true">
      {Array.from({ length: 64 }).map((_, index) => {
        const file = index % 8;
        const rank = Math.floor(index / 8);
        const light = (file + rank) % 2 === 0;
        const piece = pieces[index] || "";
        const whitePiece = piece === piece.toUpperCase();
        return (
          <span
            key={index}
            className={`flex items-center justify-center text-[clamp(10px,9cqw,18px)] leading-none ${light ? "bg-[#efd6a8]" : "bg-[#bd8d62]"} ${whitePiece ? "text-white [text-shadow:_0_1px_1px_rgb(0_0_0_/_0.8)]" : "text-black"}`}
          >
            {pieceMap[piece] || ""}
          </span>
        );
      })}
    </div>
  );
}
