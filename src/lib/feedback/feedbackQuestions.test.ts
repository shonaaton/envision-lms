import { describe, expect, it } from "vitest";
import { COURSE_TIERS } from "@/lib/courseTiers";
import { EFFORT_SKILL, questionSetFor, requiredRatingKeys } from "@/lib/feedback/feedbackQuestions";

describe("monthly feedback question sets", () => {
  it("gives every live tier four skills plus effort, with unique keys", () => {
    for (const tier of COURSE_TIERS) {
      const set = questionSetFor(tier);
      expect(set.tier).toBe(tier);
      expect(set.skills).toHaveLength(4);
      const keys = requiredRatingKeys(tier);
      expect(keys).toHaveLength(5);
      expect(new Set(keys).size).toBe(5);
      expect(keys).toContain(EFFORT_SKILL.key);
      expect(set.highlights.length).toBeGreaterThanOrEqual(4);
      expect(set.focusAreas.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("asks different questions at different levels", () => {
    expect(questionSetFor("beginner").skills.map((s) => s.key)).not.toEqual(questionSetFor("masters").skills.map((s) => s.key));
  });

  it("maps the retired and mixed tiers onto live sets", () => {
    expect(questionSetFor("advanced").tier).toBe("semi_pro");
    expect(questionSetFor("mixed").tier).toBe("beginner");
    expect(questionSetFor("nonsense").tier).toBe("beginner");
    expect(questionSetFor(undefined).tier).toBe("beginner");
  });
});
