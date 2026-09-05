import { describe, expect, it } from "vitest";
import {
  buildArenaPairings,
  hasMet,
  mostRecentOpponents,
  pairingHistory,
  pickOpponent,
  resolveColors,
  selectByeIndex,
  type GameEdge,
  type PairingCandidate,
} from "./pairing";

function player(playerKey: string, overrides: Partial<PairingCandidate> = {}): PairingCandidate {
  return {
    playerKey,
    displayName: playerKey,
    points: 0,
    gamesPlayed: 0,
    lastColor: "",
    waitingMs: 0,
    ...overrides,
  };
}

const noContext = { history: new Map<string, Set<string>>(), recent: new Map<string, string>() };

describe("pairingHistory", () => {
  const games: GameEdge[] = [
    { whiteKey: "a", blackKey: "b", status: "completed" },
    { whiteKey: "c", blackKey: "a", status: "active" },
    { whiteKey: "a", blackKey: "d", status: "aborted" },
    { whiteKey: "a", blackKey: "", status: "completed" },
  ];

  it("records meetings in both directions", () => {
    const history = pairingHistory(games);
    expect(hasMet(history, "a", "b")).toBe(true);
    expect(hasMet(history, "b", "a")).toBe(true);
  });

  it("counts an active game as a meeting", () => {
    expect(hasMet(pairingHistory(games), "a", "c")).toBe(true);
  });

  it("ignores aborted games, which were never played", () => {
    expect(hasMet(pairingHistory(games), "a", "d")).toBe(false);
  });

  it("ignores byes", () => {
    expect(hasMet(pairingHistory(games), "a", "")).toBe(false);
  });
});

describe("mostRecentOpponents", () => {
  it("reports each player's latest opponent", () => {
    const recent = mostRecentOpponents([
      { whiteKey: "a", blackKey: "b", status: "completed", createdAt: 100 },
      { whiteKey: "a", blackKey: "c", status: "completed", createdAt: 200 },
    ]);
    expect(recent.get("a")).toBe("c");
    expect(recent.get("c")).toBe("a");
    expect(recent.get("b")).toBe("a");
  });
});

describe("opponent selection", () => {
  it("prefers an opponent close in the standings", () => {
    const me = player("me", { points: 6 });
    const candidates = [player("far", { points: 0 }), player("near", { points: 6 })];
    expect(pickOpponent(me, candidates, noContext)!.candidate.playerKey).toBe("near");
  });

  it("avoids an immediate rematch even at the cost of score proximity", () => {
    const me = player("me", { points: 6 });
    const recent = new Map([["me", "near"]]);
    const candidates = [player("near", { points: 6 }), player("far", { points: 0 })];
    const choice = pickOpponent(me, candidates, { history: new Map(), recent });
    expect(choice!.candidate.playerKey).toBe("far");
  });

  it("still allows a rematch when it is the only option", () => {
    const me = player("me");
    const recent = new Map([["me", "only"]]);
    const choice = pickOpponent(me, [player("only")], { history: new Map(), recent });
    expect(choice!.candidate.playerKey).toBe("only");
  });

  it("prefers a fresh opponent over one already played", () => {
    const me = player("me", { points: 4 });
    const history = new Map([["me", new Set(["played"])]]);
    const candidates = [player("played", { points: 4 }), player("fresh", { points: 2 })];
    expect(pickOpponent(me, candidates, { history, recent: new Map() })!.candidate.playerKey).toBe("fresh");
  });

  it("relaxes score proximity for a player who has waited", () => {
    // Waiting long enough zeroes the proximity weight, so the far-off score
    // stops being a reason not to pair.
    const patient = player("patient", { points: 10, waitingMs: 40_000 });
    const candidates = [player("far", { points: 0 }), player("alsoFar", { points: 1 })];
    const choice = pickOpponent(patient, candidates, noContext);
    expect(choice!.penalty).toBe(0);
  });

  it("nudges apart two players who last had the same colour", () => {
    const me = player("me", { lastColor: "white" });
    const candidates = [player("sameColour", { lastColor: "white" }), player("otherColour", { lastColor: "black" })];
    expect(pickOpponent(me, candidates, noContext)!.candidate.playerKey).toBe("otherColour");
  });

  it("returns nothing when there is nobody to pair with", () => {
    expect(pickOpponent(player("me"), [], noContext)).toBeNull();
  });
});

