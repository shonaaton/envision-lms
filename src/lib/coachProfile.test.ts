import { describe, expect, it } from "vitest";

import {
  LEVEL_GROUPS,
  SUB_LEVELS_PER_TIER,
  formatTime,
  levelsByTier,
  normalizeAvailability,
  normalizeLanguages,
  normalizeLevels,
  toCoachProfileView,
  weekMinutes,
  weekSegments,
  weeklyAvailableMinutes,
} from "@/lib/coachProfile";
import { curriculumLevels } from "@/lib/demoCurriculum";

describe("weekSegments", () => {
  const monday = { dayOfWeek: 1, startTime: "16:00", endTime: "20:00" };

  it("cuts a running class out of the free time and names its batch", () => {
    const days = weekSegments([monday], [{ dayOfWeek: 1, startTime: "17:00", endTime: "18:00", batches: ["PIC-12"] }]);
    expect(days.map((day) => day.short)).toEqual(["Mon"]);
    expect(days[0].segments).toEqual([
      { kind: "free", startTime: "16:00", endTime: "17:00" },
      { kind: "taken", startTime: "17:00", endTime: "18:00", batches: ["PIC-12"] },
      { kind: "free", startTime: "18:00", endTime: "20:00" },
    ]);
    expect(weekMinutes(days)).toEqual({ free: 180, taken: 60 });
  });

  it("leaves no free stretch when classes fill the time back to back", () => {
    const [day] = weekSegments(
      [{ dayOfWeek: 1, startTime: "17:00", endTime: "19:00" }],
      [
        { dayOfWeek: 1, startTime: "18:00", endTime: "19:00", batches: ["B2"] },
        { dayOfWeek: 1, startTime: "17:00", endTime: "18:00", batches: ["B1"] },
      ],
    );
    expect(day.segments.map((segment) => segment.kind)).toEqual(["taken", "taken"]);
    expect(day.segments.flatMap((segment) => (segment.kind === "taken" ? segment.batches : []))).toEqual(["B1", "B2"]);
  });

  it("makes overlapping classes one block naming both batches", () => {
    const [day] = weekSegments(
      [],
      [
        { dayOfWeek: 2, startTime: "17:00", endTime: "18:00", batches: ["B1"] },
        { dayOfWeek: 2, startTime: "17:30", endTime: "18:30", batches: ["B2"] },
      ],
    );
    expect(day.segments).toEqual([{ kind: "taken", startTime: "17:00", endTime: "18:30", batches: ["B1", "B2"] }]);
  });

  it("still shows a class outside the entered hours, on its own day", () => {
    const days = weekSegments([monday], [{ dayOfWeek: 0, startTime: "09:00", endTime: "10:00", batches: ["B3"] }]);
    expect(days.map((day) => day.short)).toEqual(["Mon", "Sun"]);
    expect(days[0].segments).toEqual([{ kind: "free", startTime: "16:00", endTime: "20:00" }]);
  });

  it("trims a free stretch when a class runs over its edge", () => {
    const [day] = weekSegments(
      [{ dayOfWeek: 1, startTime: "17:00", endTime: "19:00" }],
      [{ dayOfWeek: 1, startTime: "16:30", endTime: "17:30", batches: ["B1"] }],
    );
    expect(day.segments).toEqual([
      { kind: "taken", startTime: "16:30", endTime: "17:30", batches: ["B1"] },
      { kind: "free", startTime: "17:30", endTime: "19:00" },
    ]);
  });
});

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
    expect(toCoachProfileView({ name: "Coach" })).toEqual({ languages: [], levels: [], availability: [], availabilityNote: "", updatedAt: null });
  });
});

describe("coach levels", () => {
  it("keeps known levels only, in ladder order, without duplicates", () => {
    expect(normalizeLevels(["intermediate:2", "beginner:1", "beginner:1", "beginner:9", "nonsense", 3])).toEqual(["beginner:1", "intermediate:2"]);
  });

  it("treats a non-array as no levels", () => {
    expect(normalizeLevels("beginner:1")).toEqual([]);
  });

  it("groups levels by tier for display", () => {
    expect(levelsByTier(["beginner:1", "beginner:2", "pro:3"]).map((group) => [group.label, group.levels.map((level) => level.short)])).toEqual([
      ["Beginner", ["L1", "L2"]],
      ["Pro", ["L3"]],
    ]);
  });

  it("offers the same sub-levels per tier as the taught syllabus", () => {
    for (const group of LEVEL_GROUPS) {
      const taught = curriculumLevels(group.tier);
      if (!taught.length) continue;
      expect(taught.length, group.tier).toBe(SUB_LEVELS_PER_TIER);
    }
  });
});
