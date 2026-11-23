import { describe, expect, it } from "vitest";
import { getBlogPost } from "@/lib/blog";
import { eloExpected, matchOdds } from "@/lib/blog/matchOdds";

describe("matchOdds", () => {
  it("splits an even match down the middle", () => {
    const odds = matchOdds(0.2, 0.2);
    expect(odds.a).toBeCloseTo(0.5, 10);
    expect(odds.b).toBeCloseTo(0.5, 10);
  });

  it("always adds up to one", () => {
    for (const [a, b, tb] of [[0.1, 0.3, 0.5], [0.3, 0.05, 0.9], [0, 0, 0.2], [1, 0, 0.5]]) {
      const odds = matchOdds(a, b, { tiebreakA: tb });
      expect(odds.a + odds.b).toBeCloseTo(1, 10);
      expect(odds.scores.reduce((sum, score) => sum + score.chance, 0)).toBeCloseTo(1, 10);
    }
  });

  it("goes to tiebreaks every time when every game is drawn", () => {
    const odds = matchOdds(0, 0, { tiebreakA: 0.7 });
    expect(odds.tiebreak).toBeCloseTo(1, 10);
    expect(odds.a).toBeCloseTo(0.7, 10);
  });

  it("matches a hand count on a two-game match", () => {
    // Win or draw at .5 each: W+W, W+D, D+W win outright (.75); only D+D is level (.25).
    const odds = matchOdds(0.5, 0, { games: 2, tiebreakA: 0 });
    expect(odds.a).toBeCloseTo(0.75, 10);
    expect(odds.tiebreak).toBeCloseTo(0.25, 10);
  });

  it("gives a 72-point favourite about 60% per game", () => {
    expect(eloExpected(72)).toBeCloseTo(0.602, 3);
  });
});

describe("the World Championship predictions post", () => {
  // The copy quotes these numbers; if a preset moves, the text must move too.
  const post = getBlogPost("world-chess-championship-2026-predictions");
  const presets = post?.body.find((block) => block.type === "matchPredictor");
  const sindarov = (label: string) => {
    if (presets?.type !== "matchPredictor") throw new Error("no calculator");
    const preset = presets.presets.find((item) => item.label === label);
    if (!preset) throw new Error(label);
    return Math.round(matchOdds(preset.aWin / 100, preset.bWin / 100).b * 100);
  };

  it("quotes the calculator's own numbers", () => {
    expect(sindarov("What the odds say")).toBe(76);
    expect(sindarov("Ratings only")).toBe(89);
    expect(sindarov("Our prediction: 50-50")).toBe(50);
    // "almost a 1 in 5 chance" of tiebreaks.
    expect(matchOdds(0.17, 0.17).tiebreak).toBeGreaterThan(0.17);
    expect(matchOdds(0.17, 0.17).tiebreak).toBeLessThan(0.2);
    expect(100 - sindarov("Gukesh at his best")).toBe(59);
  });
});
