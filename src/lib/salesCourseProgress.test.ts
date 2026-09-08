import { describe, expect, it } from "vitest";
import { courseLabel, indexStudentCourseProgress } from "@/lib/salesCourseProgress";

const ASHA = "5f1d7f2e4b3a2c1d0e9f8a01";
const RAVI = "5f1d7f2e4b3a2c1d0e9f8a02";

function classroom(over: Partial<Parameters<typeof indexStudentCourseProgress>[0][number]> = {}) {
  return { students: [ASHA], status: "scheduled", courseName: "Openings", levelName: "Level 1", ...over };
}

describe("courseLabel", () => {
  it("joins the course and level a student is being taught", () => {
    expect(courseLabel({ courseName: "Openings", levelName: "Level 2" })).toBe("Openings - Level 2");
  });

  it("is empty for a classroom with no course linked, so nothing shows a stray dash", () => {
    expect(courseLabel({})).toBe("");
    expect(courseLabel(null)).toBe("");
  });

  it("copes with only one half being set", () => {
    expect(courseLabel({ courseName: "Openings" })).toBe("Openings");
    expect(courseLabel({ levelName: "Level 2" })).toBe("Level 2");
  });
});

describe("indexStudentCourseProgress", () => {
  it("takes the first running classroom as the current one", () => {
    // Callers sort newest-first, so first seen wins.
    const { running } = indexStudentCourseProgress([
      classroom({ levelName: "Level 3" }),
      classroom({ levelName: "Level 2" }),
    ]);
    expect(courseLabel(running.get(ASHA))).toBe("Openings - Level 3");
  });

  it("collects finished levels without letting them become the current course", () => {
    const { running, completed } = indexStudentCourseProgress([
      classroom({ status: "completed", levelName: "Level 1" }),
    ]);
    expect(running.has(ASHA)).toBe(false);
    expect(completed.get(ASHA)).toEqual(["Openings - Level 1"]);
  });

  it("counts a level once even when the student sat it twice", () => {
    // A repeat, or a transfer between batches mid-level.
    const { completed } = indexStudentCourseProgress([
      classroom({ status: "completed", levelName: "Level 1" }),
      classroom({ status: "completed", levelName: "Level 1" }),
    ]);
    expect(completed.get(ASHA)).toEqual(["Openings - Level 1"]);
  });

  it("ignores cancelled courses entirely - they taught nothing", () => {
    const { running, completed } = indexStudentCourseProgress([classroom({ status: "cancelled" })]);
    expect(running.has(ASHA)).toBe(false);
    expect(completed.has(ASHA)).toBe(false);
  });

  it("does not treat a closed classroom as what the student is doing now", () => {
    const { running } = indexStudentCourseProgress([classroom({ isActive: false })]);
    expect(running.has(ASHA)).toBe(false);
  });

  it("keeps each student in a shared classroom separate", () => {
    const { running, completed } = indexStudentCourseProgress([
      { students: [ASHA, RAVI], status: "completed", courseName: "Openings", levelName: "Level 1" },
      { students: [RAVI], status: "scheduled", courseName: "Openings", levelName: "Level 2" },
    ]);
    expect(completed.get(ASHA)).toEqual(["Openings - Level 1"]);
    expect(completed.get(RAVI)).toEqual(["Openings - Level 1"]);
    expect(running.has(ASHA)).toBe(false);
    expect(courseLabel(running.get(RAVI))).toBe("Openings - Level 2");
  });

  it("skips a completed classroom with no course, rather than listing a blank level", () => {
    const { completed } = indexStudentCourseProgress([
      { students: [ASHA], status: "completed", courseName: "", levelName: "" },
    ]);
    expect(completed.has(ASHA)).toBe(false);
  });

  it("accepts populated student objects as well as raw ids", () => {
    const { running } = indexStudentCourseProgress([classroom({ students: [{ _id: ASHA, name: "Asha" }] })]);
    expect(running.has(ASHA)).toBe(true);
  });

  it("returns empty maps for no classrooms", () => {
    const { running, completed } = indexStudentCourseProgress([]);
    expect(running.size).toBe(0);
    expect(completed.size).toBe(0);
  });
});
