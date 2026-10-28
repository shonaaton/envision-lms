import { describe, expect, it } from "vitest";
import { serializeForStudent } from "@/lib/exams/examService";

const PGN = '[FEN "4k3/8/8/8/8/8/8/R3K2R w - - 0 1"]\n[SetUp "1"]\n\n1. Ra8+ Kd7 2. Rh7+ *';

function sitting(status: string, extra: Record<string, unknown> = {}) {
  return {
    _id: "665f0c0c0c0c0c0c0c0c0c0c",
    tier: "beginner",
    levelNumber: 1,
    status,
    assignedAt: new Date("2026-10-28T05:00:00Z"),
    availableUntil: new Date("2026-11-04T18:29:59.999Z"),
    startedAt: new Date("2026-10-29T05:00:00Z"),
    endsAt: new Date("2026-10-29T06:30:00Z"),
    violations: [],
    mcqs: [
      {
        id: "m1",
        bankKey: "mcq::best?",
        question: "Best move?",
        options: [
          { id: "a", text: "Ra8+", correct: true },
          { id: "b", text: "Kf1", correct: false },
        ],
        explanation: "Check first.",
        topicName: "Checks",
      },
    ],
    positions: [{ id: "p1", bankKey: "pos:x", topicName: "Skewers", pgn: PGN, startFen: "4k3/8/8/8/8/8/8/R3K2R w - - 0 1", solution: ["Ra8+", "Kd7", "Rh7+"], studentColor: "white" }],
    mcqAnswers: [],
    positionProgress: [],
    ...extra,
  };
}

describe("what a student is sent", () => {
  it("never carries the right option, the solution or the PGN during the exam", () => {
    const sent = serializeForStudent(sitting("in_progress"));
    const text = JSON.stringify(sent);
    expect(text).not.toContain('"correct"');
    expect(text).not.toContain("solution");
    expect(text).not.toContain("explanation");
    expect(text).not.toContain("Rh7");
    expect(text).not.toContain("[FEN");
    expect((sent as any).positions[0]).toMatchObject({ topicName: "Skewers", available: 5, solved: false, hint: null });
  });

  it("shows a hint only for the move it was bought for", () => {
    const sent: any = serializeForStudent(sitting("in_progress", { positionProgress: [{ questionId: "p1", ply: 0, wrongMoves: 1, hintsUsed: 1, hintPly: 0, solved: false }] }));
    expect(sent.positions[0].hint).toEqual({ san: "Ra8+", from: "a1", to: "a8" });
    expect(sent.positions[0].available).toBe(2.5);
    const moved: any = serializeForStudent(sitting("in_progress", { positionProgress: [{ questionId: "p1", ply: 2, wrongMoves: 1, hintsUsed: 1, hintPly: 0, solved: false }] }));
    expect(moved.positions[0].hint).toBeNull();
  });

  it("after the exam, says what was right but not what the answer was", () => {
    const sent: any = serializeForStudent(
      sitting("submitted", {
        submitReason: "tab_switch",
        mcqAnswers: [{ questionId: "m1", selected: "b", correct: false }],
        positionProgress: [{ questionId: "p1", ply: 3, wrongMoves: 2, hintsUsed: 0, solved: true }],
        score: { mcq: 0, positions: 4, total: 4, max: 100 },
      })
    );
    expect(sent.result.mcqs[0]).toMatchObject({ answered: true, correct: false, marks: 0 });
    expect(sent.result.positions[0]).toMatchObject({ solved: true, marks: 4 });
    expect(sent.submitReasonLabel).toContain("another tab");
    const text = JSON.stringify(sent);
    expect(text).not.toContain("Ra8+");
    expect(text).not.toContain('"options"');
  });
});
