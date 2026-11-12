import { describe, expect, it } from "vitest";
import {
  addColour,
  colourHistoryOf,
  couldPlay,
  evenNumber,
  firstGetsWhite,
  haveWaitedEnough,
  lichessArenaPairings,
  NO_COLOUR_HISTORY,
  pairScore,
  rankFactorFor,
  shouldPairNow,
  type ArenaPairingInput,
  type ArenaWaiter,
} from "./arenaLichess";
import { arenaPairingsClosedSeconds, arenaWaitSeconds, estimateTotalSeconds, firstMoveSeconds, speedOf, swissStillEnterable } from "./lichessRules";

const NOW = 1_000_000;
const p = (playerKey: string, rank: number, rating = 1500, overrides: Partial<ArenaWaiter> = {}): ArenaWaiter => ({
  playerKey,
  rank,
  rating,
  since: NOW - 60_000,
  colours: NO_COLOUR_HISTORY,
  ...overrides,
});
const input = (waiting: ArenaWaiter[], overrides: Partial<ArenaPairingInput> = {}): ArenaPairingInput => ({
  waiting,
  lastOpponents: new Map(),
  now: NOW,
  recentlyStarted: false,
  hadPairings: true,
  waitSeconds: 24,
  smallTourActivePlayers: null,
  random: () => 0.1,
  ...overrides,
});
const keys = (pairs: Array<{ white: ArenaWaiter; black: ArenaWaiter }>) =>
  pairs.map((pair) => [pair.white.playerKey, pair.black.playerKey].sort().join("-")).sort();

describe("Lichess clock-derived constants", () => {
  it("estimates the game length as limit + 40 x increment and names the speed", () => {
    expect(estimateTotalSeconds({ initialClockSeconds: 180, incrementSeconds: 2 })).toBe(260);
    expect(speedOf({ initialClockSeconds: 180, incrementSeconds: 2 })).toBe("blitz");
    expect(speedOf({ timeControlMinutes: 1, incrementSeconds: 0 })).toBe("bullet");
    expect(speedOf({ timeControlMinutes: 10, incrementSeconds: 0 })).toBe("rapid");
  });

  it("gives Lichess's tournament first-move times", () => {
    expect(firstMoveSeconds({ initialClockSeconds: 15 })).toBe(11);
    expect(firstMoveSeconds({ timeControlMinutes: 1 })).toBe(16);
    expect(firstMoveSeconds({ timeControlMinutes: 3, incrementSeconds: 2 })).toBe(21);
    expect(firstMoveSeconds({ timeControlMinutes: 10 })).toBe(25);
    expect(firstMoveSeconds({ timeControlMinutes: 30 })).toBe(30);
  });

  it("waits like lila WaitingUsers: 3+0 waits 24 s, 10+0 is capped at 50, 1+0 floors at 15", () => {
    expect(arenaWaitSeconds({ timeControlMinutes: 3 })).toBe(24);
    expect(arenaWaitSeconds({ timeControlMinutes: 10 })).toBe(50);
    expect(arenaWaitSeconds({ timeControlMinutes: 1 })).toBe(15);
    expect(arenaWaitSeconds({ initialClockSeconds: 15 })).toBe(8);
  });

  it("closes pairing max(30, min(limit/2, 120)) seconds before the end", () => {
    expect(arenaPairingsClosedSeconds({ timeControlMinutes: 1 })).toBe(30);
    expect(arenaPairingsClosedSeconds({ timeControlMinutes: 3 })).toBe(90);
    expect(arenaPairingsClosedSeconds({ timeControlMinutes: 10 })).toBe(120);
  });

  it("lets new players into a Swiss while round <= rounds / 2", () => {
    expect(swissStillEnterable({ rounds: 5, currentRound: 2 })).toBe(true);
    expect(swissStillEnterable({ rounds: 5, currentRound: 3 })).toBe(false);
    expect(swissStillEnterable({ rounds: 12, currentRound: 6 })).toBe(true);
  });
});

describe("colour history (lila ColorHistory)", () => {
  it("tracks the streak and balance", () => {
    expect(colourHistoryOf(["white", "white", "black"])).toEqual({ strike: -1, balance: 1 });
    expect(addColour({ strike: 2, balance: 2 }, "white")).toEqual({ strike: 3, balance: 3 });
  });

  it("gives White to whoever has had fewer recent Whites", () => {
    expect(firstGetsWhite({ strike: -2, balance: -2 }, { strike: 1, balance: 1 }, () => false)).toBe(true);
    expect(firstGetsWhite({ strike: 1, balance: 1 }, { strike: -2, balance: -2 }, () => true)).toBe(false);
  });

  it("refuses a pair where both have had three of the same colour in a row", () => {
    expect(couldPlay({ strike: 3, balance: 3 }, { strike: 3, balance: 1 })).toBe(false);
    expect(couldPlay({ strike: -3, balance: -3 }, { strike: -3, balance: -1 })).toBe(false);
    expect(couldPlay({ strike: 3, balance: 3 }, { strike: -3, balance: -3 })).toBe(true);
    expect(couldPlay({ strike: 3, balance: 3 }, { strike: 2, balance: 2 })).toBe(true);
  });
});

