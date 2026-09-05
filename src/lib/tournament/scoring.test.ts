import { describe, expect, it } from "vitest";
import {
  computeStandings,
  defaultScoringOptions,
  isOnStreak,
  scoreArenaGame,
  type ScoredGame,
  type ScoringOptions,
  type ScoringPlayer,
} from "./scoring";

const ANA: ScoringPlayer = { playerKey: "user:ana", displayName: "Ana" };
const BEN: ScoringPlayer = { playerKey: "user:ben", displayName: "Ben" };
const CAI: ScoringPlayer = { playerKey: "user:cai", displayName: "Cai" };
const DEV: ScoringPlayer = { playerKey: "user:dev", displayName: "Dev" };

let clock = 0;

function game(partial: Partial<ScoredGame> & { whiteKey: string; blackKey: string; result: ScoredGame["result"] }): ScoredGame {
  clock += 1000;
  return {
    id: `g${clock}`,
    source: "arena",
    status: "completed",
    termination: "checkmate",
    plyCount: 40,
    endedAt: clock,
    ...partial,
  };
}

function options(overrides: Partial<ScoringOptions> = {}): ScoringOptions {
  return {
    rulesVersion: 2,
    type: "arena",
    arenaStreaks: true,
    earlyDrawMoveLimit: 10,
    drawStreakLimit: 2,
    berserkMinPlies: 7,
    scoringCutoff: Number.POSITIVE_INFINITY,
    ...overrides,
  };
}

/**
 * Ana plays the given sequence of results, always as White against a rotating
 * cast, so no scoring rule is confused by a repeated opponent.
 */
function anaSequence(results: Array<"W" | "D" | "L">, overrides: Partial<ScoredGame> = {}) {
  const cast = [BEN, CAI, DEV];
  return results.map((outcome, index) =>
    game({
      whiteKey: ANA.playerKey,
      blackKey: cast[index % cast.length].playerKey,
      result: outcome === "W" ? "1-0" : outcome === "L" ? "0-1" : "1/2-1/2",
      termination: outcome === "D" ? "draw_agreement" : "checkmate",
      ...overrides,
    })
  );
}

function anaPoints(results: Array<"W" | "D" | "L">, opts: Partial<ScoringOptions> = {}, overrides: Partial<ScoredGame> = {}) {
  const standings = computeStandings([ANA, BEN, CAI, DEV], anaSequence(results, overrides), options(opts));
  return standings.find((entry) => entry.playerKey === ANA.playerKey)!.points;
}

describe("arena streak scoring (rules v2)", () => {
  it("scores a lone win as 2", () => {
    expect(anaPoints(["W"])).toBe(2);
  });

  it("does not double the two wins that establish the streak", () => {
    expect(anaPoints(["W", "W"])).toBe(4);
  });

  it("doubles the game after a streak is established, including draws", () => {
    // The regression this whole rebuild started from: 2 + 2 + 2, not 2 + 4 + 1.
    expect(anaPoints(["W", "W", "D"])).toBe(6);
  });

  it("doubles the third consecutive win", () => {
    expect(anaPoints(["W", "W", "W"])).toBe(8);
  });

  it("keeps doubling while the streak holds", () => {
    expect(anaPoints(["W", "W", "W", "W"])).toBe(12);
  });

  it("breaks the streak on a draw", () => {
    // 2 + 2 + 2 (doubled draw) + 2 (streak broken, back to base)
    expect(anaPoints(["W", "W", "D", "W"])).toBe(8);
  });

  it("breaks the streak on a loss", () => {
    expect(anaPoints(["W", "W", "L", "W"])).toBe(6);
  });

  it("rebuilds a streak after it breaks", () => {
    // W W (4) L (0) W W (4) W (4) = 12
    expect(anaPoints(["W", "W", "L", "W", "W", "W"])).toBe(12);
  });

  it("never doubles a loss", () => {
    expect(anaPoints(["W", "W", "L"])).toBe(4);
  });

  it("ignores streaks entirely when the tournament disables them", () => {
    expect(anaPoints(["W", "W", "W"], { arenaStreaks: false })).toBe(6);
  });

  it("identifies the on-fire state from the two most recent results", () => {
    expect(isOnStreak([])).toBe(false);
    expect(isOnStreak(["W"])).toBe(false);
    expect(isOnStreak(["W", "W"])).toBe(true);
    expect(isOnStreak(["W", "W", "D"])).toBe(false);
    expect(isOnStreak(["L", "W", "W"])).toBe(true);
  });
});

