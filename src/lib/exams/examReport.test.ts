import { describe, expect, it } from "vitest";
import { examResult, solutionLine, topicBreakdown, topicReportLines } from "@/lib/exams/examReport";

describe("marks by topic", () => {
  const mcqs = [
    { id: "m1", topicName: "Checkmates" },
    { id: "m2", topicName: "Checkmates" },
    { id: "m3", topicName: "Endgames" },
  ];
  const positions = [
    { id: "p1", topicName: "Checkmates" },
    { id: "p2", topicName: "Endgames" },
    { id: "p3", topicName: "" },
  ];

  it("adds MCQ and position marks per topic, strongest first", () => {
    const breakdown = topicBreakdown({
      mcqs,
      positions,
      mcqAnswers: [
        { questionId: "m1", correct: true },
        { questionId: "m2", correct: true },
        { questionId: "m3", correct: false },
      ],
      positionProgress: [
        { questionId: "p1", solved: true, wrongMoves: 1 },
        { questionId: "p2", solved: false, wrongMoves: 4 },
        { questionId: "p3", solved: true, hintsUsed: 1 },
      ],
    });
    expect(breakdown.topics).toEqual([
      { topic: "Checkmates", earned: 8.5, max: 9, percent: 94, mcqRight: 2, mcqTotal: 2, positionsSolved: 1, positionsTotal: 1 },
      { topic: "Other", earned: 3, max: 5, percent: 60, mcqRight: 0, mcqTotal: 0, positionsSolved: 1, positionsTotal: 1 },
      { topic: "Endgames", earned: 0, max: 7, percent: 0, mcqRight: 0, mcqTotal: 1, positionsSolved: 0, positionsTotal: 1 },
    ]);
    expect(breakdown.strong).toEqual(["Checkmates"]);
    expect(breakdown.weak).toEqual(["Endgames"]);
    expect(topicReportLines(breakdown)[0]).toBe("Checkmates: 8.5 of 9 marks (94%)");
  });

  it("scores an untouched question as zero", () => {
    const breakdown = topicBreakdown({ mcqs, positions });
    expect(breakdown.topics.every((score) => score.earned === 0)).toBe(true);
    expect(breakdown.strong).toEqual([]);
  });
});

describe("a solution written out", () => {
  it("numbers White's moves", () => {
    expect(solutionLine("4k3/8/8/8/8/8/8/R3K2R w - - 0 1", ["Ra8+", "Kd7", "Rh7+"])).toBe("1. Ra8+ Kd7 2. Rh7+");
  });

  it("starts with an ellipsis when Black is to move", () => {
    expect(solutionLine("4k3/8/8/8/8/8/8/4K3 b - - 0 12", ["Kd7", "Kd2", "Kc6"])).toBe("12... Kd7 13. Kd2 Kc6");
  });
});

describe("the student's result", () => {
  const input = {
    mcqs: [
      { id: "m1", topicName: "Forks", question: "Best move?", positionFen: "", options: [{ id: "a", text: "Nf7+", correct: true }, { id: "b", text: "Qh5" }], explanation: "The knight forks king and rook." },
      { id: "m2", topicName: "Forks", question: "Which piece forks?", options: [{ id: "a", text: "Knight", correct: true }, { id: "b", text: "Pawn" }] },
    ],
    positions: [{ id: "p1", topicName: "Pins", question: "White to play.", startFen: "4k3/8/8/8/8/8/8/R3K2R w - - 0 1", orientation: "white" as const, solution: ["Ra8+"] }],
  };

  it("reviews only what was missed, and never ships which option was right on a correct answer", () => {
    const result = examResult({ ...input, mcqAnswers: [{ questionId: "m1", selected: "b", correct: false }, { questionId: "m2", selected: "a", correct: true }], positionProgress: [] });
    expect(result.mcqs[0].review).toEqual({
      question: "Best move?",
      positionFen: "",
      options: [{ id: "a", text: "Nf7+" }, { id: "b", text: "Qh5" }],
      selected: "b",
      correctOptionId: "a",
      explanation: "The knight forks king and rook.",
    });
    expect(result.mcqs[1].review).toBeUndefined();
    expect(result.positions[0].review).toEqual({ question: "White to play.", startFen: "4k3/8/8/8/8/8/8/R3K2R w - - 0 1", orientation: "white", solution: "1. Ra8+" });
  });

  it("reviews an unanswered MCQ with no answer of the student's", () => {
    const result = examResult({ ...input, mcqAnswers: [], positionProgress: [{ questionId: "p1", solved: true }] });
    expect(result.mcqs[0]).toMatchObject({ answered: false, marks: 0 });
    expect(result.mcqs[0].review?.selected).toBeNull();
    expect(result.positions[0].review).toBeUndefined();
  });
});
