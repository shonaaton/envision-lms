import { describe, expect, it } from "vitest";
import { freeSinceMs, mostRecentOpponents } from "./pairing";

describe("mostRecentOpponents", () => {
  it("reports each player's latest opponent", () => {
    const recent = mostRecentOpponents([
      { whiteKey: "a", blackKey: "b", status: "completed", createdAt: 100 },
      { whiteKey: "a", blackKey: "c", status: "completed", createdAt: 200 },
    ]);
    expect(recent.get("a")).toBe("c");
    expect(recent.get("c")).toBe("a");
    expect(recent.get("b")).toBe("a");
  });

  it("ignores byes", () => {
    expect(mostRecentOpponents([{ whiteKey: "a", blackKey: "", status: "completed" }]).size).toBe(0);
  });
});

describe("freeSinceMs", () => {
  it("is the latest of game end, resume, join and start", () => {
    expect(freeSinceMs({ lastGameEndedAt: 50, queuedAt: 80, joinedAt: 10, startedAt: 20 })).toBe(80);
    expect(freeSinceMs({})).toBe(0);
  });
});
