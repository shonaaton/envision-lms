import { describe, expect, it } from "vitest";
import { computeStandings, isLichessDrawStreak, scoreLichessArenaGame, type ScoredGame, type ScoringOptions } from "./scoring";
import { GLICKO_DEFAULT, rateGame, rateOne, deviationAfterInactivity, isProvisional } from "./glicko2";

const arena: ScoringOptions = {
  rulesVersion: 4,
  type: "arena",
  arenaStreaks: true,
  earlyDrawMoveLimit: 10,
  drawStreakLimit: 2,
  berserkMinPlies: 7,
  scoringCutoff: Number.POSITIVE_INFINITY,
};

let clock = 0;
function g(white: string, black: string, result: ScoredGame["result"], plyCount = 40, extra: Partial<ScoredGame> = {}): ScoredGame {
  clock += 1000;
  return { id: `g${clock}`, source: "arena", status: "completed", result, termination: "normal", whiteKey: white, blackKey: black, plyCount, endedAt: clock, ...extra };
}
const players = (keys: string[]) => keys.map((playerKey) => ({ playerKey, displayName: playerKey }));
const history = (games: ScoredGame[], key = "a", options = arena) =>
  computeStandings(players(["a", "b", "c", "d"]), games, options).find((entry) => entry.playerKey === key)!.scoreHistory;

describe("Arena scoring = lila ArenaSheet (rules v4)", () => {
  it("a draw in 6 moves (12 plies) scores 0: quick draws are under 20 plies", () => {
    expect(history([g("a", "b", "1/2-1/2", 12)])).toEqual([0]);
  });

  it("two draws in a row: 1 then 0", () => {
    expect(history([g("a", "b", "1/2-1/2"), g("a", "c", "1/2-1/2")])).toEqual([1, 0]);
  });

  it("draw, loss, draw: 1, 0, 0 - a loss does not break the draw streak", () => {
    expect(history([g("a", "b", "1/2-1/2"), g("a", "c", "0-1"), g("a", "d", "1/2-1/2")])).toEqual([1, 0, 0]);
  });

  it("a win breaks it: draw, win, draw scores 1, 2, 1", () => {
    expect(history([g("a", "b", "1/2-1/2"), g("a", "c", "1-0"), g("a", "d", "1/2-1/2")])).toEqual([1, 2, 1]);
  });

  it("a third draw that lasted 35 moves (70 plies) still scores 1", () => {
    expect(history([g("a", "b", "1/2-1/2"), g("a", "c", "1/2-1/2"), g("a", "d", "1/2-1/2", 70)])).toEqual([1, 0, 1]);
  });

  it("berserk earns +1 only from 7 moves (14 plies): a berserk win in 5 moves scores 2", () => {
    expect(history([g("a", "b", "1-0", 10, { berserkWhite: true })])).toEqual([2]);
    expect(history([g("a", "b", "1-0", 14, { berserkWhite: true })])).toEqual([3]);
  });

  it("two wins put you on fire: the third win scores 4, a draw on fire scores 2", () => {
    expect(history([g("a", "b", "1-0"), g("a", "c", "1-0"), g("a", "d", "1-0")])).toEqual([2, 2, 4]);
    expect(history([g("a", "b", "1-0"), g("a", "c", "1-0"), g("a", "d", "1/2-1/2")])).toEqual([2, 2, 2]);
  });

  it("a quick draw scores 0 even on fire", () => {
    expect(history([g("a", "b", "1-0"), g("a", "c", "1-0"), g("a", "d", "1/2-1/2", 12)])).toEqual([2, 2, 0]);
  });

  it("streaks switched off: wins are always 2", () => {
    expect(history([g("a", "b", "1-0"), g("a", "c", "1-0"), g("a", "d", "1-0")], "a", { ...arena, arenaStreaks: false })).toEqual([2, 2, 2]);
  });

  it("the draw-streak walk skips losses and stops at a win", () => {
    expect(isLichessDrawStreak(["D", "L", "L"])).toBe(true);
    expect(isLichessDrawStreak(["W", "L"])).toBe(false);
    expect(isLichessDrawStreak([])).toBe(false);
    expect(scoreLichessArenaGame(0.5, false, 40, ["D", "L"], true)).toBe(0);
    expect(scoreLichessArenaGame(0.5, false, 60, ["D", "L"], true)).toBe(1);
  });

  it("breaks ties on performance: same points, the one who beat stronger players ranks higher", () => {
    const table = computeStandings(
      players(["a", "b", "c", "d"]),
      [g("a", "c", "1-0", 80, { blackRating: 1900 }), g("b", "d", "1-0", 80, { blackRating: 1300 })],
      arena
    );
    expect(table[0].playerKey).toBe("a");
    expect(table[0].performance).toBe(2400);
    expect(table[1].playerKey).toBe("b");
    expect(table[1].performance).toBe(1800);
  });

  it("older events keep their rules: v3 scores two draws 1, 1", () => {
    expect(history([g("a", "b", "1/2-1/2"), g("a", "c", "1/2-1/2")], "a", { ...arena, rulesVersion: 3 })).toEqual([1, 1]);
  });
});

describe("Swiss v4: a late joiner gets Lichess's half point for round 1", () => {
  it("adds 0.5 once, not per missed round", () => {
    const swiss: ScoringOptions = { ...arena, type: "swiss", lateJoiners: new Set(["d"]) };
    const games = [{ ...g("a", "b", "1-0"), source: "swiss" as const }];
    const table = computeStandings(players(["a", "b", "d"]), games, swiss);
    expect(table.find((entry) => entry.playerKey === "d")?.points).toBe(0.5);
  });
});

describe("Glicko-2 with Lichess's settings", () => {
  it("moves two new players symmetrically and shrinks their RD", () => {
    const after = rateGame(GLICKO_DEFAULT, GLICKO_DEFAULT, 1);
    expect(after.white.rating).toBeGreaterThan(1500);
    expect(Math.round(after.white.rating + after.black.rating)).toBe(3000);
    expect(after.white.deviation).toBeLessThan(500);
    expect(isProvisional(after.white)).toBe(true);
  });

  it("matches Glickman's worked example within rounding (one game of the three)", () => {
    // Player 1500/200/0.06 beats 1400/30: rating rises, RD falls.
    const next = rateOne({ rating: 1500, deviation: 200, volatility: 0.06 }, { rating: 1400, deviation: 30, volatility: 0.06 }, 1);
    expect(next.rating).toBeGreaterThan(1550);
    expect(next.rating).toBeLessThan(1600);
    expect(next.deviation).toBeLessThan(200);
  });

  it("clamps: a 400 player losing stays at 400, RD never below 45", () => {
    expect(rateOne({ rating: 400, deviation: 50, volatility: 0.06 }, { rating: 2000, deviation: 50, volatility: 0.06 }, 0).rating).toBe(400);
    expect(rateOne({ rating: 1500, deviation: 45, volatility: 0.03 }, { rating: 1500, deviation: 45, volatility: 0.03 }, 0.5).deviation).toBeGreaterThanOrEqual(45);
  });

  it("grows RD back with inactivity, up to 500", () => {
    const settled = { rating: 1700, deviation: 60, volatility: 0.06 };
    expect(deviationAfterInactivity(settled, 365)).toBeGreaterThan(100);
    expect(deviationAfterInactivity(settled, 365 * 50)).toBe(500);
  });
});