describe("arena streak scoring (legacy rules v1)", () => {
  const v1 = { rulesVersion: 1 as const };

  it("preserves the historical off-by-one so old events keep their scores", () => {
    // Documented legacy behaviour, deliberately not "fixed" for v1 events.
    expect(anaPoints(["W", "W", "D"], v1)).toBe(7);
    expect(anaPoints(["W", "W"], v1)).toBe(6);
    expect(anaPoints(["W", "W", "W"], v1)).toBe(10);
  });
});

describe("early and repeated draws", () => {
  it("scores a draw before the move limit as zero", () => {
    expect(anaPoints(["D"], {}, { plyCount: 6 })).toBe(0);
  });

  it("scores a normal-length draw as one", () => {
    expect(anaPoints(["D"], {}, { plyCount: 30 })).toBe(1);
  });

  it("stops paying for a run of draws once the limit is reached", () => {
    // Third consecutive draw scores nothing.
    expect(anaPoints(["D", "D", "D"], {}, { plyCount: 30 })).toBe(2);
  });

  it("does not double a devalued draw even on a streak", () => {
    expect(anaPoints(["W", "W", "D"], {}, { plyCount: 4 })).toBe(4);
  });
});

describe("berserk", () => {
  const berserkWin = (plyCount: number) =>
    computeStandings(
      [ANA, BEN],
      [game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0", berserkWhite: true, plyCount })],
      options()
    ).find((entry) => entry.playerKey === ANA.playerKey)!.points;

  it("pays the bonus on a berserked win of real length", () => {
    expect(berserkWin(20)).toBe(3);
  });

  it("withholds the bonus when the game was too short", () => {
    expect(berserkWin(4)).toBe(2);
  });

  it("pays nothing extra for a berserked loss", () => {
    const standings = computeStandings(
      [ANA, BEN],
      [game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "0-1", berserkWhite: true, plyCount: 30 })],
      options()
    );
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.points).toBe(0);
  });

  it("adds the berserk bonus on top of a doubled streak score", () => {
    const games = [
      ...anaSequence(["W", "W"]),
      game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0", berserkWhite: true, plyCount: 30 }),
    ];
    const standings = computeStandings([ANA, BEN, CAI, DEV], games, options());
    // 2 + 2 + (2 doubled = 4) + 1 berserk
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.points).toBe(9);
  });

  it("ignores the berserk flag of the side that did not berserk", () => {
    const standings = computeStandings(
      [ANA, BEN],
      [game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "0-1", berserkWhite: true, plyCount: 30 })],
      options()
    );
    expect(standings.find((entry) => entry.playerKey === BEN.playerKey)!.points).toBe(2);
  });

  it("pays the legacy flat bonus for v1 events regardless of length", () => {
    const standings = computeStandings(
      [ANA, BEN],
      [game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0", berserkWhite: true, plyCount: 2 })],
      options({ rulesVersion: 1 })
    );
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.points).toBe(3);
  });
});

