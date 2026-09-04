import { Chess } from "chess.js";

export type LiveBoardRole = "student" | "instructor" | "admin" | "sub-admin";
export type BoardPosition = Record<string, string | undefined>;
export type GamifiedObjectId = "star" | "gem" | "coin" | "apple" | "fire" | "trophy" | "gift" | "shield" | "key" | "puzzle" | "rocket" | "monster" | "dragon";
export type GamifiedObjects = Record<string, GamifiedObjectId>;
export type CastlingRights = { K: boolean; Q: boolean; k: boolean; q: boolean };

export const emptyCastlingRights: CastlingRights = { K: false, Q: false, k: false, q: false };

export function fenToBoardPosition(fen?: string): BoardPosition {
  const chess = new Chess();
  if (fen && fen !== "start") chess.load(fen, { skipValidation: true });
  const position: BoardPosition = {};
  chess.board().forEach((rank, rankIndex) => {
    rank.forEach((piece, fileIndex) => {
      if (!piece) return;
      const square = `${"abcdefgh"[fileIndex]}${8 - rankIndex}`;
      position[square] = `${piece.color}${piece.type.toUpperCase()}`;
    });
  });
  return position;
}

export function inferCastlingRights(fen?: string | null): CastlingRights {
  const rights = String(fen || "").trim().split(/\s+/)[2] || "";
  return {
    K: rights.includes("K"),
    Q: rights.includes("Q"),
    k: rights.includes("k"),
    q: rights.includes("q"),
  };
}

export function legalCastlingText(position: BoardPosition, rights: CastlingRights = emptyCastlingRights) {
  let text = "";
  if (rights.K && position.e1 === "wK" && position.h1 === "wR") text += "K";
  if (rights.Q && position.e1 === "wK" && position.a1 === "wR") text += "Q";
  if (rights.k && position.e8 === "bK" && position.h8 === "bR") text += "k";
  if (rights.q && position.e8 === "bK" && position.a8 === "bR") text += "q";
  return text || "-";
}

export function boardPositionToFen(position: BoardPosition, sideToMove = "w", castlingRights: CastlingRights = emptyCastlingRights) {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let empty = 0;
    let row = "";
    for (const file of "abcdefgh") {
      const piece = position[`${file}${rank}`];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const letter = piece[1];
      row += piece[0] === "w" ? letter : letter.toLowerCase();
    }
    if (empty) row += empty;
    ranks.push(row);
  }
  return `${ranks.join("/")} ${sideToMove} ${legalCastlingText(position, castlingRights)} - 0 1`;
}

export function removeObjectsOnPieceSquares(objects: GamifiedObjects = {}, position: BoardPosition = {}) {
  const next = { ...objects };
  Object.keys(position).forEach((square) => {
    if (position[square]) delete next[square];
  });
  return next;
}

export function transferBoardPiece(
  position: BoardPosition,
  objects: GamifiedObjects,
  source: string,
  target: string,
  piece: string
) {
  const nextPosition = { ...position };
  delete nextPosition[source];
  nextPosition[target] = piece;
  return {
    position: nextPosition,
    objects: removeObjectsOnPieceSquares(objects, nextPosition),
  };
}

export function placeSetupPiece(
  position: BoardPosition,
  objects: GamifiedObjects,
  square: string,
  piece: string | "erase"
) {
  const nextPosition = { ...position };
  if (piece === "erase") delete nextPosition[square];
  else nextPosition[square] = piece;
  return {
    position: nextPosition,
    objects: piece === "erase" ? { ...objects } : removeObjectsOnPieceSquares(objects, nextPosition),
  };
}

export function applyLegalMoveToGame(
  game: Chess,
  objects: GamifiedObjects,
  moveHistory: string[],
  source: string,
  target: string,
  promotion = "q"
) {
  try {
    const move = game.move({ from: source, to: target, promotion });
    if (!move) return null;
    return {
      fen: game.fen(),
      objects: removeObjectsOnPieceSquares(objects, fenToBoardPosition(game.fen())),
      moveHistory: [...moveHistory, move.san],
      san: move.san,
      turn: game.turn(),
    };
  } catch {
    return null;
  }
}

function entityId(value: any) {
  return value?._id?.toString?.() || value?.toString?.() || "";
}

export function canControlLiveBoard({
  role,
  userId,
  locked,
  studentMovesEnabled,
  boardControlStudents,
}: {
  role: LiveBoardRole;
  userId: string;
  locked?: boolean;
  studentMovesEnabled?: boolean;
  boardControlStudents?: any[];
}) {
  if (locked) return false;
  if (role === "admin" || role === "sub-admin" || role === "instructor") return true;
  return Boolean(studentMovesEnabled && (boardControlStudents || []).some((student) => entityId(student) === userId));
}

export type RefreshProtection<T extends Record<string, any>> = {
  sequence: number;
  pending: Partial<T> | null;
};

export function beginRefreshProtection<T extends Record<string, any>>(
  state: RefreshProtection<T>,
  update: Partial<T>
): RefreshProtection<T> {
  return {
    sequence: state.sequence + 1,
    pending: { ...(state.pending || {}), ...update },
  };
}

export function overlayProtectedPoll<T extends Record<string, any>>(
  serverLive: T,
  state: RefreshProtection<T>
) {
  return state.pending ? { ...serverLive, ...state.pending } : serverLive;
}

export function releaseRefreshProtection<T extends Record<string, any>>(
  state: RefreshProtection<T>,
  sequence: number
): RefreshProtection<T> {
  return sequence === state.sequence ? { ...state, pending: null } : state;
}

export function isLatestInteraction(sequence: number, latestSequence: number) {
  return sequence === latestSequence;
}

export function selectionAfterSquareClick({
  selectedSquare,
  square,
  clickedPiece,
  freeMoveMode,
  canSelectForTurn,
}: {
  selectedSquare: string | null;
  square: string;
  clickedPiece?: string;
  freeMoveMode: boolean;
  canSelectForTurn: boolean;
}) {
  if (!clickedPiece) return null;
  if (freeMoveMode || canSelectForTurn) return selectedSquare === square ? null : square;
  return null;
}

export function studentMoveMutation(from: string, to: string, promotion = "q") {
  return { from, to, promotion };
}
