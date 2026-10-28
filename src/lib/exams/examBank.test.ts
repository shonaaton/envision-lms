import { describe, expect, it } from "vitest";
import { ExamBankError, drawAcrossTopics, drawPaper, extractBank, pickReplacement, templateMatchesLevel } from "@/lib/exams/examBank";
import { generatedPositionQuestion, pgnLeadingComment, positionQuestionFor } from "@/lib/exams/examQuestions";
import { judgePuzzleMove, parsePgnPuzzle, puzzleFenAt, puzzleStudentColor } from "@/lib/pgnPuzzle";

// White to move: 1.Qxf7# (scholar's mate finish).
const MATE_IN_ONE = '[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4"]\n[SetUp "1"]\n\n4. Qxf7# *';
// Black to move, two student moves with a white reply between.
const TWO_MOVER = '[FEN "6k1/5ppp/8/8/8/8/5PPP/3r2K1 b - - 0 1"]\n[SetUp "1"]\n\n1... Rd1+ 2. Kf1 *';
const LINE = '[FEN "4k3/8/8/8/8/8/8/R3K2R w - - 0 1"]\n[SetUp "1"]\n\n1. Ra8+ Kd7 2. Rh7+ *';

function quizTemplate(id: string, topic: string, count: number) {
  return {
    _id: id,
    title: `HW ${topic}`,
    topicName: topic,
    levelName: "Level 1",
    tier: "beginner",
    activities: [
      {
        id: `${id}-a`,
        type: "quiz",
        items: Array.from({ length: count }, (_, index) => ({
          id: `q${index}`,
          question: `${topic} question ${index}`,
          options: [
            { id: "a", text: "Yes", correct: true },
            { id: "b", text: "No", correct: false },
          ],
        })),
      },
    ],
  };
}

describe("PGN puzzle check", () => {
  it("accepts the right move and solves", () => {
    const puzzle = parsePgnPuzzle(MATE_IN_ONE);
    expect(puzzleStudentColor(puzzle)).toBe("white");
    const verdict = judgePuzzleMove(puzzle, 0, { from: "f3", to: "f7" });
    expect(verdict).toMatchObject({ legal: true, correct: true, solved: true, ply: 1 });
  });

  it("marks a legal wrong move wrong and an illegal move as no move", () => {
    const puzzle = parsePgnPuzzle(MATE_IN_ONE);
    expect(judgePuzzleMove(puzzle, 0, { from: "f3", to: "f6" })).toMatchObject({ legal: true, correct: false });
    expect(judgePuzzleMove(puzzle, 0, { from: "f3", to: "a8" })).toEqual({ legal: false });
  });

  it("plays the reply and waits for the student's next move", () => {
    const puzzle = parsePgnPuzzle(LINE);
    const first = judgePuzzleMove(puzzle, 0, { from: "a1", to: "a8" });
    expect(first).toMatchObject({ correct: true, solved: false, ply: 2 });
    expect((first as any).reply.san).toBe("Kd7");
    expect((first as any).fen).toBe(puzzleFenAt(puzzle, 2));
    expect(judgePuzzleMove(puzzle, 2, { from: "h1", to: "h7" })).toMatchObject({ correct: true, solved: true, ply: 3 });
  });

  it("knows when black is the side to play", () => {
    expect(puzzleStudentColor(parsePgnPuzzle(TWO_MOVER))).toBe("black");
  });
});

describe("question bank", () => {
  it("keeps single-answer MCQs and solvable PGN positions, once each", () => {
    const bank = extractBank([
      {
        _id: "t1",
        title: "Forks",
        topicName: "Forks",
        levelName: "Level 1",
        tier: "beginner",
        activities: [
          {
            id: "a1",
            type: "quiz",
            items: [
              { id: "q1", question: "Best?", options: [{ id: "a", text: "Nf7", correct: true }, { id: "b", text: "Nd7", correct: false }] },
              { id: "q2", question: "Two right", options: [{ id: "a", text: "x", correct: true }, { id: "b", text: "y", correct: true }] },
              { id: "q3", question: "None right", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }] },
            ],
          },
          { id: "a2", type: "study_pgn", source: { kind: "pgn_quiz" }, items: [{ id: "p1", pgn: MATE_IN_ONE }, { id: "p2", pgn: "not a pgn" }] },
          { id: "a3", type: "study_pgn", source: { kind: "pgn_study" }, items: [{ id: "p3", pgn: LINE }] },
        ],
      },
      {
        _id: "t2",
        topicName: "Forks again",
        levelName: "Level 1",
        tier: "beginner",
        activities: [{ id: "b1", type: "study_pgn", source: { kind: "pgn_quiz" }, items: [{ id: "p1", pgn: MATE_IN_ONE }] }],
      },
    ]);
    expect(bank.mcqs.map((mcq) => mcq.question)).toEqual(["Best?"]);
    expect(bank.positions).toHaveLength(1);
    expect(bank.positions[0]).toMatchObject({ topicName: "Forks", solution: ["Qxf7#"], studentColor: "white" });
  });

  it("matches templates by tier and level number", () => {
    expect(templateMatchesLevel({ _id: 1, tier: "beginner", levelName: "Beginner Level1" }, "beginner", 1)).toBe(true);
    expect(templateMatchesLevel({ _id: 1, tier: "beginner", levelName: "Level 2" }, "beginner", 1)).toBe(false);
    expect(templateMatchesLevel({ _id: 1, tier: "intermediate", levelName: "Level 1" }, "beginner", 1)).toBe(false);
  });
});

