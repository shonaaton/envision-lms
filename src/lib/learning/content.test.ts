import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { AUTHORED_SECTIONS, authoredExerciseList, exerciseDocument, introStableKey } from "@/lib/learning/content";
import {
  buildDemoTimeline,
  createSession,
  applyChoice,
  applyMove,
  applySquareSelection,
  correctSquares,
  informationDemoMoves,
  informationKeyPoints,
  isSquare,
  parseMovementBoard,
  verifyLearningSolution,
  type LearningExerciseSpec,
} from "@/lib/learning/engine";

/**
 * Content guard. Every authored position is replayed through the same engine the
 * student uses, so a mistyped FEN or an impossible solution fails here rather than
 * stranding a child on exercise 4 of 7 with no way forward.
 */

const authored = authoredExerciseList();

function specFor(entry: (typeof authored)[number]): LearningExerciseSpec {
  const document = exerciseDocument(entry.lesson, entry.exercise, entry.order);
  return {
    rulesMode: document.rulesMode,
    interactionMode: document.interactionMode,
    goalType: document.goalType,
    startingPosition: document.startingPosition,
    orientation: document.orientation as "white" | "black",
    sideToMove: document.sideToMove as "white" | "black",
    goalConfig: document.goalConfig as Record<string, unknown>,
    acceptedSolutions: document.acceptedSolutions,
    opponentScript: document.opponentScript,
    targets: document.targets,
    obstacles: document.obstacles,
    maxMoves: document.maxMoves,
    idealMoves: document.idealMoves,
  };
}

describe("Learn Chess curriculum shape", () => {
  it("has four sections and fifteen lessons", () => {
    expect(AUTHORED_SECTIONS).toHaveLength(4);
    expect(AUTHORED_SECTIONS.flatMap((section) => section.lessons)).toHaveLength(15);
  });

  it("gives every lesson at least six exercises", () => {
    for (const section of AUTHORED_SECTIONS) {
      for (const lesson of section.lessons) {
        expect(lesson.exercises.length, `${lesson.stableKey} exercise count`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("uses a unique stable key for every exercise", () => {
    const keys = authored.map((entry) => entry.stableKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never repeats a position inside a lesson unless the task differs", () => {
    for (const section of AUTHORED_SECTIONS) {
      for (const lesson of section.lessons) {
        const fingerprints = lesson.exercises.map(
          (exercise) => `${exercise.startingPosition}::${JSON.stringify(exercise.goalConfig || {})}::${(exercise.solution || []).join(",")}`
        );
        expect(new Set(fingerprints).size, `${lesson.stableKey} repeats an exercise`).toBe(fingerprints.length);
      }
    }
  });

  it("writes a hint and an explanation for every exercise", () => {
    for (const entry of authored) {
      // Slides have nothing to get wrong, so they carry no hint.
      if (entry.exercise.interactionMode === "INFORMATION") continue;
      expect(entry.exercise.hint.length, `${entry.stableKey} hint`).toBeGreaterThan(10);
      expect(entry.exercise.explanation.length, `${entry.stableKey} explanation`).toBeGreaterThan(10);
    }
  });
});

describe("Learn Chess positions load", () => {
  it("loads every legal-chess position in chess.js with the right side to move", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.rulesMode !== "LEGAL_CHESS") continue;
      const game = new Chess(spec.startingPosition);
      expect(game.turn(), `${entry.stableKey} side to move`).toBe(spec.sideToMove === "black" ? "b" : "w");
    }
  });

  it("parses every movement-trainer position and finds the piece to move", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.rulesMode !== "MOVEMENT_TRAINER" || spec.interactionMode === "INFORMATION") continue;
      const board = parseMovementBoard(spec.startingPosition);
      expect(board.size, `${entry.stableKey} is an empty board`).toBeGreaterThan(0);
      const first = (spec.acceptedSolutions?.[0]?.moves || [])[0] || "";
      expect(board.get(first.slice(0, 2)), `${entry.stableKey} has no piece on ${first.slice(0, 2)}`).toBeTruthy();
    }
  });
});

