import type { Chess } from "chess.js";

export type PromotionPiece = "q" | "r" | "b" | "n";

export type PendingPromotion = {
  from: string;
  to: string;
};

export function isPromotionMove(game: Chess, from: string, to: string) {
  const piece = game.get(from as never);
  return piece?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
}

export function promotionFromBoardPiece(piece?: string): PromotionPiece | null {
  const promotion = piece?.slice(1).toLowerCase();
  return promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n"
    ? promotion
    : null;
}
