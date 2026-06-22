import type { CSSProperties } from "react";
import type { Chess, PieceSymbol } from "chess.js";

export function pieceTurnColor(piece?: string | null) {
  if (!piece) return null;
  const value = String(piece);
  if (value[0] === "w" || value[0] === "b") return value[0] as "w" | "b";
  if (value === value.toUpperCase()) return "w";
  return "b";
}

export function legalTargetsFromGame(game: Chess, square: string) {
  try {
    return (game.moves({ square: square as any, verbose: true }) as Array<{ to: string }>).map((move) => move.to);
  } catch {
    return [];
  }
}

export function canSelectPieceForTurn(piece: string | null | undefined, turn: "w" | "b") {
  return pieceTurnColor(piece) === turn;
}

export function buildMoveHintStyles(targets: string[], selectedSquare?: string | null) {
  const styles: Record<string, CSSProperties> = {};
  if (selectedSquare) {
    styles[selectedSquare] = {
      outline: "3px solid rgba(90, 19, 114, 0.45)",
      outlineOffset: "-3px",
    };
  }
  targets.forEach((square) => {
    styles[square] = {
      ...(styles[square] || {}),
      backgroundImage: "radial-gradient(circle, rgba(31, 99, 52, 0.46) 0 18%, transparent 19%)",
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    };
  });
  return styles;
}

export function allTargetSquaresExcept(square: string) {
  const targets: string[] = [];
  for (const file of "abcdefgh") {
    for (let rank = 1; rank <= 8; rank++) {
      const next = `${file}${rank}`;
      if (next !== square) targets.push(next);
    }
  }
  return targets;
}

export function mergeSquareStyles(...styleMaps: Array<Record<string, CSSProperties>>) {
  const merged: Record<string, CSSProperties> = {};
  styleMaps.forEach((map) => {
    Object.entries(map || {}).forEach(([square, style]) => {
      merged[square] = { ...(merged[square] || {}), ...(style || {}) };
    });
  });
  return merged;
}

export function promotePieceCode(piece?: string | null) {
  if (!piece) return "q";
  const symbol = String(piece).slice(-1).toLowerCase();
  return (["q", "r", "b", "n"].includes(symbol) ? symbol : "q") as PieceSymbol;
}
