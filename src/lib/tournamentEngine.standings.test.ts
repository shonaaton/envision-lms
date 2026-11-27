import { describe, expect, it } from "vitest";
import { ensureTournamentStandings } from "./tournamentEngine";

// 27 Nov 2026 practice arena: the first player to join showed as #1 on
// 0 points above a player on 2, because a pairing pass rebuilt the table in
// join order and clients rank by position.
describe("ensureTournamentStandings", () => {
  const a = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const b = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const c = "cccccccccccccccccccccccc";

  it("keeps the table ranked by points after rebuilding it", () => {
    const tournament: any = {
      type: "arena",
      rulesVersion: 4,
      participants: [a, b, c],
      externalParticipants: [],
      standings: [
        { playerKey: `user:${b}`, displayName: "Test Student", points: 2, wins: 1, gamesPlayed: 1, performance: 1750 },
        { playerKey: `user:${c}`, displayName: "Utkarsh", points: 0, gamesPlayed: 0, rating: 1500 },
        { playerKey: `user:${a}`, displayName: "Bhargav", points: 0, gamesPlayed: 1, performance: 1250 },
      ],
    };
    const keys = ensureTournamentStandings(tournament).map((entry: any) => entry.playerKey);
    expect(keys[0]).toBe(`user:${b}`);
    expect(keys).toHaveLength(3);
  });

  it("adds a new joiner without dropping anyone", () => {
    const tournament: any = { type: "swiss", rulesVersion: 4, participants: [a, b], externalParticipants: [{ username: "guest1" }], standings: [] };
    expect(ensureTournamentStandings(tournament)).toHaveLength(3);
  });
});
