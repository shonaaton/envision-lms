import { describe, expect, it } from "vitest";
import {
  assignColours,
  colourBalance,
  colourCost,
  colourPreference,
  consecutiveColours,
  maxRoundsWithoutRepeat,
  orderPlayers,
  pairSwissRound,
  selectByePlayer,
  type Colour,
  type SwissPlayer,
} from "./swiss";

function player(key: string, overrides: Partial<SwissPlayer> = {}): SwissPlayer {
  return {
    playerKey: key,
    displayName: key,
    points: 0,
    rating: 1500,
    opponents: [],
    colours: [],
    byes: 0,
    lastFloat: null,
    ...overrides,
  };
}

function field(size: number, overrides: (index: number) => Partial<SwissPlayer> = () => ({})) {
  return Array.from({ length: size }, (_, index) => player(`p${index}`, overrides(index)));
}

function pairKeys(result: ReturnType<typeof pairSwissRound>) {
  return result.pairs.map((pair) => [pair.white.playerKey, pair.black.playerKey].sort().join("-")).sort();
}

describe("colour preference", () => {
  it("has no preference for a player who has not played", () => {
    expect(colourPreference(player("a"))).toEqual({ wants: null, strength: "none" });
  });

  it("owes the opposite colour after one game", () => {
    expect(colourPreference(player("a", { colours: ["white"] }))).toEqual({ wants: "black", strength: "strong" });
  });

  it("treats a two-colour imbalance as absolute", () => {
    const pref = colourPreference(player("a", { colours: ["white", "black", "white", "white"] }));
    expect(pref).toEqual({ wants: "black", strength: "absolute" });
  });

  it("treats two of the same colour in a row as absolute", () => {
    const pref = colourPreference(player("a", { colours: ["black", "white", "white"] }));
    expect(pref.wants).toBe("black");
    expect(pref.strength).toBe("absolute");
  });

  it("is only mild when balanced but the last colour was recent", () => {
    const pref = colourPreference(player("a", { colours: ["white", "black"] }));
    expect(pref).toEqual({ wants: "white", strength: "mild" });
  });

  it("measures balance and runs", () => {
    expect(colourBalance(["white", "white", "black"] as Colour[])).toBe(1);
    expect(consecutiveColours(["black", "white", "white"] as Colour[])).toEqual({ colour: "white", count: 2 });
    expect(consecutiveColours([])).toEqual({ colour: null, count: 0 });
  });
});

describe("colour assignment", () => {
  it("gives each player the colour they are owed", () => {
    const a = player("a", { colours: ["white"] });
    const b = player("b", { colours: ["black"] });
    const pair = assignColours(a, b);
    expect(pair.white.playerKey).toBe("b");
    expect(pair.black.playerKey).toBe("a");
  });

  it("gives the stronger claim priority when both want the same colour", () => {
    const absolute = player("a", { colours: ["black", "black"] });
    const mild = player("b", { colours: ["black", "white"] });
    const pair = assignColours(absolute, mild);
    expect(pair.white.playerKey).toBe("a");
  });

  it("gives White to the higher score when neither is owed a colour", () => {
    const pair = assignColours(player("a", { points: 1 }), player("b", { points: 3 }));
    expect(pair.white.playerKey).toBe("b");
  });

  it("is stable regardless of argument order", () => {
    const a = player("a", { points: 2, rating: 1500 });
    const b = player("b", { points: 2, rating: 1500 });
    expect(assignColours(a, b).white.playerKey).toBe(assignColours(b, a).white.playerKey);
  });

  it("costs nothing to pair two players owed opposite colours", () => {
    expect(colourCost(player("a", { colours: ["white"] }), player("b", { colours: ["black"] }))).toBe(0);
  });

  it("costs a lot to pair two players with absolute claims on the same colour", () => {
    const cost = colourCost(player("a", { colours: ["black", "black"] }), player("b", { colours: ["black", "black"] }));
    expect(cost).toBeGreaterThan(colourCost(player("c", { colours: ["white"] }), player("d", { colours: ["white"] })));
  });
});

