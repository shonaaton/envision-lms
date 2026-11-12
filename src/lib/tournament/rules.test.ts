import { describe, expect, it } from "vitest";
import { tournamentRuleSections, tournamentRulesText } from "./rules";

const all = (tournament: any) => tournamentRuleSections(tournament).flatMap((section) => section.rules).join("\n");

describe("tournament rules", () => {
  it("describes a Swiss event from its own settings", () => {
    const text = all({ type: "swiss", rounds: 5, timeControlMinutes: 10, incrementSeconds: 0, rulesVersion: 3, breakBetweenRoundsMinutes: 2 });
    expect(text).toMatch(/Swiss: 5 rounds/);
    expect(text).toMatch(/after a 2-minute break/);
    expect(text).toMatch(/Time control 10\+0: each player has 10 minutes for the whole game, with no time added per move/);
    expect(text).toMatch(/Win 1 point, draw ½ point/);
    expect(text).toMatch(/Sonneborn-Berger/);
    expect(text).toMatch(/lose it by forfeit/);
    expect(text).toMatch(/from the next round/);
    expect(text).not.toMatch(/Berserk/);
  });

  it("describes an Arena with streaks, berserk and the draw rules", () => {
    const text = all({
      type: "arena",
      arenaDurationMinutes: 45,
      initialClockSeconds: 180,
      incrementSeconds: 2,
      allowBerserk: true,
      arenaStreaks: true,
      berserkMinPlies: 7,
      earlyDrawMoveLimit: 10,
      drawStreakLimit: 2,
    });
    expect(text).toMatch(/runs for 45 minutes/);
    expect(text).toMatch(/3 minutes for the whole game, plus 2 seconds added after every move/);
    expect(text).toMatch(/Win 2 points, draw 1 point/);
    expect(text).toMatch(/scores double/);
    expect(text).toMatch(/cut your clock to 90 seconds with no increment/);
    expect(text).toMatch(/at least 4 moves/);
    expect(text).toMatch(/fewer than 5 moves scores nothing/);
    expect(text).toMatch(/After 2 draws in a row/);
    expect(text).toMatch(/Press Resume/);
  });

  it("leaves out what the event switched off", () => {
    const text = all({ type: "arena", arenaDurationMinutes: 30, timeControlMinutes: 5, arenaStreaks: false, allowBerserk: false, lateJoiningAllowed: false });
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
