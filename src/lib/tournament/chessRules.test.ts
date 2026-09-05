import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { buildPgn, detectTermination, loadGamePosition, replayGame } from "./chessRules";

function play(moves: string[]) {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  return chess;
}

describe("replayGame", () => {
  it("rebuilds a position from SAN history", () => {
    const chess = replayGame(["e4", "e5", "Nf3"]);
    expect(chess.history()).toEqual(["e4", "e5", "Nf3"]);
    expect(chess.turn()).toBe("b");
  });

  it("handles an empty history", () => {
    expect(replayGame([]).fen()).toBe(new Chess().fen());
    expect(replayGame(undefined).fen()).toBe(new Chess().fen());
  });

  it("replays from a custom starting position", () => {
    const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const chess = replayGame(["e4"], fen);
    expect(chess.history()).toEqual(["e4"]);
  });

  it("throws on an unreplayable history rather than silently diverging", () => {
    expect(() => replayGame(["e4", "e4"])).toThrow();
  });
});

describe("loadGamePosition", () => {
  it("prefers the replayed history", () => {
    const loaded = loadGamePosition({ moveHistorySAN: ["e4", "e5"], fen: new Chess().fen() });
    expect(loaded.replayed).toBe(true);
    expect(loaded.chess.history()).toEqual(["e4", "e5"]);
  });

  it("falls back to the stored FEN when history cannot be replayed", () => {
    const position = play(["e4", "e5"]).fen();
    const loaded = loadGamePosition({ moveHistorySAN: ["totally", "bogus"], fen: position });
    expect(loaded.replayed).toBe(false);
    expect(loaded.chess.fen()).toBe(position);
  });

  it("treats the legacy \"start\" sentinel as the standard position", () => {
    const loaded = loadGamePosition({ moveHistorySAN: [], fen: "start" });
    expect(loaded.chess.fen()).toBe(new Chess().fen());
  });
});

describe("detectTermination", () => {
  it("returns nothing for a game in progress", () => {
    expect(detectTermination(play(["e4", "e5"]))).toBeNull();
  });

  it("detects checkmate and awards it to the mating side", () => {
    const result = detectTermination(play(["f3", "e5", "g4", "Qh4"]));
    expect(result).toEqual({ result: "0-1", termination: "checkmate", winnerColor: "black" });
  });

  it("detects a white win by checkmate", () => {
    const result = detectTermination(play(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7"]));
    expect(result?.result).toBe("1-0");
    expect(result?.termination).toBe("checkmate");
    expect(result?.winnerColor).toBe("white");
  });

  it("detects stalemate", () => {
    const chess = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    const result = detectTermination(chess);
    expect(result?.result).toBe("1/2-1/2");
    expect(result?.termination).toBe("stalemate");
  });

  it("detects insufficient material", () => {
    const result = detectTermination(new Chess("4k3/8/8/8/8/8/8/4K1N1 w - - 0 1"));
    expect(result?.termination).toBe("insufficient_material");
  });

  it("detects threefold repetition, which the previous engine could never see", () => {
    const chess = play(["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]);
    const result = detectTermination(chess);
    expect(result?.result).toBe("1/2-1/2");
    expect(result?.termination).toBe("repetition");
  });

  it("detects repetition only after a full replay, not from a bare FEN", () => {
    const repeated = play(["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]);
    // The old code path: rebuild from FEN alone and the draw is invisible.
    expect(detectTermination(new Chess(repeated.fen()))).toBeNull();
    // The new code path replays the history and finds it.
    expect(detectTermination(replayGame(repeated.history()))?.termination).toBe("repetition");
  });

  it("detects the fifty-move rule", () => {
    const chess = new Chess("4k3/8/8/8/8/8/6R1/4K3 w - - 99 80");
    chess.move("Rg3");
    const result = detectTermination(chess);
    expect(result?.result).toBe("1/2-1/2");
    expect(result?.termination).toBe("fifty_moves");
  });

  it("does not draw one move before the fifty-move threshold", () => {
    expect(detectTermination(new Chess("4k3/8/8/8/8/8/6R1/4K3 w - - 98 80"))).toBeNull();
  });
});

describe("buildPgn", () => {
  it("emits the whole game, not just the last move", () => {
    const pgn = buildPgn(["e4", "e5", "Nf3", "Nc6"], {
      event: "Friday Arena",
      white: "Ana",
      black: "Ben",
      result: "1-0",
    });
    expect(pgn).toContain("1. e4 e5 2. Nf3 Nc6");
    expect(pgn).toContain('[White "Ana"]');
    expect(pgn).toContain('[Black "Ben"]');
    expect(pgn).toContain('[Event "Friday Arena"]');
    expect(pgn).toContain('[Result "1-0"]');
  });

  it("round-trips through a PGN reader", () => {
    const pgn = buildPgn(["e4", "e5", "Nf3", "Nc6", "Bb5"], { white: "Ana", black: "Ben", result: "*" });
    const reloaded = new Chess();
    reloaded.loadPgn(pgn);
    expect(reloaded.history()).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  });

  it("includes a SetUp header only for a custom starting position", () => {
    const standard = buildPgn(["e4"], { white: "Ana", black: "Ben" });
    expect(standard).not.toContain("SetUp");
    const custom = buildPgn(["e4"], { white: "Ana", black: "Ben", startFen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1" });
    expect(custom).toContain('[SetUp "1"]');
    expect(custom).toContain("[FEN ");
  });

  it("records the time control when one is given", () => {
    expect(buildPgn(["e4"], { white: "Ana", black: "Ben", timeControl: "180+2" })).toContain('[TimeControl "180+2"]');
  });
});
