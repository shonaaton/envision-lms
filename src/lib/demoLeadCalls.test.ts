import { describe, expect, it } from "vitest";
import { academyDateKey, academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
import { REMINDER_MAX_DAYS, callLogText, checkReminderTime, demoLeadCallOutcomeLabel, isDemoLeadCallOutcome, reminderPresets } from "@/lib/demoLeadCalls";

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
