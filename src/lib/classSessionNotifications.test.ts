import { describe, expect, it } from "vitest";
import { dueStartReminderOffset } from "@/lib/classSessionNotifications";

describe("dueStartReminderOffset", () => {
  it("sends nothing before the first window opens", () => {
    expect(dueStartReminderOffset(45)).toBeNull();
    expect(dueStartReminderOffset(30.5)).toBeNull();
  });

  it("sends the 30-minute notice across that whole window", () => {
    expect(dueStartReminderOffset(30)).toBe(30);
    expect(dueStartReminderOffset(25)).toBe(30);
    expect(dueStartReminderOffset(11)).toBe(30);
  });

  it("sends the 10-minute notice inside the closer window", () => {
    expect(dueStartReminderOffset(10)).toBe(10);
    expect(dueStartReminderOffset(4)).toBe(10);
    expect(dueStartReminderOffset(0.5)).toBe(10);
  });

  it("names the window it is actually in, so a late-added class is not told it has thirty minutes", () => {
    // A class created nine minutes before it starts skips the 30 entirely.
    expect(dueStartReminderOffset(9)).toBe(10);
  });

  it("stops once the class has started", () => {
    expect(dueStartReminderOffset(0)).toBeNull();
    expect(dueStartReminderOffset(-5)).toBeNull();
  });

  it("never revisits a window as the clock runs down", () => {
    // Each offset must be reachable at most once, or a claimed reminder could
    // be re-sent under a different label.
    const seen = new Set<number>();
    for (let minutes = 40; minutes > 0; minutes -= 0.5) {
      const offset = dueStartReminderOffset(minutes);
      if (offset !== null) seen.add(offset);
    }
    expect(Array.from(seen).sort((a, b) => a - b)).toEqual([10, 30]);
  });
});
