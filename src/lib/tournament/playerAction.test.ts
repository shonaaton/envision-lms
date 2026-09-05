import { describe, expect, it } from "vitest";
import { describeTournament, relativeTime, resolvePlayerAction, type PlayerActionInput } from "./playerAction";

function input(overrides: Partial<PlayerActionInput> = {}): PlayerActionInput {
  return {
    tournamentId: "t1",
    status: "playing",
    type: "arena",
    joined: true,
    canPlay: true,
    hasActiveGame: false,
    ...overrides,
  };
}

describe("resolvePlayerAction", () => {
  it("offers a join to someone who has not entered", () => {
    const action = resolvePlayerAction(input({ joined: false, status: "registration_open" }));
    expect(action.kind).toBe("join");
    expect(action.emphasis).toBe("primary");
  });

  it("still offers a join once the event is running, and says so", () => {
    const action = resolvePlayerAction(input({ joined: false }));
    expect(action.kind).toBe("join");
    expect(action.label).toBe("Join now");
    expect(action.hint).toContain("already running");
  });

  it("refuses a late join when the tournament forbids one", () => {
    const action = resolvePlayerAction(input({ joined: false, lateJoiningAllowed: false }));
    expect(action.kind).toBe("not-eligible");
    expect(action.emphasis).toBe("muted");
  });

  it("confirms registration before the start", () => {
    const action = resolvePlayerAction(input({ status: "upcoming" }));
    expect(action.kind).toBe("registered");
    expect(action.emphasis).toBe("secondary");
  });

  it("puts rejoining a live game above everything else", () => {
    // Even paused, even mid-round: the board with a running clock wins.
    const action = resolvePlayerAction(input({ hasActiveGame: true, participantStatus: "paused" }));
    expect(action.kind).toBe("rejoin");
    expect(action.emphasis).toBe("primary");
    expect(action.href).toBe("/tournaments/t1/play");
  });

  it("warns that the clock is running when a game is waiting", () => {
    expect(resolvePlayerAction(input({ hasActiveGame: true })).hint).toContain("clock");
  });

  it("asks a paused arena player to rejoin the queue", () => {
    const action = resolvePlayerAction(input({ participantStatus: "paused" }));
    expect(action.kind).toBe("paused");
    expect(action.emphasis).toBe("primary");
  });

  it("tells a waiting arena player their board is coming", () => {
    const action = resolvePlayerAction(input());
    expect(action.kind).toBe("finding-opponent");
    expect(action.emphasis).toBe("secondary");
  });

  it("reports round progress to a Swiss player who finished early", () => {
    const action = resolvePlayerAction(
      input({ type: "swiss", roundProgress: { roundNumber: 3, completed: 7, total: 10 } })
    );
    expect(action.kind).toBe("waiting-round");
    expect(action.label).toContain("round 3");
    expect(action.hint).toBe("7 of 10 games complete.");
  });

  it("counts down to the next Swiss round", () => {
    const now = 1_000_000;
    const action = resolvePlayerAction(input({ type: "swiss", nextRoundAt: now + 95_000, now }));
    expect(action.kind).toBe("waiting-round");
    expect(action.hint).toContain("1:35");
  });

  it("falls back to a plain wait when the round is done and no countdown is set", () => {
    const action = resolvePlayerAction(
      input({ type: "swiss", roundProgress: { roundNumber: 2, completed: 4, total: 4 } })
    );
    expect(action.kind).toBe("waiting-round");
    expect(action.label).toBe("Waiting for your pairing");
  });

  it("points a finished tournament at the final standings", () => {
    const action = resolvePlayerAction(input({ status: "finished" }));
    expect(action.kind).toBe("final-standings");
    expect(action.emphasis).toBe("primary");
  });

  it("states plainly that a cancelled tournament is over", () => {
    const action = resolvePlayerAction(input({ status: "cancelled" }));
    expect(action.kind).toBe("cancelled");
    expect(action.emphasis).toBe("muted");
  });

  it("offers an observer the event rather than a button that would do nothing", () => {
    const action = resolvePlayerAction(input({ canPlay: false, joined: false }));
    expect(action.kind).toBe("watch");
    expect(action.hint).toContain("viewing");
  });

  it("always returns exactly one action, whatever the state", () => {
    // The point of this module: never two competing primary buttons.
    const states = ["draft", "created", "registration_open", "starting_soon", "upcoming", "live", "playing", "completed", "finished", "cancelled"];
    for (const status of states) {
      for (const joined of [true, false]) {
        for (const hasActiveGame of [true, false]) {
          const action = resolvePlayerAction(input({ status, joined, hasActiveGame }));
          expect(action.label, `${status}/${joined}/${hasActiveGame}`).toBeTruthy();
          expect(["primary", "secondary", "muted"]).toContain(action.emphasis);
        }
      }
    }
  });
});

describe("describeTournament", () => {
  it("summarises a live arena", () => {
    const summary = describeTournament({
      status: "playing",
      type: "arena",
      arenaDurationMinutes: 60,
      initialClockSeconds: 180,
      incrementSeconds: 2,
      participants: [1, 2, 3],
    });
    expect(summary.tone).toBe("live");
    expect(summary.statusLabel).toBe("Live now");
    expect(summary.timeControl).toBe("3+2");
    expect(summary.format).toBe("60 min arena");
    expect(summary.participants).toBe(3);
  });

  it("summarises a scheduled Swiss", () => {
    const summary = describeTournament({ status: "registration_open", type: "swiss", rounds: 5, timeControlMinutes: 10 });
    expect(summary.tone).toBe("upcoming");
    expect(summary.statusLabel).toBe("Registration open");
    expect(summary.format).toBe("5 rounds Swiss");
    expect(summary.timeControl).toBe("10+0");
  });

  it("says a single round in the singular", () => {
    expect(describeTournament({ type: "swiss", rounds: 1, timeControlMinutes: 5 }).format).toBe("1 round Swiss");
  });

  it("marks a tournament that is about to start", () => {
    expect(describeTournament({ status: "starting_soon", type: "arena", timeControlMinutes: 3 }).tone).toBe("soon");
  });

  it("distinguishes finished from cancelled", () => {
    expect(describeTournament({ status: "finished", type: "arena", timeControlMinutes: 3 }).tone).toBe("finished");
    expect(describeTournament({ status: "cancelled", type: "arena", timeControlMinutes: 3 }).tone).toBe("cancelled");
  });

  it("counts guests alongside registered students", () => {
    const summary = describeTournament({ type: "arena", timeControlMinutes: 3, participants: [1, 2], externalParticipants: [{}, {}, {}] });
    expect(summary.participants).toBe(5);
  });

  it("copes with a half-built tournament", () => {
    const summary = describeTournament({});
    expect(summary.participants).toBe(0);
    expect(summary.timeControl).toBe("0s+0");
  });
});

describe("relativeTime", () => {
  const now = 1_700_000_000_000;

  it("counts forward in minutes and hours", () => {
    expect(relativeTime(now + 4 * 60_000, now)).toBe("in 4m");
    expect(relativeTime(now + 2 * 3_600_000 + 15 * 60_000, now)).toBe("in 2h 15m");
    expect(relativeTime(now + 3 * 3_600_000, now)).toBe("in 3h");
  });

  it("counts backward once the moment has passed", () => {
    expect(relativeTime(now - 30 * 60_000, now)).toBe("30m ago");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 days ago");
  });

  it("says something sensible for the next few seconds", () => {
    expect(relativeTime(now + 5_000, now)).toBe("in less than a minute");
  });

  it("returns nothing for a missing or unparseable time", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });
});
