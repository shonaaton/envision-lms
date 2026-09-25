import { describe, expect, it } from "vitest";
import { buildArenaPairings, freeSinceMs, REMATCH_HOLD_MS, rematchHeld, type PairingCandidate } from "./pairing";

function player(playerKey: string, overrides: Partial<PairingCandidate> = {}): PairingCandidate {
  return { playerKey, displayName: playerKey, points: 0, gamesPlayed: 1, lastColor: "", waitingMs: 0, ...overrides };
}

// a and b just played each other.
const recent = new Map([
  ["a", "b"],
  ["b", "a"],
]);
const history = new Map([
  ["a", new Set(["b"])],
  ["b", new Set(["a"])],
]);

describe("immediate rematches", () => {
  it("holds back a rematch while other boards are still being played", () => {
    const { pairs, unpaired } = buildArenaPairings([player("a"), player("b")], { history, recent, playing: 4 });
    expect(pairs).toHaveLength(0);
    expect(unpaired.map((entry) => entry.playerKey).sort()).toEqual(["a", "b"]);
  });

  it("pairs each with someone new when someone new is free", () => {
    const { pairs } = buildArenaPairings([player("a"), player("b"), player("c"), player("d")], { history, recent, playing: 0 });
    const keys = pairs.map((pair) => [pair.white.playerKey, pair.black.playerKey].sort().join("-"));
    expect(keys).not.toContain("a-b");
    expect(pairs).toHaveLength(2);
  });

  it("allows the rematch once both have waited out the hold", () => {
    const waited = REMATCH_HOLD_MS + 1;
    const { pairs } = buildArenaPairings([player("a", { waitingMs: waited }), player("b", { waitingMs: waited })], { history, recent, playing: 4 });
    expect(pairs).toHaveLength(1);
  });

  it("does not hold a rematch when nobody else could ever become free", () => {
    const { pairs } = buildArenaPairings([player("a"), player("b")], { history, recent, playing: 0 });
    expect(pairs).toHaveLength(1);
  });

  it("does not treat an ordinary pairing as a rematch", () => {
    expect(rematchHeld(player("a"), player("c"), 2, { history, recent, playing: 4 })).toBe(false);
  });

  it("keeps a held player available for the next pass rather than dropping the queue", () => {
    // a is held back from b, but c is still paired with b.
    const { pairs, unpaired } = buildArenaPairings(
      [player("a", { waitingMs: 3000 }), player("b", { waitingMs: 2000 }), player("c", { waitingMs: 1000 })],
      { history, recent, playing: 2 }
    );
    expect(pairs.map((pair) => [pair.white.playerKey, pair.black.playerKey].sort().join("-"))).toEqual(["a-c"]);
    expect(unpaired.map((entry) => entry.playerKey)).toEqual(["b"]);
  });
});

describe("waiting time", () => {
  it("counts from the end of the player's last game, not from joining", () => {
    expect(freeSinceMs({ lastGameEndedAt: 5000, joinedAt: 1000, startedAt: 0 })).toBe(5000);
  });

  it("counts from a resume after a pause", () => {
    expect(freeSinceMs({ lastGameEndedAt: 5000, queuedAt: 9000 })).toBe(9000);
  });

  it("falls back to the start for a player who has not played yet", () => {
    expect(freeSinceMs({ joinedAt: 100, startedAt: 2000 })).toBe(2000);
  });
});
