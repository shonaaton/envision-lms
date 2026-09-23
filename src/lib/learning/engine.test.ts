import { describe, expect, it } from "vitest";
import {
  applyChoice,
  buildDemoTimeline,
  applyMove,
  applySquareSelection,
  createSession,
  legalDestinations,
  movementDestinations,
  movementMoveIsLegal,
  parseMovementBoard,
  serializeMovementBoard,
  verifyLearningSolution,
  type LearningExerciseSpec,
} from "@/lib/learning/engine";

const EMPTY = "8/8/8/8/8/8/8/8 w - - 0 1";

function movementSpec(overrides: Partial<LearningExerciseSpec> = {}): LearningExerciseSpec {
  return {
    rulesMode: "MOVEMENT_TRAINER",
    interactionMode: "BOARD_MOVE",
    goalType: "REACH_SQUARE",
    startingPosition: EMPTY,
    sideToMove: "white",
    goalConfig: {},
    acceptedSolutions: [],
    opponentScript: [],
    targets: [],
    obstacles: [],
    ...overrides,
  };
}

function legalSpec(overrides: Partial<LearningExerciseSpec> = {}): LearningExerciseSpec {
  return {
    rulesMode: "LEGAL_CHESS",
    interactionMode: "BOARD_MOVE",
    goalType: "CAPTURE_TARGET",
    startingPosition: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1",
    sideToMove: "white",
    goalConfig: {},
    acceptedSolutions: [],
    opponentScript: [],
    targets: [],
    obstacles: [],
    ...overrides,
  };
}

describe("movement board parsing", () => {
  it("reads a position chess.js would refuse, because it has no kings", () => {
    const board = parseMovementBoard("8/8/8/8/8/8/8/1N6 w - - 0 1");
    expect(board.size).toBe(1);
    expect(board.get("b1")).toEqual({ type: "n", color: "w" });
  });

  it("round-trips a board back to the same placement", () => {
    const fen = "8/8/5p2/4p3/3P4/8/8/8 w - - 0 1";
    expect(serializeMovementBoard(parseMovementBoard(fen), "w")).toBe(fen);
  });
});

describe("movement geometry", () => {
  const board = parseMovementBoard("8/8/8/8/3q4/8/8/8 w - - 0 1");
  const none = new Set<string>();

  it("accepts rook, bishop and queen lines", () => {
    expect(movementMoveIsLegal(board, none, "d4", "d8")).toBe(true);
    expect(movementMoveIsLegal(board, none, "d4", "h8")).toBe(true);
    expect(movementMoveIsLegal(board, none, "d4", "a4")).toBe(true);
  });

  it("rejects a move that is not on any line", () => {
    expect(movementMoveIsLegal(board, none, "d4", "e6")).toBe(false);
  });

  it("stops a slider at a blocking piece", () => {
    const blocked = parseMovementBoard("8/8/8/3p4/3R4/8/8/8 w - - 0 1");
    expect(movementMoveIsLegal(blocked, none, "d4", "d5")).toBe(true);
    expect(movementMoveIsLegal(blocked, none, "d4", "d6")).toBe(false);
  });

  it("treats an obstacle square as a wall the slider cannot cross", () => {
    const rook = parseMovementBoard("8/8/8/8/8/8/8/R7 w - - 0 1");
    expect(movementMoveIsLegal(rook, new Set(["a4"]), "a1", "a8")).toBe(false);
    expect(movementMoveIsLegal(rook, new Set(["a4"]), "a1", "a3")).toBe(true);
  });

  it("lets a knight jump a crowd but not land on an obstacle", () => {
    const knight = parseMovementBoard("8/8/8/2ppp3/2pNp3/2ppp3/8/8 w - - 0 1");
    expect(movementMoveIsLegal(knight, new Set(), "d4", "e6")).toBe(true);
    expect(movementMoveIsLegal(knight, new Set(["e6"]), "d4", "e6")).toBe(false);
  });

  it("applies the real pawn rules", () => {
    const pawn = parseMovementBoard("8/8/8/8/8/8/4P3/8 w - - 0 1");
    expect(movementMoveIsLegal(pawn, new Set(), "e2", "e3")).toBe(true);
    expect(movementMoveIsLegal(pawn, new Set(), "e2", "e4")).toBe(true);
    expect(movementMoveIsLegal(pawn, new Set(), "e2", "e5")).toBe(false);
    expect(movementMoveIsLegal(pawn, new Set(), "e2", "d3")).toBe(false);

    const capture = parseMovementBoard("8/8/8/8/8/3p4/4P3/8 w - - 0 1");
    expect(movementMoveIsLegal(capture, new Set(), "e2", "d3")).toBe(true);

    const pushed = parseMovementBoard("8/8/8/8/8/8/4P3/8 w - - 0 1");
    pushed.set("e3", { type: "p", color: "b" });
    expect(movementMoveIsLegal(pushed, new Set(), "e2", "e3")).toBe(false);
    expect(movementMoveIsLegal(pushed, new Set(), "e2", "e4")).toBe(false);
  });

  it("gives a corner knight exactly two destinations", () => {
    const knight = parseMovementBoard("8/8/8/8/8/8/8/N7 w - - 0 1");
    expect(movementDestinations(knight, new Set(), "a1").sort()).toEqual(["b3", "c2"]);
  });
});

