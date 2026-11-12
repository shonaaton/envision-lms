import { describe, expect, it } from "vitest";
import { academyDateKey, academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
import {
  REMINDER_MAX_DAYS,
  callLogText,
  checkReminderTime,
  demoLeadCallOutcomeLabel,
  isDemoLeadCallOutcome,
  missedCallReminderTime,
  parseMissedCallReminderChoice,
  reminderPresets,
} from "@/lib/demoLeadCalls";

describe("missed call reminders", () => {
  const ist = (date: Date | null) => (date ? formatAcademyDateTime(date, { year: undefined, hour12: false }) : null);

  it("defaults to two hours and accepts only the listed choices", () => {
    expect(parseMissedCallReminderChoice(undefined)).toBe("2h");
    expect(parseMissedCallReminderChoice("bogus")).toBe("2h");
    expect(parseMissedCallReminderChoice("none")).toBe("none");
  });

  it("reminds an hour or two later during calling hours", () => {
    const now = new Date("2026-11-12T06:30:00.000Z"); // 12:00 IST
    expect(ist(missedCallReminderTime("2h", now))).toMatch(/12 Nov.*14:00/);
    expect(ist(missedCallReminderTime("1h", now))).toMatch(/12 Nov.*13:00/);
    expect(missedCallReminderTime("none", now)).toBeNull();
  });

  it("moves a late-evening call-back to 11 AM the next day", () => {
    const now = new Date("2026-11-12T13:30:00.000Z"); // 19:00 IST, +2h = 21:00
    expect(ist(missedCallReminderTime("2h", now))).toMatch(/13 Nov.*11:00/);
    const nearMidnight = new Date("2026-11-12T18:00:00.000Z"); // 23:30 IST, +1h is already 13 Nov 00:30
    expect(ist(missedCallReminderTime("1h", nearMidnight))).toMatch(/13 Nov.*11:00/);
  });

  it("moves an early-morning call-back to 11 AM the same day", () => {
    const now = new Date("2026-11-12T01:30:00.000Z"); // 07:00 IST, +1h = 08:00
    expect(ist(missedCallReminderTime("1h", now))).toMatch(/12 Nov.*11:00/);
  });

  it("tomorrow means 11 AM IST the next day", () => {
    expect(ist(missedCallReminderTime("tomorrow", new Date("2026-11-12T17:00:00.000Z")))).toMatch(/13 Nov.*11:00/);
  });
});

describe("demo lead call outcomes", () => {
  it("accepts only picked up and missed", () => {
    expect(isDemoLeadCallOutcome("picked_up")).toBe(true);
    expect(isDemoLeadCallOutcome("missed")).toBe(true);
    expect(isDemoLeadCallOutcome("")).toBe(false);
    expect(isDemoLeadCallOutcome("busy")).toBe(false);
    expect(demoLeadCallOutcomeLabel("missed")).toBe("Missed");
  });

  it("puts the outcome on the first line and the remarks after it", () => {
    expect(callLogText("missed", "")).toBe("Call: missed");
    expect(callLogText("picked_up", "  Wants Saturday demo  ")).toBe("Call: picked up\nWants Saturday demo");
    expect(callLogText("picked_up", "x".repeat(2000)).length).toBe("Call: picked up\n".length + 1000);
  });
});

describe("reminder times", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");

  it("refuses a missing or past time", () => {
    expect(checkReminderTime(null, now).ok).toBe(false);
    expect(checkReminderTime(new Date("bad"), now).ok).toBe(false);
    expect(checkReminderTime(new Date(now.getTime() - 5 * 60_000), now).ok).toBe(false);
  });

  it("allows a minute of slack and anything up to the limit", () => {
    expect(checkReminderTime(new Date(now.getTime() - 30_000), now).ok).toBe(true);
    expect(checkReminderTime(new Date(now.getTime() + 3600_000), now).ok).toBe(true);
    expect(checkReminderTime(new Date(now.getTime() + (REMINDER_MAX_DAYS + 1) * 24 * 3600_000), now).ok).toBe(false);
  });

  it("reads a typed datetime-local as IST, not the server's zone", () => {
    // 2026-11-12 18:00 IST is 12:30 UTC.
    expect(academyDateTime("2026-11-12", "18:00").toISOString()).toBe("2026-11-12T12:30:00.000Z");
  });

  it("offers the evening only while it is still ahead, and tomorrow in IST", () => {
    const at = (iso: string) => {
      const date = new Date(iso);
      return reminderPresets(date, academyDateTime, academyDateKey(date), academyDateKey(new Date(date.getTime() + 24 * 3600_000)));
    };
    const morning = at("2026-11-12T04:30:00.000Z"); // 10:00 IST
    expect(morning.map((preset) => preset.label)).toContain("This evening 6 PM");
    const tomorrow = morning.find((preset) => preset.label === "Tomorrow 11 AM")!;
    expect(formatAcademyDateTime(tomorrow.at, { year: undefined })).toMatch(/13 Nov.*11:00/i);

    const night = at("2026-11-12T15:00:00.000Z"); // 20:30 IST
    expect(night.map((preset) => preset.label)).not.toContain("This evening 6 PM");
    for (const preset of night) expect(preset.at.getTime()).toBeGreaterThan(new Date("2026-11-12T15:00:00.000Z").getTime());
  });
});
