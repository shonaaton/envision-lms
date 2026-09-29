import { describe, expect, it } from "vitest";
import { classroomOpensLearnChess, levelNumber } from "@/lib/learning/audience";

const BEGINNER_COURSE = {
  level: "beginner",
  levels: [
    { name: "Level 1", order: 0 },
    { name: "Level 2", order: 1 },
    { name: "Level 3", order: 2 },
  ],
};

function classroom(over: Parameters<typeof classroomOpensLearnChess>[0] = {}) {
  return { status: "scheduled", classroomType: "series", level: "beginner", levelName: "Level 1", ...over };
}

describe("levelNumber", () => {
  it("reads the number out of a Level N name", () => {
    expect(levelNumber("Level 1")).toBe(1);
    expect(levelNumber("level-2")).toBe(2);
    expect(levelNumber("Level 2 - Tactics")).toBe(2);
  });

  it("does not read Level 10 or Level 12 as Level 1", () => {
    expect(levelNumber("Level 10")).toBe(10);
    expect(levelNumber("Level 12")).toBe(12);
  });

  it("places a custom-named level by its position in the course, in order", () => {
    const course = {
      levels: [
        { name: "Knights", order: 1 },
        { name: "Pawns", order: 0 },
        { name: "Castles", order: 2 },
      ],
    };
    expect(levelNumber("Pawns", course)).toBe(1);
    expect(levelNumber("knights", course)).toBe(2);
    expect(levelNumber("Castles", course)).toBe(3);
  });

  it("is unknown when there is no name, or the name is not in the course", () => {
    expect(levelNumber("")).toBeNull();
    expect(levelNumber(undefined)).toBeNull();
    expect(levelNumber("Foundations")).toBeNull();
    expect(levelNumber("Foundations", BEGINNER_COURSE)).toBeNull();
  });
});

describe("classroomOpensLearnChess", () => {
  it("opens for Beginner Level 1 and Level 2", () => {
    expect(classroomOpensLearnChess(classroom({ levelName: "Level 1" }), BEGINNER_COURSE)).toBe(true);
    expect(classroomOpensLearnChess(classroom({ levelName: "Level 2" }), BEGINNER_COURSE)).toBe(true);
  });

  it("stays shut for Beginner Level 3 and for other tiers", () => {
    expect(classroomOpensLearnChess(classroom({ levelName: "Level 3" }), BEGINNER_COURSE)).toBe(false);
    expect(classroomOpensLearnChess(classroom({ level: "intermediate", levelName: "Level 1" }), { ...BEGINNER_COURSE, level: "intermediate" })).toBe(false);
    expect(classroomOpensLearnChess(classroom({ levelName: "Level 10" }), BEGINNER_COURSE)).toBe(false);
  });

  it("keeps counting a level the student has finished or left", () => {
    expect(classroomOpensLearnChess(classroom({ status: "completed" }), BEGINNER_COURSE)).toBe(true);
    expect(classroomOpensLearnChess({ ...classroom(), isActive: false } as any, BEGINNER_COURSE)).toBe(true);
  });

  it("ignores cancelled, demo, test and per-session classrooms", () => {
    expect(classroomOpensLearnChess(classroom({ status: "cancelled" }), BEGINNER_COURSE)).toBe(false);
    expect(classroomOpensLearnChess(classroom({ classroomType: "demo" }), BEGINNER_COURSE)).toBe(false);
    expect(classroomOpensLearnChess(classroom({ isTestClassroom: true }), BEGINNER_COURSE)).toBe(false);
    expect(classroomOpensLearnChess(classroom({ isSessionInstance: true }), BEGINNER_COURSE)).toBe(false);
  });

  it("takes the tier from the course over a stale classroom copy", () => {
    // The classroom still says beginner, but its course was moved to intermediate.
    const intermediateCourse = { ...BEGINNER_COURSE, level: "intermediate" };
    expect(classroomOpensLearnChess(classroom({ level: "beginner" }), intermediateCourse)).toBe(false);
    // And the other way round.
    expect(classroomOpensLearnChess(classroom({ level: "intermediate" }), BEGINNER_COURSE)).toBe(true);
  });

  it("falls back to the classroom's tier for a mixed or unlinked course", () => {
    expect(classroomOpensLearnChess(classroom({ level: "beginner" }), { ...BEGINNER_COURSE, level: "mixed" })).toBe(true);
    expect(classroomOpensLearnChess(classroom({ level: "intermediate" }), { ...BEGINNER_COURSE, level: "mixed" })).toBe(false);
    expect(classroomOpensLearnChess(classroom({ level: "beginner", levelName: "Level 2" }), null)).toBe(true);
  });

  it("uses the course's level order for a level not named Level N", () => {
    const course = { level: "beginner", levels: [{ name: "Pawns", order: 0 }, { name: "Pieces", order: 1 }, { name: "Plans", order: 2 }] };
    expect(classroomOpensLearnChess(classroom({ levelName: "Pieces" }), course)).toBe(true);
    expect(classroomOpensLearnChess(classroom({ levelName: "Plans" }), course)).toBe(false);
  });

  it("stays shut when the level cannot be told", () => {
    expect(classroomOpensLearnChess(classroom({ levelName: "" }), BEGINNER_COURSE)).toBe(false);
  });
});
