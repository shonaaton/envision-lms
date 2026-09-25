import { describe, expect, it } from "vitest";
import { extendedFirstMoveDeadline, FIRST_MOVE_GRACE_MS, FIRST_MOVE_MAX_WAIT_MS, noShowOutcome, sideOwingFirstMove } from "./firstMove";

const T0 = Date.UTC(2026, 8, 24, 10, 0, 0);

function game(overrides: Record<string, any> = {}) {
  return {
    source: "swiss",
    status: "active",
    ply: 0,
    startedAt: new Date(T0),
    firstMoveDeadlineAt: new Date(T0 + FIRST_MOVE_GRACE_MS),
    ...overrides,
  };
}

describe("who owes a first move", () => {
  it("is White at the start", () => expect(sideOwingFirstMove(game())).toBe("white"));
  it("is Black after White's first move in Swiss", () => expect(sideOwingFirstMove(game({ ply: 1 }))).toBe("black"));
  it("is Black after White's first move in Arena too", () => expect(sideOwingFirstMove(game({ ply: 1, source: "arena" }))).toBe("black"));
  it("is nobody once both have moved", () => expect(sideOwingFirstMove(game({ ply: 2 }))).toBeNull());
});

describe("deadline extension", () => {
  it("is extended by the player who must move", () => {
    const at = T0 + 30_000;
    expect(extendedFirstMoveDeadline(game(), "white", at)?.getTime()).toBe(at + FIRST_MOVE_GRACE_MS);
  });

  it("is never extended by the waiting opponent — that kept absent boards alive forever", () => {
    expect(extendedFirstMoveDeadline(game(), "black", T0 + 30_000)).toBeNull();
  });

  it("is capped however long the board stays open", () => {
    const late = T0 + FIRST_MOVE_MAX_WAIT_MS + 10 * 60_000;
    const current = game({ firstMoveDeadlineAt: new Date(T0 + FIRST_MOVE_MAX_WAIT_MS) });
    expect(extendedFirstMoveDeadline(current, "white", late)).toBeNull();
  });

  it("caps Black's deadline from White's first move", () => {
    const whiteMoved = T0 + 20_000;
    const current = game({ ply: 1, lastMoveAt: new Date(whiteMoved), firstMoveDeadlineAt: new Date(whiteMoved + FIRST_MOVE_GRACE_MS) });
    const extended = extendedFirstMoveDeadline(current, "black", whiteMoved + FIRST_MOVE_MAX_WAIT_MS - 1000);
    expect(extended?.getTime()).toBe(whiteMoved + FIRST_MOVE_MAX_WAIT_MS);
  });
});

describe("no-show outcome", () => {
  const expired = T0 + FIRST_MOVE_GRACE_MS + 1;

  it("does nothing before the deadline", () => {
    expect(noShowOutcome(game(), T0 + 1000)).toEqual({ action: "none" });
  });

  it("awards Black the game when White never moved and Black showed up", () => {
    expect(noShowOutcome(game({ blackOnlineAt: new Date(T0 + 5000) }), expired)).toEqual({ action: "forfeit", winner: "black", absent: ["white"] });
  });

  it("aborts a double no-show without scoring either player", () => {
    expect(noShowOutcome(game(), expired)).toEqual({ action: "abort", absent: ["white", "black"] });
  });

  it("awards White the game when Black never made a first move", () => {
    const current = game({ ply: 1, lastMoveAt: new Date(T0), firstMoveDeadlineAt: new Date(T0 + FIRST_MOVE_GRACE_MS) });
    expect(noShowOutcome(current, expired)).toEqual({ action: "forfeit", winner: "white", absent: ["black"] });
  });

  it("aborts an Arena board and names the player who never started", () => {
    expect(noShowOutcome(game({ source: "arena", blackOnlineAt: new Date(T0) }), expired)).toEqual({ action: "abort", absent: ["white"] });
  });

  it("names Black in Arena when Black never answered White's first move", () => {
    const current = game({ source: "arena", ply: 1, lastMoveAt: new Date(T0), firstMoveDeadlineAt: new Date(T0 + FIRST_MOVE_GRACE_MS) });
    expect(noShowOutcome(current, expired)).toEqual({ action: "abort", absent: ["black"] });
  });

  it("names both in Arena when neither ever opened the board", () => {
    expect(noShowOutcome(game({ source: "arena" }), expired)).toEqual({ action: "abort", absent: ["white", "black"] });
  });
});
