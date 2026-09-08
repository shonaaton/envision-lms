import { describe, expect, it } from "vitest";
import {
  appendPgnMove,
  countPgnMoves,
  deletePgnNode,
  parsePgnTree,
  pgnMainlinePath,
  pgnPositionAtPath,
  pgnSideToMoveAt,
  promotePgnLine,
  readPgnComment,
  serializePgnTree,
  setPgnComment,
  setPgnStartSide,
  togglePgnNag,
} from "@/lib/pgnEditor";

const puzzlePgn = '[Event "Anastasia\'s Mate"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n[SetUp "1"]\n[FEN "5rk1/1pp4p/p2p1n2/3Pp1N1/1PP4P/3K4/P4P2/5R2 w - - 0 1"]\n\n*\n';

describe("serializePgnTree", () => {
  it("round-trips a mainline game", () => {
    const pgn = '[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0\n';
    const serialized = serializePgnTree(parsePgnTree(pgn));
    expect(serialized).toContain('[Event "Test"]');
    expect(serialized).toContain("1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0");
    expect(serialized).not.toContain("[FEN");
  });

  it("keeps the FEN setup tags for a position-only PGN", () => {
    const serialized = serializePgnTree(parsePgnTree(puzzlePgn));
    expect(serialized).toContain('[SetUp "1"]');
    expect(serialized).toContain('[FEN "5rk1/1pp4p/p2p1n2/3Pp1N1/1PP4P/3K4/P4P2/5R2 w - - 0 1"]');
    expect(serialized.trim().endsWith("*")).toBe(true);
  });

  it("writes variations with black move numbers and survives a re-parse", () => {
    const pgn = '[Result "*"]\n\n1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *\n';
    const serialized = serializePgnTree(parsePgnTree(pgn));
    expect(serialized).toContain("(1... c5 2. Nf3 d6)");
    expect(serializePgnTree(parsePgnTree(serialized))).toBe(serialized);
  });

  it("preserves comments and annotation glyphs", () => {
    const tree = parsePgnTree('[Result "*"]\n\n1. e4 *\n');
    const withNote = togglePgnNag(setPgnComment(tree, [0], "Best by test"), [0], 3);
    const serialized = serializePgnTree(withNote);
    expect(serialized).toContain("1. e4 $3 { Best by test }");
    expect(readPgnComment(parsePgnTree(serialized), [0])).toBe("Best by test");
  });
});

describe("editing moves", () => {
  it("appends a move onto a FEN-only position", () => {
    const tree = parsePgnTree(puzzlePgn);
    const result = appendPgnMove(tree, [], { from: "g5", to: "e6" });
    expect(result?.created).toBe(true);
    expect(result?.path).toEqual([0]);
    expect(serializePgnTree(result!.tree)).toContain("1. Ne6");
  });

  it("rejects an illegal move", () => {
    expect(appendPgnMove(parsePgnTree(puzzlePgn), [], { from: "a1", to: "a8" })).toBeNull();
  });

  it("navigates to an existing move instead of duplicating it", () => {
    const tree = parsePgnTree('[Result "*"]\n\n1. e4 e5 *\n');
    const result = appendPgnMove(tree, [], { from: "e2", to: "e4" });
    expect(result?.created).toBe(false);
    expect(countPgnMoves(result!.tree)).toBe(2);
  });

  it("adds a second move at the same position as a variation", () => {
    const tree = parsePgnTree('[Result "*"]\n\n1. e4 e5 *\n');
    const result = appendPgnMove(tree, [0], { from: "c7", to: "c5" });
    expect(result?.path).toEqual([0, 1]);
    expect(serializePgnTree(result!.tree)).toContain("(1... c5)");
  });

  it("deletes a move together with everything after it", () => {
    const tree = parsePgnTree('[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *\n');
    const result = deletePgnNode(tree, [0, 0, 0]);
    expect(result.path).toEqual([0, 0]);
    expect(countPgnMoves(result.tree)).toBe(2);
    expect(serializePgnTree(result.tree)).toContain("1. e4 e5");
    expect(serializePgnTree(result.tree)).not.toContain("Nf3");
  });

  it("promotes a variation to the main line", () => {
    const tree = parsePgnTree('[Result "*"]\n\n1. e4 e5 (1... c5 2. Nf3) 2. Nc3 *\n');
    const result = promotePgnLine(tree, [0, 1]);
    expect(result.path).toEqual([0, 0]);
    const serialized = serializePgnTree(result.tree);
    expect(serialized).toContain("1. e4 c5 (1... e5 2. Nc3) 2. Nf3");
  });

  it("keeps the position in sync with the selected path", () => {
    const tree = parsePgnTree('[Result "*"]\n\n1. e4 e5 *\n');
    expect(pgnSideToMoveAt(pgnPositionAtPath(tree, []))).toBe("white");
    expect(pgnSideToMoveAt(pgnPositionAtPath(tree, pgnMainlinePath(tree)))).toBe("white");
    expect(pgnSideToMoveAt(pgnPositionAtPath(tree, [0]))).toBe("black");
  });
});

describe("setPgnStartSide", () => {
  it("flips the side to play in the FEN of a position-only PGN", () => {
    const result = setPgnStartSide(parsePgnTree(puzzlePgn), "black");
    expect(result?.removedMoves).toBe(0);
    expect(pgnSideToMoveAt(result!.tree.initialFen)).toBe("black");
    expect(serializePgnTree(result!.tree)).toContain('[FEN "5rk1/1pp4p/p2p1n2/3Pp1N1/1PP4P/3K4/P4P2/5R2 b - - 0 1"]');
  });

  it("drops moves that the new side to play makes illegal", () => {
    const result = setPgnStartSide(parsePgnTree('[Result "*"]\n\n1. e4 e5 2. Nf3 *\n'), "black");
    expect(result?.removedMoves).toBe(3);
    expect(countPgnMoves(result!.tree)).toBe(0);
  });

  it("is a no-op when the side already matches", () => {
    const tree = parsePgnTree(puzzlePgn);
    const result = setPgnStartSide(tree, "white");
    expect(serializePgnTree(result!.tree)).toBe(serializePgnTree(tree));
  });
});
