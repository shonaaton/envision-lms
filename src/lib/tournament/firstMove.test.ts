import { describe, expect, it } from "vitest";
import { noShowOutcome, sideOwingFirstMove } from "./firstMove";

const T0 = Date.parse("2026-11-13T14:30:00Z");

function game(overrides: Record<string, unknown> = {}) {
  return {
    source: "swiss",
    status: "active",
    ply: 0,
    turn: "w" as const,
    startedAt: new Date(T0),
    firstMoveDeadlineAt: new Date(T0 + 21_000),
    ...overrides,
  };
}

describe("who owes the first move", () => {
  it("is White at ply 0, Black at ply 1, nobody after", () => {
    expect(sideOwingFirstMove(game())).toBe("white");
    expect(sideOwingFirstMove(game({ ply: 1, turn: "b" }))).toBe("black");
    expect(sideOwingFirstMove(game({ ply: 2 }))).toBeNull();
    expect(sideOwingFirstMove(game({ status: "completed" }))).toBeNull();
  });
});

describe("no-start, as lila Finisher.noStart", () => {
  const expired = T0 + 21_001;

  it("does nothing before the deadline", () => {
    expect(noShowOutcome(game(), T0 + 20_000)).toEqual({ action: "none" });
  });

  it("White who never moves loses to Black, whether or not Black was there", () => {
    expect(noShowOutcome(game(), expired)).toEqual({ action: "forfeit", winner: "black", absent: ["white"] });
    expect(noShowOutcome(game({ blackOnlineAt: new Date(T0) }), expired)).toEqual({ action: "forfeit", winner: "black", absent: ["white"] });
  });

  it("Black who never answers loses to White", () => {
    expect(noShowOutcome(game({ ply: 1, turn: "b" }), expired)).toEqual({ action: "forfeit", winner: "white", absent: ["black"] });
  });

  it("is the same in an Arena: tournament games cannot be aborted", () => {
    expect(noShowOutcome(game({ source: "arena" }), expired)).toEqual({ action: "forfeit", winner: "black", absent: ["white"] });
  });
});