describe("Learn Chess solutions", () => {
  it("solves every board exercise with its own model line", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.interactionMode === "INFORMATION") continue;
      if (spec.rulesMode === "QUESTION" || spec.interactionMode === "SELECT_SQUARE") continue;

      const moves = entry.exercise.solution || [];
      expect(moves.length, `${entry.stableKey} has no model solution`).toBeGreaterThan(0);

      let state = createSession(spec);
      let solved = false;
      for (const move of moves) {
        const outcome = applyMove(spec, state, move.slice(0, 2), move.slice(2, 4), move.slice(4) || undefined);
        expect(outcome.ok, `${entry.stableKey}: engine rejected ${move} (${outcome.reason})`).toBe(true);
        state = outcome.state;
        if (outcome.solved) {
          solved = true;
          break;
        }
      }
      expect(solved, `${entry.stableKey} was not solved by its model line`).toBe(true);
    }
  });

  it("agrees with server-side verification for every board exercise", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.interactionMode === "INFORMATION") continue;
      if (spec.rulesMode === "QUESTION" || spec.interactionMode === "SELECT_SQUARE") continue;
      const result = verifyLearningSolution(spec, { moves: entry.exercise.solution || [] });
      expect(result.solved, `${entry.stableKey} failed replay verification`).toBe(true);
    }
  });

  it("rejects a plausible wrong move on every single-move exercise", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.interactionMode !== "BOARD_MOVE") continue;
      if (spec.rulesMode !== "LEGAL_CHESS") continue;
      // Escaping check is the one goal where every legal move is a right answer,
      // because chess.js will not generate a move that leaves the king attacked.
      if (spec.goalType === "ESCAPE_CHECK") continue;
      const game = new Chess(spec.startingPosition);
      const solution = (entry.exercise.solution || [])[0] || "";
      const wrong = game
        .moves({ verbose: true })
        .map((move: any) => `${move.from}${move.to}${move.promotion || ""}`)
        .filter((uci: string) => uci !== solution);
      const stillOpen = wrong.filter((uci: string) => {
        const outcome = applyMove(spec, createSession(spec), uci.slice(0, 2), uci.slice(2, 4), uci.slice(4) || undefined);
        return outcome.solved;
      });
      // Several exercises accept more than one right answer, but no exercise may
      // accept every legal move - that would mean the goal check does nothing.
      expect(stillOpen.length, `${entry.stableKey} accepts every legal move`).toBeLessThan(wrong.length);
    }
  });

  it("starts every escape-check exercise in check, and every give-check exercise out of it", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.rulesMode !== "LEGAL_CHESS") continue;
      const game = new Chess(spec.startingPosition);
      if (spec.goalType === "ESCAPE_CHECK") {
        expect(game.isCheck(), `${entry.stableKey} is not actually in check`).toBe(true);
      }
      if (spec.goalType === "GIVE_CHECK") {
        expect(game.isCheck(), `${entry.stableKey} already starts in check`).toBe(false);
      }
    }
  });

  it("really is mate at the end of every checkmate exercise", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.goalType !== "CHECKMATE") continue;
      const game = new Chess(spec.startingPosition);
      const script = spec.opponentScript || [];
      if (script.length) {
        for (const step of script) {
          const token = step.actor === "opponent" ? step.move : (step.acceptedMoves || [])[0];
          const move = String(token || "");
          expect(game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || "q" })).toBeTruthy();
        }
      } else {
        const move = (entry.exercise.solution || [])[0] || "";
        game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || "q" });
      }
      expect(game.isCheckmate(), `${entry.stableKey} does not end in checkmate`).toBe(true);
    }
  });

  it("forces the scripted reply in every multi-move exercise", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.interactionMode !== "BOARD_SEQUENCE" || spec.rulesMode !== "LEGAL_CHESS") continue;
      const game = new Chess(spec.startingPosition);
      for (const step of spec.opponentScript || []) {
        if (step.actor === "student") {
          const move = String((step.acceptedMoves || [])[0] || "");
          expect(
            game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || "q" }),
            `${entry.stableKey}: student move ${move} is illegal`
          ).toBeTruthy();
          continue;
        }
        const replies = game.moves({ verbose: true }).map((item: any) => `${item.from}${item.to}${item.promotion || ""}`);
        expect(replies, `${entry.stableKey}: scripted reply ${step.move} is not legal`).toContain(String(step.move));
        // A mate line only proves anything if black had no other option. Teaching
        // sequences (clear the bishop, then castle) work against any reply, so they
        // are allowed to script a natural move instead of a forced one.
        if (spec.goalType === "CHECKMATE") {
          expect(replies.length, `${entry.stableKey}: black can sidestep this mate`).toBe(1);
        }
        const move = String(step.move);
        game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || "q" });
      }
    }
  });

  it("answers every multiple-choice question from its own options", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.rulesMode !== "QUESTION" || spec.interactionMode === "INFORMATION") continue;
      const options = (spec.goalConfig?.options || []) as string[];
      const correct = String(spec.goalConfig?.correctOption || "");
      expect(options.length, `${entry.stableKey} has no options`).toBeGreaterThanOrEqual(3);
      expect(options, `${entry.stableKey} answer is not in its options`).toContain(correct);
      expect(new Set(options).size, `${entry.stableKey} repeats an option`).toBe(options.length);
      expect(applyChoice(spec, createSession(spec), correct).solved).toBe(true);
      const wrong = options.find((option) => option !== correct) as string;
      expect(applyChoice(spec, createSession(spec), wrong).solved).toBe(false);
    }
  });

  it("solves every select-square exercise from its answer key", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.interactionMode !== "SELECT_SQUARE") continue;
      const wanted = correctSquares(spec);
      expect(wanted.length, `${entry.stableKey} has no correct squares`).toBeGreaterThan(0);
      expect(wanted.every(isSquare), `${entry.stableKey} has an invalid square`).toBe(true);

      let state = createSession(spec);
      let solved = false;
      for (const square of wanted) {
        const outcome = applySquareSelection(spec, state, square);
        expect(outcome.ok, `${entry.stableKey}: ${square} was rejected`).toBe(true);
        state = outcome.state;
        solved = outcome.solved;
      }
      expect(solved, `${entry.stableKey} was not solved by its answer key`).toBe(true);
      expect(verifyLearningSolution(spec, { selections: wanted }).solved).toBe(true);
    }
  });

  it("keeps every answer key square occupied by a real piece", () => {
    for (const entry of authored) {
      const spec = specFor(entry);
      if (spec.interactionMode !== "SELECT_SQUARE") continue;
      // Answer keys that name a piece must point at one; answer keys that name
      // attacked squares are allowed to be empty.
      const prompt = String(spec.goalConfig?.prompt || "").toLowerCase();
      if (!prompt.includes("piece")) continue;
      const game = new Chess(spec.startingPosition);
      for (const square of correctSquares(spec)) {
        expect(game.get(square as any), `${entry.stableKey}: nothing stands on ${square}`).toBeTruthy();
      }
    }
  });
});