describe("colour assignment", () => {
  it("gives White to the player who had Black", () => {
    const colors = resolveColors(player("a", { lastColor: "black" }), player("b", { lastColor: "white" }));
    expect(colors.white.playerKey).toBe("a");
    expect(colors.black.playerKey).toBe("b");
  });

  it("gives White to the player who did not just have it", () => {
    const colors = resolveColors(player("a", { lastColor: "white" }), player("b", { lastColor: "" }));
    expect(colors.white.playerKey).toBe("b");
  });

  it("is deterministic when neither player has a preference", () => {
    const first = resolveColors(player("zoe"), player("ana"));
    const second = resolveColors(player("ana"), player("zoe"));
    expect(first.white.playerKey).toBe("ana");
    expect(second.white.playerKey).toBe("ana");
  });
});

describe("buildArenaPairings", () => {
  it("pairs everyone when the count is even", () => {
    const { pairs, unpaired } = buildArenaPairings([player("a"), player("b"), player("c"), player("d")], noContext);
    expect(pairs).toHaveLength(2);
    expect(unpaired).toHaveLength(0);
  });

  it("leaves exactly one player waiting when the count is odd", () => {
    const { pairs, unpaired } = buildArenaPairings([player("a"), player("b"), player("c")], noContext);
    expect(pairs).toHaveLength(1);
    expect(unpaired).toHaveLength(1);
  });

  it("never puts a player into two games at once", () => {
    const { pairs } = buildArenaPairings([player("a"), player("b"), player("c"), player("d"), player("e"), player("f")], noContext);
    const seen = pairs.flatMap((pair) => [pair.white.playerKey, pair.black.playerKey]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("serves the longest-waiting player first", () => {
    const { pairs } = buildArenaPairings(
      [player("fresh", { waitingMs: 0 }), player("patient", { waitingMs: 60_000 }), player("middle", { waitingMs: 10_000 })],
      noContext
    );
    const paired = [pairs[0].white.playerKey, pairs[0].black.playerKey];
    expect(paired).toContain("patient");
  });

  it("avoids rematches across a whole pairing round", () => {
    // a just played b, c just played d. Nobody should get an instant rematch.
    const recent = new Map([
      ["a", "b"],
      ["b", "a"],
      ["c", "d"],
      ["d", "c"],
    ]);
    const { pairs } = buildArenaPairings([player("a"), player("b"), player("c"), player("d")], { history: new Map(), recent });
    for (const pair of pairs) {
      expect(recent.get(pair.white.playerKey)).not.toBe(pair.black.playerKey);
    }
  });

  it("produces the same pairings from the same input", () => {
    const input = [player("a", { points: 2 }), player("b", { points: 2 }), player("c", { points: 0 }), player("d", { points: 0 })];
    const first = buildArenaPairings(input, noContext);
    const second = buildArenaPairings([...input].reverse(), noContext);
    const key = (result: ReturnType<typeof buildArenaPairings>) =>
      result.pairs.map((pair) => `${pair.white.playerKey}-${pair.black.playerKey}`).sort().join("|");
    expect(key(first)).toBe(key(second));
  });

  it("pairs nobody when only one player is waiting", () => {
    const { pairs, unpaired } = buildArenaPairings([player("lonely")], noContext);
    expect(pairs).toHaveLength(0);
    expect(unpaired).toHaveLength(1);
  });
});

describe("bye selection", () => {
  it("gives the bye to the lowest-placed player without one", () => {
    const standings = [
      { playerKey: "first", byes: 0 },
      { playerKey: "second", byes: 0 },
      { playerKey: "last", byes: 0 },
    ];
    expect(selectByeIndex(standings)).toBe(2);
  });

  it("skips a player who has already had a bye", () => {
    const standings = [
      { playerKey: "first", byes: 0 },
      { playerKey: "second", byes: 0 },
      { playerKey: "last", byes: 1 },
    ];
    expect(selectByeIndex(standings)).toBe(1);
  });

  it("falls back to the lowest-placed player when everyone has had one", () => {
    const standings = [
      { playerKey: "first", byes: 1 },
      { playerKey: "last", byes: 1 },
    ];
    expect(selectByeIndex(standings)).toBe(1);
  });
});
