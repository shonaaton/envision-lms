import { describe, expect, it } from "vitest";
import { countTopics, levelProgress, shapeCourse, topicKey } from "@/lib/branch/courseRules";

const level = {
  id: "l1",
  name: "Level 1",
  topics: [
    { id: "t1", name: "The board", sessionCount: 1 },
    { id: "t2", name: "Knight moves", sessionCount: 2 },
    { id: "t3", name: "Checkmate", sessionCount: 1 },
  ],
};

describe("branch course progress", () => {
  it("matches register topics without minding case or spacing", () => {
    expect(topicKey("  Knight   Moves ")).toBe("knight moves");
    const counts = countTopics([{ topic: "knight moves" }, { topic: "Knight Moves", count: 2 }, { topic: "" }]);
    expect(counts.get("knight moves")).toBe(3);
    expect(counts.size).toBe(1);
  });

  it("finishes a topic only after its number of classes", () => {
    const progress = levelProgress(level, countTopics([{ topic: "The board" }, { topic: "Knight moves" }]));
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
    expect(progress.next).toBe("Knight moves");
    expect(progress.topics[1]).toMatchObject({ taught: 1, done: false });
    expect(progress.complete).toBe(false);
  });

  it("names the first unfinished topic in syllabus order, even when later ones were taught", () => {
    const progress = levelProgress(level, countTopics([{ topic: "Checkmate" }]));
    expect(progress.next).toBe("The board");
    expect(progress.done).toBe(1);
  });

  it("is complete when every topic is done, and never for an empty level", () => {
    const all = countTopics([{ topic: "The board" }, { topic: "Knight moves", count: 2 }, { topic: "Checkmate" }]);
    expect(levelProgress(level, all)).toMatchObject({ complete: true, next: "", done: 3 });
    expect(levelProgress({ id: "x", name: "Empty", topics: [] }, all)).toMatchObject({ complete: false, total: 0, next: "" });
    expect(levelProgress(null, all).total).toBe(0);
  });

  it("orders levels and topics by their order, keeping the stored order for ties", () => {
    const course = shapeCourse({
      _id: "c1",
      name: "Beginner",
      level: "beginner",
      levels: [
        { _id: "b", name: "Level 2", order: 2, topics: [] },
        { _id: "a", name: "Level 1", order: 1, topics: [{ _id: "y", name: "Second", order: 0 }, { _id: "x", name: "First", order: 0 }, { _id: "z", name: "Last", order: 5, sessionCount: 0 }] },
      ],
    });
    expect(course.levels.map((item) => item.name)).toEqual(["Level 1", "Level 2"]);
    expect(course.levels[0].topics.map((item) => item.name)).toEqual(["Second", "First", "Last"]);
    expect(course.levels[0].topics[2].sessionCount).toBe(1);
  });
});
