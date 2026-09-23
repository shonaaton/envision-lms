import { describe, expect, it } from "vitest";
import { canCompleteRounds, pairSwissRound, swissHistoriesFromGames, type SwissHistoryGame, type SwissPlayer } from "./swiss";

function player(key: string, overrides: Partial<SwissPlayer> = {}): SwissPlayer {
  return { playerKey: key, displayName: key, points: 0, rating: 1500, opponents: [], colours: [], byes: 0, lastFloat: null, ...overrides };
}

type ResultPolicy = (whiteKey: string, blackKey: string, round: number) => "1-0" | "0-1" | "1/2-1/2";

/**
 * Play a whole event through the real pairing and history code, the way the
 * engine does, and report how many rounds it managed.
 */
function playEvent(size: number, rounds: number, policy: ResultPolicy, lookahead: boolean) {
  const keys = Array.from({ length: size }, (_, index) => `p${index}`);
  const ratings = new Map(keys.map((key, index) => [key, 2000 - index * 37]));
  const games: SwissHistoryGame[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const { opponents, colours, lastFloat } = swissHistoriesFromGames(games);
    const points = new Map<string, number>(keys.map((key) => [key, 0]));
    const byes = new Map<string, number>();
    for (const game of games) {
      if (!game.blackKey) {
        points.set(game.whiteKey, points.get(game.whiteKey)! + 1);
        byes.set(game.whiteKey, (byes.get(game.whiteKey) || 0) + 1);
        continue;
      }
      points.set(game.whiteKey, points.get(game.whiteKey)! + (game.result === "1-0" ? 1 : game.result === "0-1" ? 0 : 0.5));
      points.set(game.blackKey, points.get(game.blackKey)! + (game.result === "0-1" ? 1 : game.result === "1-0" ? 0 : 0.5));
    }
    const field = keys.map((key) =>
      player(key, {
        points: points.get(key)!,
        rating: ratings.get(key)!,
        opponents: opponents.get(key) || [],
        colours: colours.get(key) || [],
        byes: byes.get(key) || 0,
        lastFloat: lastFloat.get(key) ?? null,
      })
    );
    const result = pairSwissRound(field, lookahead ? { roundsRemaining: rounds - round + 1 } : {});
    if (result.exhausted) return { played: round - 1, games };
    if (result.bye) games.push({ roundNumber: round, whiteKey: result.bye.playerKey, blackKey: "", status: "completed", result: "1-0", termination: "bye" });
    for (const pair of result.pairs) {
      const white = pair.white.playerKey;
      const black = pair.black.playerKey;
      expect(pair.white.opponents).not.toContain(black);
      games.push({ roundNumber: round, whiteKey: white, blackKey: black, status: "completed", result: policy(white, black, round), termination: "checkmate" });
    }
  }
  return { played: rounds, games };
}

const policies: Record<string, ResultPolicy> = {
  "higher rated wins": (white, black) => (Number(white.slice(1)) < Number(black.slice(1)) ? "1-0" : "0-1"),
  "white always wins": () => "1-0",
  "black always wins": () => "0-1",
  "everything drawn": () => "1/2-1/2",
  "lower rated wins": (white, black) => (Number(white.slice(1)) > Number(black.slice(1)) ? "1-0" : "0-1"),
  "mixed by round": (white, black, round) => (round % 3 === 0 ? "1/2-1/2" : (Number(white.slice(1)) + round) % 2 ? "1-0" : "0-1"),
};

describe("small fields play every scheduled round", () => {
  for (const size of [4, 5, 6, 7, 8, 9, 10]) {
    const maxRounds = size % 2 === 0 ? size - 1 : size;
    for (const [name, policy] of Object.entries(policies)) {
      it(`${size} players, ${maxRounds} rounds, ${name}`, () => {
        expect(playEvent(size, maxRounds, policy, true).played).toBe(maxRounds);
      });
    }
  }

  it("the old one-round-at-a-time pairing dead-ends in at least one of these events", () => {
    // Guards the test above: it must be exercising a real failure mode.
    let deadEnds = 0;
    for (const size of [4, 5, 6, 7, 8, 9, 10]) {
      const maxRounds = size % 2 === 0 ? size - 1 : size;
      for (const policy of Object.values(policies)) {
        if (playEvent(size, maxRounds, policy, false).played < maxRounds) deadEnds += 1;
      }
    }
    expect(deadEnds).toBeGreaterThan(0);
  });

  it("does not look past what the field can ever play", () => {
    const started = performance.now();
    // Six players cannot play nine rounds; the event still runs its five, fast.
    expect(playEvent(6, 9, policies["higher rated wins"], true).played).toBe(5);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("bye choice", () => {
  it("moves the bye when the preferred bye would strand the field", () => {
    // a has met everyone except e, so e cannot take the bye.
    const players = [
      player("a", { points: 3, opponents: ["b", "c", "d"] }),
      player("b", { points: 2, opponents: ["a"] }),
      player("c", { points: 1, opponents: ["a"] }),
      player("d", { points: 1, opponents: ["a"] }),
      player("e", { points: 0 }),
    ];
    const result = pairSwissRound(players);
    expect(result.exhausted).toBe(false);
    expect(result.bye?.playerKey).not.toBe("e");
    expect(result.pairs.map((pair) => [pair.white.playerKey, pair.black.playerKey].sort().join("-"))).toContain("a-e");
  });

  it("still gives the bye to the lowest player without one when that works", () => {
    const players = ["a", "b", "c", "d", "e"].map((key, index) => player(key, { points: 4 - index }));
    expect(pairSwissRound(players).bye?.playerKey).toBe("e");
  });
});

describe("feasibility search", () => {
  it("knows four players have exactly three rounds of fresh opponents", () => {
    const met = new Map<string, Set<string>>();
    expect(canCompleteRounds(["a", "b", "c", "d"], met, new Set(), 3)).toBe(true);
    expect(canCompleteRounds(["a", "b", "c", "d"], met, new Set(), 4)).toBe(false);
  });
});

describe("history from games", () => {
  it("derives the last-round float, so a standings rebuild cannot wipe it", () => {
    const games: SwissHistoryGame[] = [
      { roundNumber: 1, whiteKey: "a", blackKey: "b", status: "completed", result: "1-0" },
      { roundNumber: 1, whiteKey: "c", blackKey: "d", status: "completed", result: "1-0" },
      { roundNumber: 2, whiteKey: "a", blackKey: "d", status: "completed", result: "1-0" },
      { roundNumber: 2, whiteKey: "c", blackKey: "b", status: "completed", result: "1-0" },
    ];
    const { lastFloat } = swissHistoriesFromGames(games);
    // Round 2: a (1) v d (0) floats a down and d up.
    expect(lastFloat.get("a")).toBe("down");
    expect(lastFloat.get("d")).toBe("up");
  });

  it("counts a bye as a downfloat", () => {
    const { lastFloat } = swissHistoriesFromGames([{ roundNumber: 1, whiteKey: "a", blackKey: "", status: "completed", result: "1-0", termination: "bye" }]);
    expect(lastFloat.get("a")).toBe("down");
  });

  it("treats a forfeit as unplayed: no opponent, no colour", () => {
    const { opponents, colours } = swissHistoriesFromGames([
      { roundNumber: 1, whiteKey: "a", blackKey: "b", status: "completed", result: "0-1", termination: "forfeit" },
    ]);
    expect(opponents.get("a")).toBeUndefined();
    expect(colours.get("b")).toBeUndefined();
  });
});
