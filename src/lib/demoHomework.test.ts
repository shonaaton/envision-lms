import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { demoHomeworkActivities } from "./demoHomework";

/**
 * The demo assignment is the first homework a prospect ever opens, and a PGN the
 * player cannot parse leaves them staring at "No moves found in this PGN." with
 * no way forward. These check the same thing the player does - loadPgn, then the
 * move list it drives the board from.
 */
function pgnActivity() {
  const activity = demoHomeworkActivities().find((item: any) => item.type === "study_pgn") as any;
  expect(activity).toBeTruthy();
  return activity;
}

describe("demo homework", () => {
  it("ships MCQ, board and written activities", () => {
    const types = demoHomeworkActivities().map((activity: any) => activity.type);
    expect(types).toContain("quiz");
    expect(types).toContain("study_pgn");
    expect(types).toContain("written_answer");
  });

  it("marks the board activity as a PGN quiz so the player renders a board", () => {
    expect(pgnActivity().source.kind).toBe("pgn_quiz");
    expect(pgnActivity().items.length).toBeGreaterThan(0);
  });

  it("gives every MCQ exactly one correct option", () => {
    const quiz = demoHomeworkActivities().find((activity: any) => activity.type === "quiz") as any;
    for (const item of quiz.items) {
      expect(item.options.filter((option: any) => option.correct)).toHaveLength(1);
    }
  });

  it("uses PGNs the homework player can replay", () => {
    for (const item of pgnActivity().items) {
      const game = new Chess();
      expect(() => game.loadPgn(item.pgn), `${item.id} should load`).not.toThrow();
      const moves = game.history({ verbose: true }) as any[];
      // Zero moves is what makes the board unsolvable, and the student always
      // moves first, so the line has to start from White's side.
      expect(moves.length, `${item.id} should have moves`).toBeGreaterThan(0);
      expect(moves[0].color, `${item.id} should start with the student's move`).toBe("w");
    }
  });

  it("keeps each board task short enough to finish in a demo", () => {
    for (const item of pgnActivity().items) {
      const game = new Chess();
      game.loadPgn(item.pgn);
      expect(game.history().length).toBeLessThanOrEqual(12);
    }
  });
});
