import { describe, expect, it } from "vitest";
import { applyLeaderboardRows, findMyPairing, mergeLiveGames, rankOf, type LeaderboardRow } from "./leaderboard";

const standings = [
  { playerKey: "user:a", displayName: "Ana", rating: 1500, points: 2, gamesPlayed: 1, wins: 1 },
  { playerKey: "user:b", displayName: "Ben", rating: 1400, points: 0, gamesPlayed: 1, wins: 0 },
  { playerKey: "user:c", displayName: "Cai", rating: 1300, points: 0, gamesPlayed: 0, wins: 0 },
];

describe("applyLeaderboardRows", () => {
  it("merges new numbers while keeping names the client already has", () => {
    const rows: LeaderboardRow[] = [
      ["user:b", 4, 2, 2],
      ["user:a", 2, 1, 1],
      ["user:c", 0, 0, 0],
    ];
    const next = applyLeaderboardRows(standings, rows);
    expect(next[0]).toMatchObject({ playerKey: "user:b", displayName: "Ben", points: 4, wins: 2 });
    expect(next[1]).toMatchObject({ playerKey: "user:a", displayName: "Ana", points: 2 });
  });

  it("takes the server's row order as the ranking", () => {
    const rows: LeaderboardRow[] = [
      ["user:c", 6, 3, 3],
      ["user:a", 2, 1, 1],
      ["user:b", 0, 1, 0],
    ];
    expect(applyLeaderboardRows(standings, rows).map((entry) => entry.playerKey)).toEqual(["user:c", "user:a", "user:b"]);
  });

  it("keeps a player the broadcast did not mention rather than dropping them", () => {
    const next = applyLeaderboardRows(standings, [["user:a", 2, 1, 1]]);
    expect(next.map((entry) => entry.playerKey)).toContain("user:c");
    expect(next).toHaveLength(3);
  });

  it("accepts a player who joined since the last full load", () => {
    const rows: LeaderboardRow[] = [
      ["user:a", 2, 1, 1],
      ["user:new", 2, 1, 1],
      ["user:b", 0, 1, 0],
      ["user:c", 0, 0, 0],
    ];
    const next = applyLeaderboardRows(standings, rows);
    expect(next).toHaveLength(4);
    expect(next[1].playerKey).toBe("user:new");
  });

  it("leaves the table alone when the broadcast is empty", () => {
    expect(applyLeaderboardRows(standings, [])).toBe(standings);
  });
});

describe("rankOf", () => {
  it("is one-based", () => {
    expect(rankOf(standings, "user:a")).toBe(1);
    expect(rankOf(standings, "user:c")).toBe(3);
  });

  it("returns zero for an unknown or missing player", () => {
    expect(rankOf(standings, "user:nobody")).toBe(0);
    expect(rankOf(standings, "")).toBe(0);
  });
});

describe("findMyPairing", () => {
  const pairings = [
    { gameId: "g1", roundNumber: 0, tableNumber: 1, whiteKey: "user:a", blackKey: "user:b", whiteName: "Ana", blackName: "Ben" },
    { gameId: "g2", roundNumber: 0, tableNumber: 2, whiteKey: "user:c", blackKey: "user:d", whiteName: "Cai", blackName: "Dev" },
  ];

  it("finds a pairing where the player is White", () => {
    expect(findMyPairing(pairings, "user:a")?.gameId).toBe("g1");
  });

  it("finds a pairing where the player is Black", () => {
    expect(findMyPairing(pairings, "user:d")?.gameId).toBe("g2");
  });

  it("returns nothing when the batch is for other boards", () => {
    // The case that matters: a pairing pass in a large arena must not make
    // every waiting client reload.
    expect(findMyPairing(pairings, "user:zzz")).toBeNull();
  });

  it("returns nothing without a player key", () => {
    expect(findMyPairing(pairings, "")).toBeNull();
  });
});

describe("mergeLiveGames", () => {
  const live = [{ _id: "g1", tableNumber: 1 }];
  const pairings = [
    { gameId: "g2", roundNumber: 0, tableNumber: 2, whiteKey: "user:c", blackKey: "user:d", whiteName: "Cai", blackName: "Dev" },
  ];

  it("adds newly announced boards without a refetch", () => {
    const merged = mergeLiveGames(live, pairings);
    expect(merged.map((game) => String(game._id))).toEqual(["g1", "g2"]);
  });

  it("does not duplicate a board it already has", () => {
    const merged = mergeLiveGames(
      [{ _id: "g2", tableNumber: 2 }],
      pairings
    );
    expect(merged).toHaveLength(1);
  });

  it("orders by board number", () => {
    const merged = mergeLiveGames(
      [{ _id: "g5", tableNumber: 5 }],
      [{ gameId: "g3", roundNumber: 0, tableNumber: 3, whiteKey: "x", blackKey: "y", whiteName: "X", blackName: "Y" }]
    );
    expect(merged.map((game) => game.tableNumber)).toEqual([3, 5]);
  });

  it("caps the list so a big arena does not grow it without bound", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      gameId: `g${index}`,
      roundNumber: 0,
      tableNumber: index,
      whiteKey: "x",
      blackKey: "y",
      whiteName: "X",
      blackName: "Y",
    }));
    expect(mergeLiveGames([], many, 24)).toHaveLength(24);
  });

  it("leaves the list alone when nothing was announced", () => {
    expect(mergeLiveGames(live, [])).toBe(live);
  });
});
