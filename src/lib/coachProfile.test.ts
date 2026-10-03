import { describe, expect, it } from "vitest";

import { formatTime, normalizeAvailability, normalizeLanguages, toCoachProfileView, weeklyAvailableMinutes } from "@/lib/coachProfile";

describe("normalizeLanguages", () => {
  it("keeps known spellings, drops blanks and case-insensitive duplicates", () => {
    expect(normalizeLanguages(["hindi", " English ", "", "HINDI", "sanskrit"])).toEqual(["Hindi", "English", "Sanskrit"]);
  });

  it("treats a non-array as no languages", () => {
    expect(normalizeLanguages("English")).toEqual([]);
  });
});

describe("normalizeAvailability", () => {
  it("sorts Monday first and merges overlapping slots on the same day", () => {
    const result = normalizeAvailability([
      { dayOfWeek: 0, startTime: "10:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "18:00", endTime: "20:00" },
      { dayOfWeek: 1, startTime: "17:00", endTime: "18:30" },
    ]);
    expect(result).toEqual({
      ok: true,
      slots: [
        { dayOfWeek: 1, startTime: "17:00", endTime: "20:00" },
        { dayOfWeek: 0, startTime: "10:00", endTime: "12:00" },
      ],
    });
  });

  it("refuses an end time before the start time instead of dropping the slot", () => {
    const result = normalizeAvailability([{ dayOfWeek: 3, startTime: "18:00", endTime: "17:00" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Wednesday");
  });

  it("refuses unknown days and malformed times", () => {
    expect(normalizeAvailability([{ dayOfWeek: 7, startTime: "10:00", endTime: "11:00" }]).ok).toBe(false);
    expect(normalizeAvailability([{ dayOfWeek: 2, startTime: "9:00", endTime: "11:00" }]).ok).toBe(false);
  });
});

describe("display helpers", () => {
  it("formats 12-hour times and weekly minutes", () => {
    expect(formatTime("00:15")).toBe("12:15 AM");
    expect(formatTime("18:30")).toBe("6:30 PM");
    expect(weeklyAvailableMinutes([{ dayOfWeek: 1, startTime: "17:00", endTime: "18:45" }])).toBe(105);
  });

  it("reads a user with no profile as an empty one", () => {
    expect(toCoachProfileView({ name: "Coach" })).toEqual({ languages: [], availability: [], availabilityNote: "", updatedAt: null });
  });
});
