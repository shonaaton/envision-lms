import { describe, expect, it } from "vitest";

import { planFutureSessionTopics } from "./classroomLifecycle";

// Amaan's Beginner Level 2 course (PIC-99106), in syllabus order.
const plan = [
  "Promotion & Underpromotion",
  "En-Passant day 1",
  "Legal and Illegal Moves",
  "Revision Class",
  "Practice and Analysis",
  "How does a game ends in a draw",
  "Mate in 1(Queen)",
  "Mate in One (Rook & Bishop)",
  "Mate in One (Pawn and promotion)",
  "Mate in One (Knight)",
  "Defending Checkmate",
  "The Basic Principles of Chess (including Opening)",
].map((topicName, topicOrder) => ({ topicName, topicOrder }));

function session(day: number, topicName: string, extra: Record<string, unknown> = {}) {
  return { _id: `s${day}`, scheduledFor: new Date(Date.UTC(2026, 10, day)), topicName, status: "scheduled", ...extra };
}

function topics(sessions: any[]) {
  const assigned = new Map(planFutureSessionTopics(sessions, plan).map(({ session, topic }) => [session._id, topic.topicName]));
  return sessions.map((item) => assigned.get(item._id) || item.topicName);
}

describe("planFutureSessionTopics", () => {
  it("hands out untaught topics in syllabus order when nobody picked one", () => {
    const sessions = [session(20, "x"), session(21, "x"), session(22, "x")];
    expect(topics(sessions)).toEqual(["Promotion & Underpromotion", "En-Passant day 1", "Legal and Illegal Moves"]);
  });

  it("continues after a topic a person picked, then review classes, and only then the skipped ones", () => {
    // PIC-99106: 20 Nov taught Promotion, 25 Nov set to Mate in 1 (Queen).
    const days = [27, 32, 34, 39, 41, 46, 48, 53, 55, 60, 65];
    const sessions = [
      session(20, "Promotion & Underpromotion", { status: "completed", summary: { topicCompleted: false } }),
      session(25, "Mate in 1(Queen)", { topicLocked: true, topicAnchor: true }),
      ...days.map((day) => session(day, "x")),
    ];
    expect(topics(sessions)).toEqual([
      "Promotion & Underpromotion",
      "Mate in 1(Queen)",
      "Mate in One (Rook & Bishop)",
      "Mate in One (Pawn and promotion)",
      "Mate in One (Knight)",
      "Defending Checkmate",
      "The Basic Principles of Chess (including Opening)",
      "Revision Class",
      "Practice and Analysis",
      // Only the classes still left get the topics the bookmark skipped.
      "Promotion & Underpromotion",
      "En-Passant day 1",
      "Legal and Illegal Moves",
      "How does a game ends in a draw",
    ]);
  });

  it("continues after a past class whose topic an admin corrected", () => {
    const sessions = [
      session(20, "Mate in 1(Queen)", { status: "completed", topicLocked: true, summary: { adminTopicCorrection: true } }),
      session(25, "x"),
      session(27, "x"),
    ];
    expect(topics(sessions)).toEqual(["Mate in 1(Queen)", "Mate in One (Rook & Bishop)", "Mate in One (Pawn and promotion)"]);
  });

  it("hands out review classes in syllabus order when nothing was bookmarked", () => {
    const sessions = [1, 2, 3, 4, 5].map((day) => session(day, "x"));
    expect(topics(sessions)).toEqual(plan.slice(0, 5).map((topic) => topic.topicName));
  });

  it("does not treat a locked class without a chosen topic as a bookmark", () => {
    const sessions = [session(20, "Mate in One (Knight)", { topicLocked: true }), session(25, "x")];
    expect(topics(sessions)).toEqual(["Mate in One (Knight)", "Promotion & Underpromotion"]);
  });

  it("ignores a cancelled class's chosen topic", () => {
    const sessions = [session(20, "Mate in One (Knight)", { status: "cancelled", topicLocked: true, topicAnchor: true }), session(25, "x")];
    expect(topics(sessions)).toEqual(["Mate in One (Knight)", "Promotion & Underpromotion"]);
  });
});
