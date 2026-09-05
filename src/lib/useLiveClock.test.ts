import { describe, expect, it } from "vitest";
import { clockBaselineFromGame, deriveClocks, formatClock } from "./useLiveClock";

describe("deriveClocks", () => {
  const baseline = { whiteClockMs: 60_000, blackClockMs: 45_000, turn: "w" as const, since: 1_000_000, running: true };

  it("counts down only the side to move", () => {
    const clocks = deriveClocks(baseline, 1_005_000);
    expect(clocks.whiteClockMs).toBe(55_000);
    expect(clocks.blackClockMs).toBe(45_000);
  });

  it("counts down black when it is black's turn", () => {
    const clocks = deriveClocks({ ...baseline, turn: "b" }, 1_003_000);
    expect(clocks.whiteClockMs).toBe(60_000);
    expect(clocks.blackClockMs).toBe(42_000);
  });

  it("returns a different value as time passes, which the frozen memo did not", () => {
    const first = deriveClocks(baseline, 1_001_000);
    const second = deriveClocks(baseline, 1_002_000);
    expect(second.whiteClockMs).toBeLessThan(first.whiteClockMs);
  });

  it("never goes below zero", () => {
    expect(deriveClocks(baseline, 1_999_999).whiteClockMs).toBe(0);
  });

  it("freezes both clocks once the game is over", () => {
    const clocks = deriveClocks({ ...baseline, running: false }, 1_900_000);
    expect(clocks).toEqual({ whiteClockMs: 60_000, blackClockMs: 45_000 });
  });

  it("handles a missing baseline", () => {
    expect(deriveClocks(null, Date.now())).toEqual({ whiteClockMs: 0, blackClockMs: 0 });
  });
});

describe("clockBaselineFromGame", () => {
  it("corrects for a device clock that runs ahead of the server", () => {
    // The device thinks it is 5s later than the server does.
    const baseline = clockBaselineFromGame(
      { status: "active", turn: "w", whiteClockMs: 60_000, blackClockMs: 60_000, lastMoveAt: 1_000_000, serverNow: 1_000_000 },
      1_005_000
    )!;
    // No time should appear to have elapsed at the moment of receipt.
    expect(deriveClocks(baseline, 1_005_000).whiteClockMs).toBe(60_000);
  });

  it("corrects for a device clock that runs behind the server", () => {
    const baseline = clockBaselineFromGame(
      { status: "active", turn: "w", whiteClockMs: 60_000, blackClockMs: 60_000, lastMoveAt: 1_000_000, serverNow: 1_000_000 },
      995_000
    )!;
    expect(deriveClocks(baseline, 995_000).whiteClockMs).toBe(60_000);
  });

  it("marks a finished game as not running", () => {
    const baseline = clockBaselineFromGame({ status: "completed", turn: "w", whiteClockMs: 1000, blackClockMs: 2000 })!;
    expect(baseline.running).toBe(false);
  });

  it("returns null with no game", () => {
    expect(clockBaselineFromGame(null)).toBeNull();
  });
});

describe("formatClock", () => {
  it("shows minutes and seconds", () => {
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(600_000)).toBe("10:00");
  });

  it("shows tenths under ten seconds, where they matter", () => {
    expect(formatClock(9_400)).toBe("9.4");
    expect(formatClock(400)).toBe("0.4");
  });

  it("clamps a negative clock to zero", () => {
    expect(formatClock(-5000)).toBe("0.0");
  });
});
