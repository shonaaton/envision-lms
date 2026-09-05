import type { CSSProperties } from "react";

/**
 * Board presentation for tournament games.
 *
 * The squares are drawn from the Envision brand rather than the usual wood: a
 * soft lilac and a muted aubergine, desaturated far enough to sit under the
 * pieces for a whole event without tiring the eye. Play and spectator boards
 * share this module so a game looks the same whoever is watching it.
 */

export const BOARD_LIGHT_SQUARE = "#f1ecf5";
export const BOARD_DARK_SQUARE = "#9d84ae";

/** Overlays, in the order they stack onto a square. */
const LAST_MOVE_TINT = "rgba(253, 231, 90, 0.42)";
const SELECTED_RING = "inset 0 0 0 3px rgba(90, 19, 114, 0.85)";
const CHECK_GLOW = "radial-gradient(circle, rgba(220, 38, 38, 0.85) 0%, rgba(220, 38, 38, 0.35) 55%, transparent 72%)";
/** Teal, so a queued premove never reads as the last move's yellow. */
const PREMOVE_RING = "inset 0 0 0 3px rgba(13, 148, 136, 0.9)";
const PREMOVE_FILL = "rgba(13, 148, 136, 0.22)";

export type BoardHighlights = {
  /** Squares the selected piece may legally move to. */
  targets?: string[];
  selectedSquare?: string | null;
  /** Last move in UCI form, e.g. "e2e4". */
  lastMoveUci?: string | null;
  /** Square of the king that is currently in check. */
  checkSquare?: string | null;
  premove?: { from: string; to: string } | null;
  /** Squares that already hold a piece, so captures render as rings not dots. */
  occupied?: Set<string>;
};

function merge(styles: Record<string, CSSProperties>, square: string, next: CSSProperties) {
  styles[square] = { ...(styles[square] || {}), ...next };
}

export function buildBoardSquareStyles(highlights: BoardHighlights): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};
  const { lastMoveUci, selectedSquare, targets, checkSquare, premove, occupied } = highlights;

  // Last move sits underneath everything: it is context, not a prompt.
  if (lastMoveUci && lastMoveUci.length >= 4) {
    merge(styles, lastMoveUci.slice(0, 2), { backgroundColor: LAST_MOVE_TINT });
    merge(styles, lastMoveUci.slice(2, 4), { backgroundColor: LAST_MOVE_TINT });
  }

  for (const square of targets || []) {
    // A capture is drawn as a ring around the piece; an empty square as a dot,
    // so the two read differently at a glance on a small screen.
    if (occupied?.has(square)) {
      merge(styles, square, { boxShadow: "inset 0 0 0 4px rgba(90, 19, 114, 0.42)" });
    } else {
      merge(styles, square, {
        backgroundImage: "radial-gradient(circle, rgba(90, 19, 114, 0.34) 0 17%, transparent 18%)",
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
      });
    }
  }

  if (selectedSquare) merge(styles, selectedSquare, { boxShadow: SELECTED_RING });

  if (checkSquare) {
    merge(styles, checkSquare, {
      backgroundImage: CHECK_GLOW,
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    });
  }

  // The premove is the player's own pending intent, so it draws on top.
  if (premove) {
    merge(styles, premove.from, { boxShadow: PREMOVE_RING, backgroundColor: PREMOVE_FILL });
    merge(styles, premove.to, { boxShadow: PREMOVE_RING, backgroundColor: PREMOVE_FILL });
  }

  return styles;
}

/** Find the king in check, for the glow above. */
export function findKingSquare(board: Array<Array<{ type: string; color: string } | null>>, colour: "w" | "b") {
  const files = "abcdefgh";
  for (let rank = 0; rank < board.length; rank += 1) {
    for (let file = 0; file < board[rank].length; file += 1) {
      const piece = board[rank][file];
      if (piece?.type === "k" && piece.color === colour) return `${files[file]}${8 - rank}`;
    }
  }
  return null;
}
