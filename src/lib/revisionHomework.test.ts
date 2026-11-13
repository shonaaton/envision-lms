import { describe, expect, it } from "vitest";
import { CURRICULUM_TIERS, curriculumLevels } from "@/lib/demoCurriculum";
import { isRevisionTopic, revisionPgnKind, revisionPgnTopicKey, revisionTopics, taughtTopicsBeforeRevision } from "@/lib/revisionHomework";

describe("revision homework", () => {
  it("recognizes revision classes throughout the curriculum", () => {
    for (const tier of CURRICULUM_TIERS) {
      for (const level of curriculumLevels(tier)) {
        const topics = level.sessions.map((session) => session.topic);
        const firstRevision = topics.findIndex(isRevisionTopic);
        expect(firstRevision).toBeGreaterThan(0);
        expect(revisionTopics(topics.slice(0, firstRevision)).length).toBeGreaterThan(0);
      }
    }
    expect(isRevisionTopic("Practice Session")).toBe(false);
    expect(isRevisionTopic("Queen against Pawn on the 7th Rank Practice")).toBe(false);
  });

  it("uses the beginning of the level until a practice session takes place", () => {
    expect(revisionTopics(["Pin", "Revision Class", "Skewer"])).toEqual(["Pin", "Skewer"]);
    expect(revisionTopics(["Pin", "Practice and Analysis", "Skewer"])).toEqual(["Skewer"]);
  });

  it("uses completed topics after the latest completed practice in chronological order", () => {
    const session = (day: number, topicName: string, status = "completed", topicCompleted = true) => ({
      scheduledFor: new Date(Date.UTC(2026, 10, day)), topicName, status, summary: { topicCompleted },
    });
    const current = session(10, "Revision & Practice Session");
    expect(taughtTopicsBeforeRevision([
      session(6, "Back Rank"),
      session(1, "Pin"),
      session(5, "Skewer"),
      session(4, "Revision & Practice Session", "completed", false),
      session(7, "Practice Session", "cancelled"),
      session(8, "Double Check", "completed", false),
      session(9, "Revision Class"),
      current,
      session(11, "Deflection"),
    ], current)).toEqual(["Skewer", "Back Rank"]);
  });

  it("matches classwork and homework within the requested course and level", () => {
    const course = ["Beginner Chess Course", "Beginner"];
    expect(revisionPgnKind("Beginners Course/Beginner Level 2/CW", "The Pin.pgn", course, "Level 2")).toBe("CW");
    expect(revisionPgnKind("Beginners Course/Beginner Level 2", "The Pin - Homework.pgn", course, "Level 2")).toBe("HW");
    expect(revisionPgnKind("Beginners Course/Beginner Level 1/HW", "The Pin.pgn", course, "Level 2")).toBeUndefined();
    expect(revisionPgnKind("Intermediate Course/Level 2/HW", "The Pin.pgn", course, "Level 2")).toBeUndefined();
    expect(revisionPgnTopicKey("The Pin - Class Work.pgn")).toBe(revisionPgnTopicKey("Pin"));
  });
});