describe("movement sessions", () => {
  it("solves a reach-square exercise and refuses to move the wrong colour", () => {
    const spec = movementSpec({
      startingPosition: "8/8/8/8/8/8/8/1N6 w - - 0 1",
      goalConfig: { targetSquare: "c3" },
    });
    const wrongPiece = applyMove(spec, createSession(spec), "c3", "b1");
    expect(wrongPiece.ok).toBe(false);

    const outcome = applyMove(spec, createSession(spec), "b1", "c3");
    expect(outcome.solved).toBe(true);
  });

  it("collects targets one at a time and only finishes on the last one", () => {
    const spec = movementSpec({
      startingPosition: "8/8/8/8/8/8/8/R7 w - - 0 1",
      interactionMode: "COLLECT_TARGETS",
      goalType: "COLLECT_TARGETS",
      targets: ["a4", "d4", "d1"],
      maxMoves: 4,
    });
    let state = createSession(spec);
    const first = applyMove(spec, state, "a1", "a4");
    expect(first.solved).toBe(false);
    expect(first.state.collectedTargets).toEqual(["a4"]);
    state = first.state;
    state = applyMove(spec, state, "a4", "d4").state;
    const last = applyMove(spec, state, "d4", "d1");
    expect(last.solved).toBe(true);
  });

  it("fails an exercise that runs past its move budget", () => {
    const spec = movementSpec({
      startingPosition: "8/8/8/8/8/8/8/R7 w - - 0 1",
      goalConfig: { targetSquare: "h8" },
      obstacles: ["a4"],
      maxMoves: 2,
    });
    let state = createSession(spec);
    state = applyMove(spec, state, "a1", "b1").state;
    const second = applyMove(spec, state, "b1", "b2");
    expect(second.failed).toBe(true);
    expect(second.state.status).toBe("failed");
  });

  it("walks a movement sequence in order", () => {
    const spec = movementSpec({
      startingPosition: "8/8/5p2/4p3/3P4/8/8/8 w - - 0 1",
      interactionMode: "BOARD_SEQUENCE",
      goalConfig: { targetSquare: "f6" },
      opponentScript: [
        { actor: "student", acceptedMoves: ["d4e5"] },
        { actor: "student", acceptedMoves: ["e5f6"] },
      ],
    });
    let state = createSession(spec);
    const outOfOrder = applyMove(spec, state, "d4", "d5");
    expect(outOfOrder.ok).toBe(false);
    state = applyMove(spec, state, "d4", "e5").state;
    expect(applyMove(spec, state, "e5", "f6").solved).toBe(true);
  });
});

describe("legal chess sessions", () => {
  it("requires the goal, not just a legal move", () => {
    const spec = legalSpec({ goalConfig: { targetSquare: "d5" } });
    expect(applyMove(spec, createSession(spec), "e1", "e2").ok).toBe(false);
    expect(applyMove(spec, createSession(spec), "e4", "d5").solved).toBe(true);
  });

  it("accepts any checking move when the exercise says so", () => {
    const spec = legalSpec({
      goalType: "GIVE_CHECK",
      startingPosition: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
    });
    expect(applyMove(spec, createSession(spec), "d1", "d8").solved).toBe(true);
    expect(applyMove(spec, createSession(spec), "d1", "h5").solved).toBe(true);
    expect(applyMove(spec, createSession(spec), "d1", "d2").ok).toBe(false);
  });

  it("plays the scripted reply and finishes on mate", () => {
    const spec = legalSpec({
      goalType: "CHECKMATE",
      interactionMode: "BOARD_SEQUENCE",
      startingPosition: "7k/8/5K2/8/8/8/8/R7 w - - 0 1",
      goalConfig: { acceptAnyGoalMove: true },
      opponentScript: [
        { actor: "student", acceptedMoves: ["f6g6"] },
        { actor: "opponent", move: "h8g8" },
        { actor: "student", acceptedMoves: ["a1a8"] },
      ],
    });
    const first = applyMove(spec, createSession(spec), "f6", "g6");
    expect(first.solved).toBe(false);
    expect(first.opponentMove?.to).toBe("g8");
    expect(applyMove(spec, first.state, "a1", "a8").solved).toBe(true);
  });

  it("lists legal destinations for the piece the student picked up", () => {
    const spec = legalSpec();
    expect(legalDestinations(spec, createSession(spec), "e4").sort()).toEqual(["d5", "e5"]);
  });
});

