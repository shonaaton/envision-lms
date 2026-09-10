import { describe, expect, it } from "vitest";
import { COURSE_TIERS } from "@/lib/courseTiers";
import {
  CURRICULUM_TIERS,
  CURRICULUM_TIER_OPTIONS,
  curriculumByTier,
  curriculumLevels,
  curriculumSessionByNumber,
  curriculumSessions,
} from "@/lib/demoCurriculum";

describe("demo curriculum", () => {
  it("covers every live tier, in ladder order", () => {
    expect(CURRICULUM_TIERS).toEqual([...COURSE_TIERS]);
  });

  it("never offers the retired or mixed tier as a syllabus", () => {
    const values = CURRICULUM_TIER_OPTIONS.map((option) => option.value);
    expect(values).not.toContain("advanced");
    expect(values).not.toContain("mixed");
  });

  it("splits each tier into three sub-levels", () => {
    for (const tier of CURRICULUM_TIERS) {
      expect(curriculumLevels(tier).map((level) => level.name)).toEqual(["Level 1", "Level 2", "Level 3"]);
    }
  });

  it("numbers sessions continuously across the whole tier, not per sub-level", () => {
    for (const tier of CURRICULUM_TIERS) {
      const sessions = curriculumSessions(tier);
      expect(sessions.map((session) => session.sessionNumber)).toEqual(sessions.map((_, index) => index + 1));
    }
  });

  it("gives every tier the same 48-session year", () => {
    // A tier is sold as 48 sessions, so a tier that does not add up to 48 is a
    // typo in the syllabus above rather than a variation to be tolerated.
    for (const tier of CURRICULUM_TIERS) {
      expect(curriculumSessions(tier).length).toBe(48);
    }
  });

  it("resolves a pick by number, not by name", () => {
    // "Revision" repeats within a tier; a name lookup would collapse them all
    // onto the first, which is why the form submits the session number.
    const sessions = curriculumSessions("intermediate");
    const revisions = sessions.filter((session) => session.topic === "Revision");
    expect(revisions.length).toBeGreaterThan(1);
    for (const revision of revisions) {
      expect(curriculumSessionByNumber("intermediate", revision.sessionNumber)?.sessionNumber).toBe(revision.sessionNumber);
    }
  });

  it("refuses a session number that is not in the tier", () => {
    expect(curriculumSessionByNumber("beginner", 0)).toBeUndefined();
    expect(curriculumSessionByNumber("beginner", 999)).toBeUndefined();
    expect(curriculumSessionByNumber("", 1)).toBeUndefined();
    expect(curriculumSessionByNumber("mixed", 1)).toBeUndefined();
  });

  it("treats an unknown tier as an empty syllabus rather than throwing", () => {
    expect(curriculumLevels("not_a_tier")).toEqual([]);
    expect(curriculumSessions(null)).toEqual([]);
  });

  it("hands the client every tier keyed by its stored value", () => {
    expect(Object.keys(curriculumByTier())).toEqual(CURRICULUM_TIERS);
  });

  it("carries no blank topics", () => {
    for (const tier of CURRICULUM_TIERS) {
      for (const session of curriculumSessions(tier)) expect(session.topic.trim()).not.toBe("");
    }
  });
});