describe("drawing a paper", () => {
  it("spreads the questions across topics", () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, index) => ({ bankKey: `a${index}`, topicName: "A" })),
      { bankKey: "b0", topicName: "B" },
      { bankKey: "c0", topicName: "C" },
    ];
    const picked = drawAcrossTopics(pool, 4);
    expect(new Set(picked.map((item) => item.topicName))).toEqual(new Set(["A", "B", "C"]));
    expect(new Set(picked.map((item) => item.bankKey)).size).toBe(4);
  });

  it("refuses a bank too small for a full paper", () => {
    const bank = extractBank([quizTemplate("t", "Pins", 4)]);
    expect(() => drawPaper(bank)).toThrow(ExamBankError);
  });

  it("replaces from the same topic first and never repeats a question", () => {
    const pool = [
      { bankKey: "a1", topicName: "A" },
      { bankKey: "a2", topicName: "A" },
      { bankKey: "b1", topicName: "B" },
    ];
    const paper = [{ bankKey: "a1" }, { bankKey: "b1" }];
    expect(pickReplacement(pool, paper, { bankKey: "a1", topicName: "A" })?.bankKey).toBe("a2");
    expect(pickReplacement(pool, [{ bankKey: "a1" }, { bankKey: "a2" }], { bankKey: "b1", topicName: "B" })).toBeNull();
    expect(pickReplacement(pool, [{ bankKey: "a1" }], { bankKey: "a1", topicName: "A" }, () => 0)?.bankKey).toBe("a2");
  });
});

describe("position questions", () => {
  it("writes a mate question from the solution", () => {
    expect(generatedPositionQuestion({ topicName: "Anything", studentColor: "white", solution: ["Qxf7#"] })).toBe("White to play and mate in 1.");
    expect(generatedPositionQuestion({ studentColor: "black", solution: ["Rd1+", "Kf1", "Rf1#"] })).toBe("Black to play and mate in 2.");
  });

  it("uses the topic's theme and says how long the line is", () => {
    expect(generatedPositionQuestion({ topicName: "Forks Easy", studentColor: "white", solution: ["Nc7+"] })).toBe("White to play. Find the fork.");
    expect(generatedPositionQuestion({ topicName: "Pins", studentColor: "black", solution: ["Bb4", "a3", "Bxc3+"] })).toBe("Black to play. Use the pin to win material. Play the whole line (2 moves).");
    expect(generatedPositionQuestion({ topicName: "Revision", studentColor: "white", solution: ["e4"] })).toBe("White to play. Find the best move.");
    expect(generatedPositionQuestion({ topicName: "Back Rank Combinations", studentColor: "white", solution: ["Re8+"] })).toBe("White to play. Use the weak back rank.");
  });

  it("prefers a question written in the homework, then the PGN's opening comment", () => {
    const commented = '[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4"]\n[SetUp "1"]\n\n{ Can you finish the game in one move? } 4. Qxf7# *';
    expect(pgnLeadingComment(commented)).toBe("Can you finish the game in one move?");
    expect(positionQuestionFor({ pgn: commented, solution: ["Qxf7#"] })).toBe("Can you finish the game in one move?");
    expect(positionQuestionFor({ question: "Win the queen.", pgn: commented })).toBe("Win the queen.");
    expect(positionQuestionFor({ pgn: MATE_IN_ONE, studentColor: "white", solution: ["Qxf7#"] })).toBe("White to play and mate in 1.");
  });

  it("gives every bank position a question", () => {
    const bank = extractBank([
      { _id: "t", topicName: "Skewers", levelName: "Level 1", tier: "beginner", activities: [{ id: "a", type: "study_pgn", source: { kind: "pgn_quiz" }, items: [{ id: "p", pgn: LINE }] }] },
    ]);
    expect(bank.positions[0].question).toBe("White to play. Find the skewer. Play the whole line (2 moves).");
  });
});
