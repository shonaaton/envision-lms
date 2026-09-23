import { describe, expect, it } from "vitest";
import { computeStandings, CURRENT_RULES_VERSION, defaultScoringOptions, normalizeRulesVersion, type ScoredGame } from "./scoring";

const players = ["a", "b", "c", "d"].map((key) => ({ playerKey: key, displayName: key.toUpperCase(), rating: 1500 }));

function game(id: string, whiteKey: string, blackKey: string, result: ScoredGame["result"], termination = "checkmate", endedAt = Number(id)): ScoredGame {
  return { id, source: "swiss", status: "completed", result, termination, whiteKey, blackKey, plyCount: blackKey ? 40 : 0, endedAt };
}

function byKey(version: number, games: ScoredGame[], field = players) {
  const standings = computeStandings(field, games, defaultScoringOptions({ type: "swiss", rulesVersion: version }));
  return Object.fromEntries(standings.map((entry) => [entry.playerKey, entry]));
}

describe("rules version", () => {
  it("creates new tournaments on v3", () => expect(CURRENT_RULES_VERSION).toBe(3));
  it("keeps stored versions", () => {
    expect(normalizeRulesVersion(undefined)).toBe(1);
    expect(normalizeRulesVersion(2)).toBe(2);
    expect(normalizeRulesVersion(3)).toBe(3);
  });
});

describe("unplayed rounds in Swiss tie-breaks (v3)", () => {
  const three = players.slice(0, 3);
  const withBye = [game("1", "a", "", "1-0", "bye"), game("2", "b", "c", "1-0")];

  it("values a bye as a game against a dummy opponent on the player's own score", () => {
    const table = byKey(3, withBye, three);
    expect(table.a.buchholz).toBe(1);
    expect(table.a.sonnebornBerger).toBe(1);
  });

  it("left a bye worth nothing in v2, which is preserved for events played under it", () => {
    const table = byKey(2, withBye, three);
    expect(table.a.buchholz).toBe(0);
    expect(table.a.sonnebornBerger).toBe(0);
  });

  it("does not credit a forfeit winner with the no-show's score", () => {
    const games = [
      game("1", "a", "b", "0-1", "forfeit"),
      game("2", "c", "d", "1-0"),
      game("3", "b", "c", "1/2-1/2"),
      game("4", "a", "d", "1-0"),
    ];
    const table = byKey(3, games);
    // b: forfeit win (dummy on b's own 1.5) + draw with c (1.5).
    expect(table.b.points).toBe(1.5);
    expect(table.b.buchholz).toBe(1.5 + 1.5);
    // a: forfeit loss (dummy on a's own 1) + win over d (0).
    expect(table.a.buchholz).toBe(1 + 0);
    expect(table.a.sonnebornBerger).toBe(0);
  });
});
