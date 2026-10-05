/**
 * Just enough FEN for a static diagram: the piece placement field, read into a
 * square -> piece map. Diagrams are teaching boards (a lone knight and its
 * targets, a mating net with no other pieces), so this deliberately does not
 * check whose move it is, castling rights or even that both kings are present.
 */

const PIECES = new Set(["p", "n", "b", "r", "q", "k", "P", "N", "B", "R", "Q", "K"]);
const FILES = "abcdefgh";

/** "e4" -> [fileIndex 0..7, rankIndex 0..7 from white's first rank]. */
export function squareCoords(square: string): [number, number] | null {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  return [FILES.indexOf(square[0]), Number(square[1]) - 1];
}

export function squareName(file: number, rank: number) {
  return `${FILES[file]}${rank + 1}`;
}

/** Throws on a malformed placement, so a bad diagram fails the content test. */
export function parsePlacement(fen: string): Map<string, string> {
  const placement = fen.trim().split(/\s+/)[0] ?? "";
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error(`FEN "${fen}" has ${ranks.length} ranks, expected 8`);

  const board = new Map<string, string>();
  ranks.forEach((row, index) => {
    const rank = 7 - index;
    let file = 0;
    for (const char of row) {
      if (/[1-8]/.test(char)) {
        file += Number(char);
      } else if (PIECES.has(char)) {
        if (file > 7) throw new Error(`FEN "${fen}" overflows rank ${rank + 1}`);
        board.set(squareName(file, rank), char);
        file += 1;
      } else {
        throw new Error(`FEN "${fen}" has an unknown character "${char}"`);
      }
    }
    if (file !== 8) throw new Error(`FEN "${fen}" rank ${rank + 1} has ${file} files, expected 8`);
  });
  return board;
}

/** The artwork key for a FEN piece letter: "N" -> "wN", "q" -> "bQ". */
export function pieceKey(piece: string) {
  return `${piece === piece.toUpperCase() ? "w" : "b"}${piece.toUpperCase()}`;
}
