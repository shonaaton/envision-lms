import { describe, expect, it } from "vitest";
import { dueStartReminderOffset, reminderSweepFilter } from "@/lib/classSessionNotifications";

describe("reminderSweepFilter", () => {
  const filter: any = reminderSweepFilter(new Date("2026-09-08T12:00:00Z"), new Date("2026-09-08T13:00:00Z"));

  it("excludes per-session mirror classrooms", () => {
    // Regression: every session is mirrored into a child classroom holding a
    // copy of the same session. Sweeping both sent each family two identical
    // reminders, and the per-session claim could not catch it because the claim
    // is keyed on the classroom id too.
    expect(filter.isSessionInstance).toEqual({ $ne: true });
  });

  it("still excludes inactive, paused and test classrooms", () => {
    expect(filter.isActive).toEqual({ $ne: false });
    expect(filter.isPaused).toEqual({ $ne: true });
    expect(filter.isTestClassroom).toEqual({ $ne: true });
  });

  it("only looks at sessions that have not been taught", () => {
    expect(filter.generatedSessions.$elemMatch.status.$in).toEqual(["scheduled", "ongoing", "in_progress"]);
  });
});

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