describe("Learn Chess lesson intros", () => {
  const intros = authored.filter((entry) => entry.exercise.interactionMode === "INFORMATION");

  it("opens every lesson with a slide", () => {
    expect(intros).toHaveLength(15);
    for (const entry of intros) {
      expect(entry.order, `${entry.stableKey} must sort before the puzzles`).toBe(0);
      expect(entry.stableKey).toBe(introStableKey(entry.lesson.stableKey));
    }
  });

  it("keeps intro keys clear of the numbered exercises", () => {
    // Adding a slide must never renumber a puzzle a student has already solved.
    const numbered = authored.filter((entry) => entry.order > 0).map((entry) => entry.stableKey);
    for (const entry of intros) expect(numbered).not.toContain(entry.stableKey);
  });

  it("gives every slide real teaching points", () => {
    for (const entry of intros) {
      const points = informationKeyPoints(specFor(entry));
      expect(points.length, `${entry.stableKey} key points`).toBeGreaterThanOrEqual(3);
      for (const point of points) expect(point.length, `${entry.stableKey} key point too short`).toBeGreaterThan(20);
      expect(entry.exercise.explanation.length, `${entry.stableKey} explanation`).toBeGreaterThan(10);
    }
  });

  it("replays every demo line without an error", () => {
    for (const entry of intros) {
      const spec = specFor(entry);
      const moves = informationDemoMoves(spec);
      const timeline = buildDemoTimeline(spec);
      expect(timeline.error, `${entry.stableKey}: ${timeline.error}`).toBeUndefined();
      expect(timeline.steps.length, `${entry.stableKey} timeline length`).toBe(moves.length + 1);
    }
  });

  it("counts a slide as read without asking for a move", () => {
    for (const entry of intros) {
      expect(verifyLearningSolution(specFor(entry), {}).solved, `${entry.stableKey} cannot be completed`).toBe(true);
    }
  });
});

describe("Learn Chess move budgets", () => {
  it("never sets a move limit below the model solution", () => {
    for (const entry of authored) {
      const limit = entry.exercise.maxMoves || 0;
      if (!limit) continue;
      expect(limit, `${entry.stableKey} cannot be solved inside its own move limit`).toBeGreaterThanOrEqual(
        (entry.exercise.solution || []).length
      );
    }
  });
});