describe("swiss scoring", () => {
  const swiss = options({ type: "swiss", rulesVersion: 2 });
  const swissGame = (partial: Parameters<typeof game>[0]) => game({ ...partial, source: "swiss" });

  it("scores win, draw and loss as 1, 0.5 and 0", () => {
    const standings = computeStandings(
      [ANA, BEN, CAI],
      [
        swissGame({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0" }),
        swissGame({ whiteKey: ANA.playerKey, blackKey: CAI.playerKey, result: "1/2-1/2" }),
      ],
      swiss
    );
    const byKey = Object.fromEntries(standings.map((entry) => [entry.playerKey, entry]));
    expect(byKey[ANA.playerKey].points).toBe(1.5);
    expect(byKey[BEN.playerKey].points).toBe(0);
    expect(byKey[CAI.playerKey].points).toBe(0.5);
  });

  it("never applies arena streak scoring to a swiss game", () => {
    const games = [
      swissGame({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0" }),
      swissGame({ whiteKey: ANA.playerKey, blackKey: CAI.playerKey, result: "1-0" }),
      swissGame({ whiteKey: ANA.playerKey, blackKey: DEV.playerKey, result: "1-0" }),
    ];
    const standings = computeStandings([ANA, BEN, CAI, DEV], games, swiss);
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.points).toBe(3);
  });

  it("scores a bye as a point that is not a win", () => {
    const standings = computeStandings(
      [ANA, BEN],
      [swissGame({ whiteKey: ANA.playerKey, blackKey: "", result: "1-0", termination: "bye" })],
      swiss
    );
    const ana = standings.find((entry) => entry.playerKey === ANA.playerKey)!;
    expect(ana.points).toBe(1);
    expect(ana.byes).toBe(1);
    expect(ana.wins).toBe(0);
    expect(ana.gamesPlayed).toBe(0);
  });

  it("counts a legacy bye as a win, as v1 events recorded it", () => {
    const standings = computeStandings(
      [ANA, BEN],
      [swissGame({ whiteKey: ANA.playerKey, blackKey: "", result: "1-0", termination: "bye" })],
      options({ type: "swiss", rulesVersion: 1 })
    );
    const ana = standings.find((entry) => entry.playerKey === ANA.playerKey)!;
    expect(ana.points).toBe(1);
    expect(ana.wins).toBe(1);
    expect(ana.gamesPlayed).toBe(1);
  });

  it("does not let a bye establish or extend a streak", () => {
    // Scored with arena rules, where a wrongly-counted bye would double the
    // third game: 2 + 1 + 2 if the bye is inert, 2 + 1 + 4 if it is not.
    const games = [
      game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0" }),
      game({ whiteKey: ANA.playerKey, blackKey: "", result: "1-0", termination: "bye" }),
      game({ whiteKey: ANA.playerKey, blackKey: CAI.playerKey, result: "1-0" }),
    ];
    const standings = computeStandings([ANA, BEN, CAI], games, options({ type: "arena", rulesVersion: 2 }));
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.points).toBe(5);
  });
});

describe("tie-breaks", () => {
  // Ana and Ben both finish on 1 point. Ana beat Cai (who scores 1);
  // Ben beat Dev (who scores 0). Ana's win is worth more.
  const games = [
    game({ source: "swiss", whiteKey: ANA.playerKey, blackKey: CAI.playerKey, result: "1-0" }),
    game({ source: "swiss", whiteKey: BEN.playerKey, blackKey: DEV.playerKey, result: "1-0" }),
    game({ source: "swiss", whiteKey: CAI.playerKey, blackKey: DEV.playerKey, result: "1-0" }),
  ];

  it("ranks the player who beat stronger opposition first (Sonneborn-Berger)", () => {
    const standings = computeStandings([ANA, BEN, CAI, DEV], games, options({ type: "swiss", rulesVersion: 2 }));
    const ana = standings.find((entry) => entry.playerKey === ANA.playerKey)!;
    const ben = standings.find((entry) => entry.playerKey === BEN.playerKey)!;
    expect(ana.sonnebornBerger).toBe(1);
    expect(ben.sonnebornBerger).toBe(0);
    expect(standings.findIndex((entry) => entry.playerKey === ANA.playerKey)).toBeLessThan(
      standings.findIndex((entry) => entry.playerKey === BEN.playerKey)
    );
  });

  it("still computes Buchholz for reporting and for v1 events", () => {
    const standings = computeStandings([ANA, BEN, CAI, DEV], games, options({ type: "swiss", rulesVersion: 2 }));
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.buchholz).toBe(1);
    expect(standings.find((entry) => entry.playerKey === BEN.playerKey)!.buchholz).toBe(0);
  });

  it("gives a half-point draw half weight in Sonneborn-Berger", () => {
    const drawGames = [
      game({ source: "swiss", whiteKey: ANA.playerKey, blackKey: CAI.playerKey, result: "1/2-1/2" }),
      game({ source: "swiss", whiteKey: CAI.playerKey, blackKey: DEV.playerKey, result: "1-0" }),
    ];
    const standings = computeStandings([ANA, CAI, DEV], drawGames, options({ type: "swiss", rulesVersion: 2 }));
    // Cai finishes on 1.5; half of that is Ana's SB.
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.sonnebornBerger).toBe(0.75);
  });
});

describe("scoring cutoff", () => {
  it("excludes games that finished after the cutoff", () => {
    const early = game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0" });
    const late = game({ whiteKey: ANA.playerKey, blackKey: CAI.playerKey, result: "1-0" });
    const standings = computeStandings([ANA, BEN, CAI], [early, late], options({ scoringCutoff: early.endedAt }));
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.points).toBe(2);
  });

  it("produces the same table regardless of when the cutoff is observed", () => {
    const early = game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "1-0" });
    const late = game({ whiteKey: ANA.playerKey, blackKey: CAI.playerKey, result: "1-0" });
    const observedNow = computeStandings([ANA, BEN, CAI], [early, late], options({ scoringCutoff: early.endedAt }));
    const observedLater = computeStandings([ANA, BEN, CAI], [early, late], options({ scoringCutoff: early.endedAt }));
    expect(observedNow).toEqual(observedLater);
  });

  it("ignores unfinished games", () => {
    const standings = computeStandings(
      [ANA, BEN],
      [game({ whiteKey: ANA.playerKey, blackKey: BEN.playerKey, result: "*", status: "active" })],
      options()
    );
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.gamesPlayed).toBe(0);
  });
});