describe("when to pair (lila makePairings)", () => {
  it("pairs the very first boards straight away", () => {
    expect(shouldPairNow(input([p("a", 0, 1500, { since: NOW }), p("b", 1, 1500, { since: NOW })], { hadPairings: false }))).toBe(true);
  });

  it("otherwise waits until two players have waited waitSeconds", () => {
    const fresh = [p("a", 0, 1500, { since: NOW - 5_000 }), p("b", 1, 1500, { since: NOW - 5_000 })];
    expect(shouldPairNow(input(fresh))).toBe(false);
    expect(haveWaitedEnough([p("a", 0, 1500, { since: NOW - 30_000 }), p("b", 1, 1500, { since: NOW - 30_000 })], NOW, 24)).toBe(true);
  });

  it("in a small tournament, pairs once two thirds of the active players are waiting", () => {
    const fresh = [p("a", 0, 1500, { since: NOW }), p("b", 1, 1500, { since: NOW })];
    expect(shouldPairNow(input(fresh, { smallTourActivePlayers: 3 }))).toBe(true);
    expect(shouldPairNow(input(fresh, { smallTourActivePlayers: 4 }))).toBe(false);
  });

  it("leaves out whoever became free last when the count is odd", () => {
    const waiting = [p("a", 0), p("b", 1), p("c", 2, 1500, { since: NOW - 1_000 })];
    expect(evenNumber(waiting).map((player) => player.playerKey)).toEqual(["a", "b"]);
  });
});

describe("who plays whom (lila AntmaPairing)", () => {
  it("in the first 15 seconds pairs down the ranking: 1-2, 3-4", () => {
    const waiting = [p("a", 0, 2000), p("b", 1, 1900), p("c", 2, 1800), p("d", 3, 1700)];
    expect(keys(lichessArenaPairings(input(waiting, { recentlyStarted: true, hadPairings: false })))).toEqual(["a-b", "c-d"]);
  });

  it("weights rank gaps 2000x at the top and 300x at the bottom", () => {
    const players = [p("a", 0), p("b", 10)];
    const factor = rankFactorFor(players);
    expect(factor(players[0], players[1])).toBe(2000);
    expect(factor(p("x", 10), p("y", 10))).toBe(300);
  });

  it("never pairs you with your last opponent while anyone else is free", () => {
    const waiting = [p("a", 0), p("b", 1), p("c", 2), p("d", 3)];
    const lastOpponents = new Map([["a", "b"], ["b", "a"], ["c", "d"], ["d", "c"]]);
    expect(pairScore(waiting[0], waiting[1], { lastOpponents, rankFactor: rankFactorFor(waiting) })).toBeNull();
    expect(keys(lichessArenaPairings(input(waiting, { lastOpponents })))).toEqual(["a-c", "b-d"]);
  });

  it("allows the rematch when only two players are active", () => {
    const waiting = [p("a", 0), p("b", 1)];
    const lastOpponents = new Map([["a", "b"], ["b", "a"]]);
    expect(lichessArenaPairings(input(waiting, { lastOpponents }))).toHaveLength(0);
    expect(keys(lichessArenaPairings(input(waiting, { lastOpponents, smallTourActivePlayers: 2 })))).toEqual(["a-b"]);
  });

  it("keeps the leaders together: 1 v 2 and 3 v 4, not 1 v 4", () => {
    const waiting = [p("a", 0, 1500), p("b", 1, 1500), p("c", 2, 1500), p("d", 3, 1500)];
    expect(keys(lichessArenaPairings(input(waiting)))).toEqual(["a-b", "c-d"]);
  });

  it("uses rating between players of close rank", () => {
    // Same rank gaps either way; rating decides.
    const waiting = [p("a", 0, 2000), p("b", 1, 1200), p("c", 2, 1990), p("d", 3, 1210)];
    const pairs = keys(lichessArenaPairings(input(waiting)));
    expect(pairs).not.toContain("a-d");
    expect(pairs).toHaveLength(2);
  });

  it("never puts a player in two games, and pairs everyone it can", () => {
    const waiting = Array.from({ length: 9 }, (_, index) => p(`p${index}`, index, 1500 + index * 10));
    const pairs = lichessArenaPairings(input(waiting));
    const all = pairs.flatMap((pair) => [pair.white.playerKey, pair.black.playerKey]);
    expect(new Set(all).size).toBe(all.length);
    expect(pairs).toHaveLength(4);
  });
});