describe("pairing the field", () => {
  it("pairs everyone in an even field", () => {
    const result = pairSwissRound(field(8));
    expect(result.pairs).toHaveLength(4);
    expect(result.bye).toBeNull();
    expect(result.exhausted).toBe(false);
  });

  it("never puts a player in two games", () => {
    const result = pairSwissRound(field(10, (index) => ({ points: index % 3 })));
    const seen = result.pairs.flatMap((pair) => [pair.white.playerKey, pair.black.playerKey]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("gives exactly one bye in an odd field and pairs the rest", () => {
    const result = pairSwissRound(field(7));
    expect(result.bye).not.toBeNull();
    expect(result.pairs).toHaveLength(3);
    const paired = result.pairs.flatMap((pair) => [pair.white.playerKey, pair.black.playerKey]);
    expect(paired).not.toContain(result.bye!.playerKey);
  });

  it("gives the bye to the lowest-placed player without one", () => {
    const players = [
      player("leader", { points: 3 }),
      player("middle", { points: 2 }),
      player("tail", { points: 0 }),
    ];
    expect(pairSwissRound(players).bye?.playerKey).toBe("tail");
  });

  it("skips a player who already had a bye", () => {
    const players = [
      player("leader", { points: 3 }),
      player("middle", { points: 2 }),
      player("tail", { points: 0, byes: 1 }),
    ];
    expect(pairSwissRound(players).bye?.playerKey).toBe("middle");
  });

  it("falls back to the lowest-placed player when everyone has had a bye", () => {
    const players = [player("a", { points: 2, byes: 1 }), player("b", { points: 1, byes: 1 }), player("c", { points: 0, byes: 1 })];
    expect(pairSwissRound(players).bye?.playerKey).toBe("c");
  });

  it("pairs nobody when only one player is present", () => {
    const result = pairSwissRound([player("lonely")]);
    expect(result.pairs).toHaveLength(0);
    expect(result.bye?.playerKey).toBe("lonely");
  });

  it("handles an empty field", () => {
    expect(pairSwissRound([])).toEqual({ pairs: [], bye: null, exhausted: false, repeats: 0 });
  });
});

describe("score groups", () => {
  it("pairs within score groups when it can", () => {
    // Four on 2 points, four on 0. Nobody should cross groups.
    const players = [
      ...field(4, () => ({ points: 2 })).map((entry, index) => ({ ...entry, playerKey: `top${index}`, displayName: `top${index}` })),
      ...field(4, () => ({ points: 0 })).map((entry, index) => ({ ...entry, playerKey: `bot${index}`, displayName: `bot${index}` })),
    ];
    const result = pairSwissRound(players);
    for (const pair of result.pairs) {
      expect(pair.white.points).toBe(pair.black.points);
    }
  });

  it("floats the minimum number of players when a group is odd", () => {
    // Three on 2, three on 1: exactly one pairing must cross.
    const players = [
      ...["a", "b", "c"].map((key) => player(key, { points: 2 })),
      ...["d", "e", "f"].map((key) => player(key, { points: 1 })),
    ];
    const result = pairSwissRound(players);
    const crossing = result.pairs.filter((pair) => pair.white.points !== pair.black.points);
    expect(crossing).toHaveLength(1);
  });

  it("prefers the smallest possible score gap when it must cross groups", () => {
    const players = [
      player("top", { points: 5 }),
      player("near", { points: 4 }),
      player("far", { points: 0 }),
      player("bottom", { points: 0 }),
    ];
    const result = pairSwissRound(players);
    const topPair = result.pairs.find((pair) => [pair.white.playerKey, pair.black.playerKey].includes("top"))!;
    const opponent = topPair.white.playerKey === "top" ? topPair.black.playerKey : topPair.white.playerKey;
    expect(opponent).toBe("near");
  });

  it("avoids floating the same player down twice running", () => {
    const players = [
      player("a", { points: 2, lastFloat: "down" }),
      player("b", { points: 2, lastFloat: null }),
      player("c", { points: 2, lastFloat: null }),
      player("d", { points: 1 }),
    ];
    const result = pairSwissRound(players);
    const crossing = result.pairs.find((pair) => pair.white.points !== pair.black.points)!;
    const floated = crossing.white.points > crossing.black.points ? crossing.white : crossing.black;
    expect(floated.playerKey).not.toBe("a");
  });
});

describe("repeat avoidance", () => {
  it("never repeats a pairing when an alternative exists", () => {
    const players = [
      player("a", { opponents: ["b"] }),
      player("b", { opponents: ["a"] }),
      player("c", { opponents: ["d"] }),
      player("d", { opponents: ["c"] }),
    ];
    const result = pairSwissRound(players);
    expect(result.repeats).toBe(0);
    expect(pairKeys(result)).not.toContain("a-b");
    expect(pairKeys(result)).not.toContain("c-d");
  });

  it("finds the one legal pairing in a tightly constrained field", () => {
    // Everyone has played everyone except one perfect matching. A greedy scan
    // walks into a dead end here; the matcher does not.
    const players = [
      player("a", { opponents: ["c", "d"] }),
      player("b", { opponents: ["c", "d"] }),
      player("c", { opponents: ["a", "b"] }),
      player("d", { opponents: ["a", "b"] }),
    ];
    const result = pairSwissRound(players);
    expect(result.exhausted).toBe(false);
    expect(pairKeys(result)).toEqual(["a-b", "c-d"]);
  });

  it("reports exhaustion instead of silently repeating a pairing", () => {
    // A four-player round robin is complete after three rounds.
    const players = [
      player("a", { opponents: ["b", "c", "d"] }),
      player("b", { opponents: ["a", "c", "d"] }),
      player("c", { opponents: ["a", "b", "d"] }),
      player("d", { opponents: ["a", "b", "c"] }),
    ];
    const result = pairSwissRound(players);
    expect(result.exhausted).toBe(true);
    expect(result.pairs).toHaveLength(0);
  });

  it("repeats only when explicitly permitted, and says how often", () => {
    const players = [
      player("a", { opponents: ["b", "c", "d"] }),
      player("b", { opponents: ["a", "c", "d"] }),
      player("c", { opponents: ["a", "b", "d"] }),
      player("d", { opponents: ["a", "b", "c"] }),
    ];
    const result = pairSwissRound(players, { allowRepeats: true });
    expect(result.exhausted).toBe(false);
    expect(result.pairs).toHaveLength(2);
    expect(result.repeats).toBe(2);
  });

  it("knows how many rounds a field can support", () => {
    expect(maxRoundsWithoutRepeat(4)).toBe(3);
    expect(maxRoundsWithoutRepeat(8)).toBe(7);
    expect(maxRoundsWithoutRepeat(1)).toBe(0);
  });
});

describe("colour balancing across a whole round", () => {
  it("gives players owed White the White pieces", () => {
    const players = [
      player("a", { colours: ["black", "black"] }),
      player("b", { colours: ["white", "white"] }),
      player("c", { colours: ["black", "black"] }),
      player("d", { colours: ["white", "white"] }),
    ];
    const result = pairSwissRound(players);
    for (const pair of result.pairs) {
      expect(colourBalance(pair.white.colours)).toBeLessThan(0);
      expect(colourBalance(pair.black.colours)).toBeGreaterThan(0);
    }
  });

  it("never gives a third consecutive colour when it can be avoided", () => {
    const players = [
      player("a", { colours: ["white", "white"] }),
      player("b", { colours: ["white", "white"] }),
      player("c", { colours: ["black", "black"] }),
      player("d", { colours: ["black", "black"] }),
    ];
    const result = pairSwissRound(players);
    for (const pair of result.pairs) {
      const whiteRun = consecutiveColours(pair.white.colours);
      const blackRun = consecutiveColours(pair.black.colours);
      expect(whiteRun.colour === "white" && whiteRun.count >= 2).toBe(false);
      expect(blackRun.colour === "black" && blackRun.count >= 2).toBe(false);
    }
  });

  it("keeps colour allocation roughly even over a simulated event", () => {
    const players = field(10, (index) => ({ rating: 1500 + index }));
    const history = new Map(players.map((entry) => [entry.playerKey, entry]));

    for (let round = 0; round < 5; round += 1) {
      const result = pairSwissRound(Array.from(history.values()));
      expect(result.exhausted).toBe(false);
      for (const pair of result.pairs) {
        const white = history.get(pair.white.playerKey)!;
        const black = history.get(pair.black.playerKey)!;
        white.colours = [...white.colours, "white"];
        black.colours = [...black.colours, "black"];
        white.opponents = [...white.opponents, black.playerKey];
        black.opponents = [...black.opponents, white.playerKey];
        // White wins every game, to keep the scores spread out.
        white.points += 1;
      }
    }

    // The Dutch system's hard limit is a colour difference of two.
    for (const entry of Array.from(history.values())) {
      expect(Math.abs(colourBalance(entry.colours)), `${entry.playerKey} colour balance`).toBeLessThanOrEqual(2);
    }
  });
});

describe("a full simulated Swiss event", () => {
  it("runs nine rounds of sixteen players with no repeat and no missed pairing", () => {
    const players = field(16, (index) => ({ rating: 2000 - index * 25 }));
    const state = new Map(players.map((entry) => [entry.playerKey, entry]));

    for (let round = 0; round < 9; round += 1) {
      const result = pairSwissRound(Array.from(state.values()));
      expect(result.exhausted, `round ${round + 1} could not be paired`).toBe(false);
      expect(result.repeats, `round ${round + 1} repeated a pairing`).toBe(0);
      expect(result.pairs, `round ${round + 1} board count`).toHaveLength(8);

      for (const pair of result.pairs) {
        const white = state.get(pair.white.playerKey)!;
        const black = state.get(pair.black.playerKey)!;
        expect(white.opponents).not.toContain(black.playerKey);
        white.colours = [...white.colours, "white"];
        black.colours = [...black.colours, "black"];
        white.opponents = [...white.opponents, black.playerKey];
        black.opponents = [...black.opponents, white.playerKey];
        // Higher-rated player wins, which is the least forgiving case for
        // score-group pairing.
        if (white.rating >= black.rating) white.points += 1;
        else black.points += 1;
      }
    }

    for (const entry of Array.from(state.values())) {
      expect(entry.opponents).toHaveLength(9);
      expect(new Set(entry.opponents).size).toBe(9);
    }
  });

  it("handles an odd field across several rounds, spreading the byes", () => {
    const players = field(9, (index) => ({ rating: 1800 - index * 20 }));
    const state = new Map(players.map((entry) => [entry.playerKey, entry]));
    const byes: string[] = [];

    for (let round = 0; round < 5; round += 1) {
      const result = pairSwissRound(Array.from(state.values()));
      expect(result.exhausted).toBe(false);
      expect(result.pairs).toHaveLength(4);
      expect(result.bye).not.toBeNull();

      const bye = state.get(result.bye!.playerKey)!;
      bye.byes += 1;
      bye.points += 1;
      byes.push(bye.playerKey);

      for (const pair of result.pairs) {
        const white = state.get(pair.white.playerKey)!;
        const black = state.get(pair.black.playerKey)!;
        white.colours = [...white.colours, "white"];
        black.colours = [...black.colours, "black"];
        white.opponents = [...white.opponents, black.playerKey];
        black.opponents = [...black.opponents, white.playerKey];
        white.points += 0.5;
        black.points += 0.5;
      }
    }

    // Five rounds, nine players: no one should sit out twice.
    expect(new Set(byes).size).toBe(5);
  });

  it("is deterministic: the same standings always pair the same way", () => {
    const players = field(12, (index) => ({ points: index % 4, rating: 1400 + index * 10 }));
    const first = pairSwissRound(players);
    const second = pairSwissRound([...players].reverse());
    expect(pairKeys(first)).toEqual(pairKeys(second));
  });

  it("orders boards by the standings", () => {
    const players = [
      player("top", { points: 5, rating: 2000 }),
      player("second", { points: 5, rating: 1900 }),
      player("third", { points: 1, rating: 1800 }),
      player("fourth", { points: 1, rating: 1700 }),
    ];
    const result = pairSwissRound(players);
    expect(Math.max(result.pairs[0].white.points, result.pairs[0].black.points)).toBe(5);
  });
});

describe("ordering", () => {
  it("sorts by score, then rating, then key", () => {
    const ordered = orderPlayers([
      player("c", { points: 1, rating: 1500 }),
      player("a", { points: 2, rating: 1400 }),
      player("b", { points: 1, rating: 1600 }),
    ]);
    expect(ordered.map((entry) => entry.playerKey)).toEqual(["a", "b", "c"]);
  });

  it("selects no bye from an empty field", () => {
    expect(selectByePlayer([])).toBeNull();
  });
});
