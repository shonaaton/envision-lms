import { describe, expect, it } from "vitest";
import {
  COURSE_TIERS,
  COURSE_TIER_OPTIONS,
  COURSE_TIER_OPTIONS_WITH_MIXED,
  COURSE_TIER_VALUES,
  classroomTier,
  courseTierLabel,
  isCourseTier,
  isCourseTierOrMixed,
} from "@/lib/courseTiers";

describe("course tiers", () => {
  it("offers the academy ladder in order", () => {
    expect([...COURSE_TIERS]).toEqual(["beginner", "intermediate", "semi_pro", "pro", "masters"]);
  });

  it("keeps the retired tier valid so existing rows still save", () => {
    expect(isCourseTier("advanced")).toBe(true);
    expect(COURSE_TIER_VALUES.indexOf("advanced")).toBe(COURSE_TIER_VALUES.length - 1);
  });

  it("marks a retired tier only in the pickers", () => {
    expect(COURSE_TIER_OPTIONS.find((option) => option.value === "advanced")?.label).toBe("Advanced (legacy)");
    expect(courseTierLabel("advanced")).toBe("Advanced");
  });

  it("accepts mixed only where a course or template may span tiers", () => {
    expect(isCourseTier("mixed")).toBe(false);
    expect(isCourseTierOrMixed("mixed")).toBe(true);
    expect(COURSE_TIER_OPTIONS.some((option) => option.value === "mixed")).toBe(false);
    expect(COURSE_TIER_OPTIONS_WITH_MIXED.some((option) => option.value === "mixed")).toBe(true);
  });

  it("folds a mixed course down to beginner for a classroom", () => {
    expect(classroomTier("mixed")).toBe("beginner");
    expect(classroomTier("masters")).toBe("masters");
    expect(classroomTier("nonsense")).toBe("beginner");
    expect(classroomTier(undefined)).toBe("beginner");
  });

  it("labels every tier it accepts", () => {
    for (const tier of COURSE_TIER_VALUES) expect(courseTierLabel(tier)).toBeTruthy();
    expect(courseTierLabel("semi_pro")).toBe("Semi Pro");
    expect(courseTierLabel("")).toBe("");
  });

  it("rejects the student assessment scale, which is a different ladder", () => {
    // User.studentLevel values must never pass as course tiers - they drive the
    // puzzle trainer rating bands, not the course a class belongs to.
    expect(isCourseTier("absolute_beginner")).toBe(false);
    expect(isCourseTier("federated")).toBe(false);
    expect(isCourseTier("not_set")).toBe(false);
  });
});

/**
 * The dashboard groups students by scanning a free-text level for a tier name.
 * "pro" is a substring of "semi pro", so the longest needle has to win - this
 * mirrors the matcher the dashboard builds.
 */
describe("tier matching by longest needle", () => {
  const matchers = COURSE_TIER_VALUES.map((tier) => ({ tier, needle: tier.replace(/_/g, " ") })).sort(
    (a, b) => b.needle.length - a.needle.length
  );

  function tierOf(value: string) {
    const haystack = value.toLowerCase().replace(/_/g, " ");
    return matchers.find((entry) => haystack.includes(entry.needle))?.tier || "";
  }

  it("does not read semi pro as pro", () => {
    expect(tierOf("semi_pro")).toBe("semi_pro");
    expect(tierOf("Semi Pro Course")).toBe("semi_pro");
    expect(tierOf("Semi Pro Level 1")).toBe("semi_pro");
  });

  it("still matches the plain tiers", () => {
    expect(tierOf("pro")).toBe("pro");
    expect(tierOf("Pro Level 2")).toBe("pro");
    expect(tierOf("Masters Level 3")).toBe("masters");
    expect(tierOf("Intermediate Course")).toBe("intermediate");
    expect(tierOf("advanced")).toBe("advanced");
  });

  it("returns nothing for a value outside the ladder", () => {
    expect(tierOf("federated")).toBe("");
    expect(tierOf("")).toBe("");
  });
});
