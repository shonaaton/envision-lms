/**
 * Board sizing and move-list shaping.
 *
 * The board is the point of the screen, so its size is computed from what is
 * actually left after the chrome rather than from a fixed guess. Kept pure so
 * the breakpoint behaviour can be tested at the widths real students use.
 */

export type BoardSizeInput = {
  viewportWidth: number;
  viewportHeight: number;
  /** Width the board's column currently offers. */
  containerWidth: number;
  /** Vertical space taken by everything else in the board column. */
  chromeHeight: number;
};

export const BOARD_MIN_SIZE = 240;
export const BOARD_MAX_SIZE = 720;

/** Side padding the board column keeps, per breakpoint. */
function horizontalGutter(viewportWidth: number) {
  if (viewportWidth < 768) return 16;
  if (viewportWidth < 1280) return 32;
  return 40;
}

/** How much of the viewport height the board may claim before scrolling. */
function verticalAllowance(viewportWidth: number, viewportHeight: number, chromeHeight: number) {
  // In landscape on a phone there is very little height, so the board follows
  // height rather than width and the layout puts panels beside it.
  const landscapePhone = viewportWidth < 1024 && viewportHeight < 520;
  const reserve = landscapePhone ? 24 : chromeHeight;
  return viewportHeight - reserve;
}

export function computeBoardSize(input: BoardSizeInput) {
  const { viewportWidth, viewportHeight, containerWidth, chromeHeight } = input;
  const gutter = horizontalGutter(viewportWidth);

  const widthBudget = Math.min(
    containerWidth > 0 ? containerWidth : viewportWidth - gutter,
    viewportWidth - gutter
  );
  const heightBudget = verticalAllowance(viewportWidth, viewportHeight, chromeHeight);

  const cap = viewportWidth >= 1280 ? BOARD_MAX_SIZE : viewportWidth >= 768 ? 620 : 560;
  const size = Math.min(widthBudget, heightBudget, cap);

  // Whole pixels keep the square grid crisp and stop coordinate labels from
  // landing on half-pixels.
  return Math.max(BOARD_MIN_SIZE, Math.floor(size));
}

/** Phones in landscape get the panels beside the board rather than beneath it. */
export function isLandscapePhone(viewportWidth: number, viewportHeight: number) {
  return viewportWidth < 1024 && viewportHeight < 520 && viewportWidth > viewportHeight;
}

export type MoveRow = { number: number; white: string; black: string };

/**
 * Turn a flat SAN history into numbered rows.
 *
 * The old move list joined every move into one run-on string, which is
 * unreadable past a dozen plies and impossible to scan for a specific move.
 */
export function toMoveRows(moveHistorySAN: string[] | null | undefined): MoveRow[] {
  const moves = moveHistorySAN || [];
  const rows: MoveRow[] = [];
  for (let index = 0; index < moves.length; index += 2) {
    rows.push({ number: index / 2 + 1, white: moves[index], black: moves[index + 1] || "" });
  }
  return rows;
}

/** Index of the ply a row's cell refers to, for highlighting the latest move. */
export function plyIndex(rowNumber: number, colour: "white" | "black") {
  return (rowNumber - 1) * 2 + (colour === "white" ? 0 : 1);
}