describe("determinism", () => {
  it("orders games by completion time, not by insertion order", () => {
    const first = { ...anaSequence(["W"])[0], endedAt: 100 };
    const second = { ...anaSequence(["W"])[0], id: "second", blackKey: CAI.playerKey, endedAt: 200 };
    const third = { ...anaSequence(["D"])[0], id: "third", blackKey: DEV.playerKey, endedAt: 300 };
    const forwards = computeStandings([ANA, BEN, CAI, DEV], [first, second, third], options());
    const shuffled = computeStandings([ANA, BEN, CAI, DEV], [third, first, second], options());
    expect(forwards).toEqual(shuffled);
    expect(forwards.find((entry) => entry.playerKey === ANA.playerKey)!.points).toBe(6);
  });
});

describe("option resolution", () => {
  it("treats a tournament with no rulesVersion as legacy", () => {
    expect(defaultScoringOptions({ type: "arena" }).rulesVersion).toBe(1);
  });

  it("reads rules v2 from the tournament", () => {
    expect(defaultScoringOptions({ type: "arena", rulesVersion: 2 }).rulesVersion).toBe(2);
  });
});

describe("scoreArenaGame is the single implementation", () => {
  it("agrees with the standings table for the same game", () => {
    const games = anaSequence(["W", "W", "D"]);
    const standings = computeStandings([ANA, BEN, CAI, DEV], games, options());
    const perGame = games.reduce((total, current, index) => {
      const priorResults = ["W", "W", "D"].slice(0, index).map((r) => r);
      return (
        total +
        scoreArenaGame({
          game: current,
          playerKey: ANA.playerKey,
          priorResults,
          legacyStreak: 0,
          options: options(),
        })
      );
    }, 0);
    expect(perGame).toBe(standings.find((entry) => entry.playerKey === ANA.playerKey)!.points);
  });
});

describe("streak state exposed to clients", () => {
  it("marks a player on fire after two consecutive wins", () => {
    const standings = computeStandings([ANA, BEN, CAI, DEV], anaSequence(["W", "W"]), options());
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.onStreak).toBe(true);
  });

  it("does not mark a player on fire after one win", () => {
    const standings = computeStandings([ANA, BEN, CAI, DEV], anaSequence(["W"]), options());
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.onStreak).toBe(false);
  });

  it("clears the flame when the streak breaks", () => {
    const standings = computeStandings([ANA, BEN, CAI, DEV], anaSequence(["W", "W", "D"]), options());
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.onStreak).toBe(false);
  });

  it("never marks a swiss player on fire", () => {
    const games = anaSequence(["W", "W"]).map((entry) => ({ ...entry, source: "swiss" as const }));
    const standings = computeStandings([ANA, BEN, CAI, DEV], games, options({ type: "swiss" }));
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.onStreak).toBe(false);
  });

  it("never marks a legacy v1 player on fire, since v1 has no doubling rule", () => {
    const standings = computeStandings([ANA, BEN, CAI, DEV], anaSequence(["W", "W"]), options({ rulesVersion: 1 }));
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.onStreak).toBe(false);
  });

  it("stays off when the tournament disables streaks", () => {
    const standings = computeStandings([ANA, BEN, CAI, DEV], anaSequence(["W", "W"]), options({ arenaStreaks: false }));
    expect(standings.find((entry) => entry.playerKey === ANA.playerKey)!.onStreak).toBe(false);
  });

  it("agrees with what the next game actually scores", () => {
    const onFire = computeStandings([ANA, BEN, CAI, DEV], anaSequence(["W", "W"]), options()).find(
      (entry) => entry.playerKey === ANA.playerKey
    )!;
    const afterNext = computeStandings([ANA, BEN, CAI, DEV], anaSequence(["W", "W", "W"]), options()).find(
      (entry) => entry.playerKey === ANA.playerKey
    )!;
    expect(onFire.onStreak).toBe(true);
    // The doubled third win is worth 4, so the total rises by 4, not 2.
    expect(afterNext.points - onFire.points).toBe(4);
  });
});