describe("select square and multiple choice", () => {
  const selectSpec = legalSpec({
    interactionMode: "SELECT_SQUARE",
    goalType: "SELECT_CORRECT_SQUARE",
    startingPosition: "4k3/8/8/8/8/8/8/n3K3 w - - 0 1",
    goalConfig: { correctSquares: ["b3", "c2"] },
  });

  it("needs every correct square before it finishes", () => {
    let state = createSession(selectSpec);
    expect(applySquareSelection(selectSpec, state, "d4").ok).toBe(false);
    const first = applySquareSelection(selectSpec, state, "b3");
    expect(first.solved).toBe(false);
    state = first.state;
    expect(applySquareSelection(selectSpec, state, "c2").solved).toBe(true);
  });

  it("checks a multiple-choice answer against the key", () => {
    const spec = legalSpec({
      rulesMode: "QUESTION",
      interactionMode: "MULTIPLE_CHOICE",
      goalType: "MULTIPLE_CHOICE",
      goalConfig: { options: ["5 pawns", "3 pawns"], correctOption: "5 pawns" },
    });
    expect(applyChoice(spec, createSession(spec), "5 pawns").solved).toBe(true);
    expect(applyChoice(spec, createSession(spec), "3 pawns").solved).toBe(false);
  });
});

describe("information slides", () => {
  function slideSpec(overrides: Partial<LearningExerciseSpec> = {}): LearningExerciseSpec {
    return legalSpec({
      interactionMode: "INFORMATION",
      goalType: "INFORMATION",
      startingPosition: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
      goalConfig: { keyPoints: ["Pawns move forwards."] },
      ...overrides,
    });
  }

  it("counts as read without any move", () => {
    expect(verifyLearningSolution(slideSpec(), {}).solved).toBe(true);
  });

  it("returns just the starting position when there is no example", () => {
    const timeline = buildDemoTimeline(slideSpec());
    expect(timeline.steps).toHaveLength(1);
    expect(timeline.error).toBeUndefined();
  });

  it("builds one position per demo move", () => {
    const timeline = buildDemoTimeline(slideSpec({ goalConfig: { demoMoves: ["e2e4", "e8e7"] } }));
    expect(timeline.error).toBeUndefined();
    expect(timeline.steps).toHaveLength(3);
    expect(timeline.steps[1].label).toBe("e4");
    expect(timeline.steps[2].from).toBe("e8");
  });

  it("reports a demo move that is not legal instead of stopping silently", () => {
    // Two white moves in a row: a slide is replayed as a real game.
    const timeline = buildDemoTimeline(slideSpec({ goalConfig: { demoMoves: ["e2e4", "e4e5"] } }));
    expect(timeline.error).toContain("e4e5");
    expect(timeline.steps).toHaveLength(2);
  });

  it("replays a movement-trainer demo with no turn order at all", () => {
    const timeline = buildDemoTimeline(
      movementSpec({
        interactionMode: "INFORMATION",
        goalType: "INFORMATION",
        startingPosition: "8/8/8/8/8/8/8/1N6 w - - 0 1",
        goalConfig: { demoMoves: ["b1c3", "c3d5"] },
      })
    );
    expect(timeline.error).toBeUndefined();
    expect(timeline.steps).toHaveLength(3);
    expect(timeline.steps[2].label).toBe("c3-d5");
  });

  it("refuses to move a piece illegally even in a demo", () => {
    const timeline = buildDemoTimeline(
      movementSpec({
        interactionMode: "INFORMATION",
        goalType: "INFORMATION",
        startingPosition: "8/8/8/8/8/8/8/1N6 w - - 0 1",
        goalConfig: { demoMoves: ["b1b5"] },
      })
    );
    expect(timeline.error).toContain("cannot move to b5");
  });
});

describe("server-side verification", () => {
  it("does not award a completion for an empty or bogus move list", () => {
    const spec = legalSpec({ goalConfig: { targetSquare: "d5" } });
    expect(verifyLearningSolution(spec, { moves: [] }).solved).toBe(false);
    expect(verifyLearningSolution(spec, { moves: ["e1e2"] }).solved).toBe(false);
    expect(verifyLearningSolution(spec, { moves: ["not-a-move"] }).solved).toBe(false);
    expect(verifyLearningSolution(spec, { moves: ["e4d5"] }).solved).toBe(true);
  });

  it("does not award a completion for the wrong multiple-choice answer", () => {
    const spec = legalSpec({
      rulesMode: "QUESTION",
      interactionMode: "MULTIPLE_CHOICE",
      goalConfig: { options: ["Queen", "Rook"], correctOption: "Queen" },
    });
    expect(verifyLearningSolution(spec, { choice: "Rook" }).solved).toBe(false);
    expect(verifyLearningSolution(spec, { choice: "Queen" }).solved).toBe(true);
  });
});
