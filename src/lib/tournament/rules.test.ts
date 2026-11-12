import { describe, expect, it } from "vitest";
import { tournamentRuleSections, tournamentRulesText } from "./rules";

const all = (tournament: any) => tournamentRuleSections(tournament).flatMap((section) => section.rules).join("\n");

describe("tournament rules (Lichess, v4)", () => {
  it("describes a Swiss event from its own settings", () => {
    const text = all({ type: "swiss", rounds: 5, timeControlMinutes: 10, incrementSeconds: 0, rulesVersion: 4, breakBetweenRoundsMinutes: 2 });
    expect(text).toMatch(/Swiss: 5 rounds/);
    expect(text).toMatch(/top half of the field plays the bottom half/);
    expect(text).toMatch(/after a 2-minute break/);
    expect(text).toMatch(/Time control 10\+0: each player has 10 minutes for the whole game, with no time added per move/);
    expect(text).toMatch(/Win 1 point, draw ½ point/);
    expect(text).toMatch(/No draw offers before move 30/);
    expect(text).toMatch(/Sonneborn-Berger .* then on tournament performance/);
    expect(text).toMatch(/within 25 seconds/);
    expect(text).toMatch(/Late entry is allowed until round 3 starts\. A late player starts with ½ point/);
    expect(text).not.toMatch(/Berserk/);
  });

  it("describes an Arena with streaks, berserk and Lichess's draw rules", () => {
    const text = all({
      type: "arena",
      rulesVersion: 4,
      arenaDurationMinutes: 45,
      initialClockSeconds: 180,
      incrementSeconds: 2,
      allowBerserk: true,
      arenaStreaks: true,
    });
    expect(text).toMatch(/runs for 45 minutes/);
    expect(text).toMatch(/never with the opponent you just played/);
    expect(text).toMatch(/No new games start in the last 90 seconds/);
    expect(text).toMatch(/3 minutes for the whole game, plus 2 seconds added after every move/);
    expect(text).toMatch(/Win 2 points, draw 1 point/);
    expect(text).toMatch(/scores double, draws included/);
    expect(text).toMatch(/cut your clock to 90 seconds with no increment/);
    expect(text).toMatch(/at least 7 moves/);
    expect(text).toMatch(/A draw in fewer than 10 moves scores nothing/);
    expect(text).toMatch(/a loss does not reset this\), unless the draw lasts 30 moves or more/);
    expect(text).toMatch(/tournament performance/);
    expect(text).toMatch(/within 21 seconds/);
    expect(text).toMatch(/you lose that game and are paused/);
  });

  it("says when an event is rated", () => {
    expect(all({ type: "arena", rulesVersion: 4, arenaDurationMinutes: 30, timeControlMinutes: 3, rated: true })).toMatch(/Glicko-2, starting at 1500/);
    expect(all({ type: "arena", rulesVersion: 4, arenaDurationMinutes: 30, timeControlMinutes: 3 })).not.toMatch(/Glicko/);
  });

  it("leaves out what the event switched off", () => {
    const text = all({ type: "arena", rulesVersion: 4, arenaDurationMinutes: 30, timeControlMinutes: 5, arenaStreaks: false, allowBerserk: false, lateJoiningAllowed: false });
    expect(text).not.toMatch(/double/);
    expect(text).not.toMatch(/Berserk/);
    expect(text).toMatch(/Late entry is not allowed/);
  });

  it("adds the organiser's own entry rules", () => {
    expect(all({ type: "swiss", rounds: 3, timeControlMinutes: 10, entryRestrictions: "Under-12 players only." })).toMatch(/Under-12 players only\./);
  });

  it("renders as plain text for email", () => {
    const text = tournamentRulesText({ type: "swiss", rounds: 3, timeControlMinutes: 10 });
    expect(text.startsWith("Format\n- Swiss: 3 rounds")).toBe(true);
    expect(text).toMatch(/\n\nFair play\n- Play on your own/);
  });
});

describe("tournament rules (older events keep their wording)", () => {
  it("v3 Arena keeps its own draw settings", () => {
    const text = all({ type: "arena", rulesVersion: 3, arenaDurationMinutes: 30, timeControlMinutes: 3, earlyDrawMoveLimit: 10, drawStreakLimit: 2 });
    expect(text).toMatch(/fewer than 5 moves scores nothing/);
    expect(text).toMatch(/After 2 draws in a row/);
    expect(text).toMatch(/number of wins, then by who needed fewer games/);
  });

  it("v3 Swiss keeps open late entry and early draws", () => {
    const text = all({ type: "swiss", rulesVersion: 3, rounds: 5, timeControlMinutes: 10 });
    expect(text).toMatch(/joins from the next round, starting on 0 points/);
    expect(text).not.toMatch(/No draw offers/);
  });
});
