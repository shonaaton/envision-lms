import { describe, expect, it } from "vitest";
import { hasRenames, planCourseRenames } from "@/lib/courseRenames";

/** Stored course shaped the way `Course.findById(...).lean()` returns one. */
function storedCourse(overrides: Record<string, any> = {}) {
  return {
    _id: "c1",
    name: "Advanced Course",
    level: "advanced",
    levels: [
      {
        _id: "l1",
        name: "Advanced Level 1",
        topics: [
          { _id: "t1", name: "Back rank mates" },
          { _id: "t2", name: "Rook endgames" },
        ],
      },
      { _id: "l2", name: "Advanced Level 2", topics: [{ _id: "t3", name: "Opposition" }] },
    ],
    ...overrides,
  };
}

/** What the save route sends after normalizing, with the ids round-tripped. */
function incoming(course: any) {
  return JSON.parse(JSON.stringify(course));
}

describe("planCourseRenames", () => {
  it("reports nothing when nothing was renamed", () => {
    const plan = planCourseRenames(storedCourse(), incoming(storedCourse()));
    expect(plan).toEqual({ course: null, tier: null, levels: [], topics: [] });
    expect(hasRenames(plan)).toBe(false);
  });

  it("detects a course rename", () => {
    const next = incoming(storedCourse());
    next.name = "Masters Course";
    const plan = planCourseRenames(storedCourse(), next);
    expect(plan.course).toEqual({ from: "Advanced Course", to: "Masters Course" });
    expect(plan.levels).toEqual([]);
    expect(hasRenames(plan)).toBe(true);
  });

  it("detects level renames by id, not by position", () => {
    const next = incoming(storedCourse());
    next.name = "Masters Course";
    next.levels[0].name = "Masters Level 1";
    next.levels[1].name = "Masters Level 2";
    // Reordering must not be mistaken for a rename.
    next.levels.reverse();
    const plan = planCourseRenames(storedCourse(), next);
    expect(plan.course).toEqual({ from: "Advanced Course", to: "Masters Course" });
    expect(plan.levels).toEqual([
      { from: "Advanced Level 2", to: "Masters Level 2" },
      { from: "Advanced Level 1", to: "Masters Level 1" },
    ]);
  });

  it("detects a topic rename inside a level", () => {
    const next = incoming(storedCourse());
    next.levels[0].topics[1].name = "Rook and pawn endings";
    const plan = planCourseRenames(storedCourse(), next);
    expect(plan.topics).toEqual([{ from: "Rook endgames", to: "Rook and pawn endings" }]);
    expect(plan.course).toBeNull();
  });

  it("treats a level with no matching id as new, not renamed", () => {
    const next = incoming(storedCourse());
    next.levels.push({ name: "Masters Level 3", topics: [{ name: "Fortresses" }] });
    const plan = planCourseRenames(storedCourse(), next);
    expect(hasRenames(plan)).toBe(false);
  });

  it("treats a removed level as a deletion, not a rename", () => {
    const next = incoming(storedCourse());
    next.levels = [next.levels[0]];
    const plan = planCourseRenames(storedCourse(), next);
    expect(hasRenames(plan)).toBe(false);
  });

  it("does not report a rename when ids are missing on both sides", () => {
    // The pre-fix data shape: levels saved without stable ids. A rename cannot
    // be told from a replacement here, and guessing would rewrite the wrong rows.
    const previous = storedCourse();
    previous.levels = previous.levels.map(({ _id, ...level }: any) => level);
    const next = incoming(previous);
    next.levels[0].name = "Masters Level 1";
    const plan = planCourseRenames(previous, next);
    expect(plan.levels).toEqual([]);
  });

  it("detects a tier change", () => {
    const next = incoming(storedCourse());
    next.level = "mixed";
    const plan = planCourseRenames(storedCourse(), next);
    expect(plan.tier).toEqual({ from: "advanced", to: "mixed" });
  });

  it("ignores whitespace-only differences", () => {
    const next = incoming(storedCourse());
    next.name = "  Advanced Course  ";
    next.levels[0].name = " Advanced Level 1 ";
    const plan = planCourseRenames(storedCourse(), next);
    expect(hasRenames(plan)).toBe(false);
  });

  it("ignores a name cleared to empty rather than renaming to nothing", () => {
    const next = incoming(storedCourse());
    next.levels[0].name = "";
    const plan = planCourseRenames(storedCourse(), next);
    expect(plan.levels).toEqual([]);
  });
});
