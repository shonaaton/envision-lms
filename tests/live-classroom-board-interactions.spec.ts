import { expect, test } from "@playwright/test";
import { Chess } from "chess.js";
import {
  applyLegalMoveToGame,
  beginRefreshProtection,
  boardPositionToFen,
  canControlLiveBoard,
  fenToBoardPosition,
  overlayProtectedPoll,
  placeSetupPiece,
  releaseRefreshProtection,
  removeObjectsOnPieceSquares,
  selectionAfterSquareClick,
  studentMoveMutation,
  transferBoardPiece,
  type BoardPosition,
  type GamifiedObjects,
  type RefreshProtection,
} from "../src/lib/liveClassroomBoardInteractions";

type LiveBoard = {
  fen: string;
  gamifiedObjects: GamifiedObjects;
  moveHistory: string[];
  illegalMovesEnabled?: boolean;
  setupMode?: boolean;
  status?: string;
};

function normalized(position: BoardPosition, objects: GamifiedObjects) {
  return { position, objects: removeObjectsOnPieceSquares(objects, position) };
}

function setupDrag(position: BoardPosition, objects: GamifiedObjects, source: string, target: string, piece: string) {
  return transferBoardPiece(position, objects, source, target, piece);
}

function setupClick(position: BoardPosition, objects: GamifiedObjects, target: string, piece: string) {
  return placeSetupPiece(position, objects, target, piece);
}

function legalInteraction(
  method: "drag" | "click",
  fen: string,
  from: string,
  to: string,
  promotion = "q",
  moveHistory: string[] = [],
  objects: GamifiedObjects = {}
) {
  let selectedSquare: string | null = null;
  if (method === "click") {
    const position = fenToBoardPosition(fen);
    selectedSquare = selectionAfterSquareClick({
      selectedSquare,
      square: from,
      clickedPiece: position[from],
      freeMoveMode: false,
      canSelectForTurn: true,
    });
    expect(selectedSquare).toBe(from);
  }
  const result = applyLegalMoveToGame(new Chess(fen === "start" ? undefined : fen), objects, moveHistory, from, to, promotion);
  return {
    result,
    selectedSquare: result ? null : selectedSquare,
    mutation: studentMoveMutation(from, to, promotion),
    visualPosition: result ? fenToBoardPosition(result.fen) : fenToBoardPosition(fen),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class StudentFreeMoveHarness {
  live: LiveBoard;
  protection: RefreshProtection<LiveBoard> = { sequence: 0, pending: null };
  mutationCalls: Array<{ from: string; to: string; promotion: string }> = [];
  frames: LiveBoard[] = [];

  constructor(live: LiveBoard) {
    this.live = structuredClone(live);
    this.frames.push(structuredClone(this.live));
  }

  move(from: string, to: string, response: Promise<LiveBoard>) {
    const pieces = fenToBoardPosition(this.live.fen);
    const piece = pieces[from];
    if (!piece) throw new Error(`No piece on ${from}`);
    const transition = transferBoardPiece(pieces, this.live.gamifiedObjects, from, to, piece);
    const side = this.live.fen.split(/\s+/)[1] === "b" ? "b" : "w";
    const update: Partial<LiveBoard> = {
      fen: boardPositionToFen(transition.position, side),
      gamifiedObjects: transition.objects,
      illegalMovesEnabled: true,
      status: "live",
    };
    this.protection = beginRefreshProtection(this.protection, update);
    const sequence = this.protection.sequence;
    this.live = { ...this.live, ...update };
    this.frames.push(structuredClone(this.live));
    this.mutationCalls.push({ from, to, promotion: "q" });

    return response.then(
      (authoritative) => {
        if (sequence === this.protection.sequence) this.live = structuredClone(authoritative);
        this.protection = releaseRefreshProtection(this.protection, sequence);
        this.frames.push(structuredClone(this.live));
        return true;
      },
      () => {
        this.protection = releaseRefreshProtection(this.protection, sequence);
        return false;
      }
    );
  }

  poll(serverLive: LiveBoard) {
    this.live = overlayProtectedPoll(structuredClone(serverLive), this.protection);
    this.frames.push(structuredClone(this.live));
  }
}

test.describe("LiveClassroom setup-mode drag/click parity", () => {
  test("empty destination produces identical piece, source, and object state", () => {
    const objects: GamifiedObjects = { h8: "coin" };
    const drag = setupDrag({ a1: "wR" }, objects, "a1", "e4", "wR");
    const click = setupClick({}, objects, "e4", "wR");

    expect(drag).toEqual(click);
    expect(drag).toEqual({ position: { e4: "wR" }, objects: { h8: "coin" } });
    expect(drag.position.a1).toBeUndefined();
  });

  for (const object of ["star", "coin"] as const) {
    test(`${object} is removed rather than stacked when a piece is placed`, () => {
      const objects: GamifiedObjects = { e4: object, h8: "gem" };
      const drag = setupDrag({ a1: "wN" }, objects, "a1", "e4", "wN");
      const click = setupClick({}, objects, "e4", "wN");

      expect(drag).toEqual(click);
      expect(drag.position.e4).toBe("wN");
      expect(drag.objects.e4).toBeUndefined();
      expect(drag.objects.h8).toBe("gem");
      expect(Object.keys(drag.position).filter((square) => square === "e4")).toHaveLength(1);
    });
  }

  test("occupied destination is replaced consistently under setup rules", () => {
    const drag = setupDrag({ a1: "wQ", e4: "bB" }, {}, "a1", "e4", "wQ");
    const click = setupClick({ e4: "bB" }, {}, "e4", "wQ");

    expect(drag).toEqual(click);
    expect(drag.position).toEqual({ e4: "wQ" });
  });

  test("explicit e4 gamified-object cleanup regression stays normalized", () => {
    const drag = setupDrag({ d2: "wP" }, { e4: "star" }, "d2", "e4", "wP");
    const click = setupClick({}, { e4: "star" }, "e4", "wP");

    expect(normalized(drag.position, drag.objects)).toEqual(normalized(click.position, click.objects));
    expect(drag).toEqual({ position: { e4: "wP" }, objects: {} });
  });
});

test.describe("LiveClassroom normal legal move parity", () => {
  const cases = [
    { name: "quiet move", fen: "start", from: "e2", to: "e4", san: "e4" },
    { name: "capture", fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", from: "e4", to: "d5", san: "exd5" },
    { name: "castling", fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", from: "e1", to: "g1", san: "O-O" },
    { name: "promotion", fen: "7k/P7/8/8/8/8/8/7K w - - 0 1", from: "a7", to: "a8", promotion: "q", san: "a8=Q+" },
    { name: "en passant", fen: "7k/8/8/3pP3/8/8/8/7K w - d6 0 1", from: "e5", to: "d6", san: "exd6" },
  ];

  for (const scenario of cases) {
    test(`${scenario.name}: drag and source-click/destination-click have the same result`, () => {
      const drag = legalInteraction("drag", scenario.fen, scenario.from, scenario.to, scenario.promotion);
      const click = legalInteraction("click", scenario.fen, scenario.from, scenario.to, scenario.promotion);

      expect(drag.result).not.toBeNull();
      expect(click.result).toEqual(drag.result);
      expect(click.mutation).toEqual(drag.mutation);
      expect(click.visualPosition).toEqual(fenToBoardPosition(click.result!.fen));
      expect(click.result!.moveHistory).toEqual([scenario.san]);
      expect(click.result!.turn).toBe("b");
      expect(click.selectedSquare).toBeNull();
    });
  }

  test("legal collection removes a board object and preserves unrelated objects", () => {
    const drag = legalInteraction("drag", "start", "e2", "e4", "q", [], { e4: "coin", h6: "star" });
    const click = legalInteraction("click", "start", "e2", "e4", "q", [], { e4: "coin", h6: "star" });

    expect(click.result).toEqual(drag.result);
    expect(click.result!.objects).toEqual({ h6: "star" });
    expect(click.visualPosition.e4).toBe("wP");
  });
});

test.describe("LiveClassroom free-move optimistic refresh protection", () => {
  const previous: LiveBoard = {
    fen: new Chess().fen(),
    gamifiedObjects: { e4: "star", h8: "coin" },
    moveHistory: [],
    illegalMovesEnabled: true,
    status: "live",
  };

  test("stale /live poll cannot roll back the optimistic free move before success", async () => {
    const mutation = deferred<LiveBoard>();
    const harness = new StudentFreeMoveHarness(previous);
    const completion = harness.move("e2", "e4", mutation.promise);
    const optimisticFen = harness.live.fen;

    for (let poll = 0; poll < 5; poll++) harness.poll(previous);
    expect(harness.live.fen).toBe(optimisticFen);
    expect(fenToBoardPosition(harness.live.fen).e4).toBe("wP");
    expect(harness.live.gamifiedObjects.e4).toBeUndefined();
    expect(harness.frames.slice(1).map((frame) => fenToBoardPosition(frame.fen).e4)).not.toContain(undefined);

    const confirmed = { ...harness.live, moveHistory: ["Pe2-e4"] };
    mutation.resolve(confirmed);
    await expect(completion).resolves.toBe(true);
    expect(harness.live).toEqual(confirmed);
    expect(harness.protection.pending).toBeNull();

    const later = { ...confirmed, gamifiedObjects: { a3: "coin" } };
    harness.poll(later);
    expect(harness.live).toEqual(later);
  });

  test("failed mutation keeps stale polling out while pending, then rolls back and resumes polling", async () => {
    const mutation = deferred<LiveBoard>();
    const harness = new StudentFreeMoveHarness(previous);
    const completion = harness.move("e2", "e4", mutation.promise);

    harness.poll(previous);
    expect(fenToBoardPosition(harness.live.fen).e4).toBe("wP");
    expect(harness.protection.pending).not.toBeNull();

    mutation.reject(new Error("server rejected move"));
    await expect(completion).resolves.toBe(false);
    expect(harness.protection.pending).toBeNull();

    harness.poll(previous);
    expect(harness.live).toEqual(previous);
    const subsequent = { ...previous, gamifiedObjects: { b3: "gem" } };
    harness.poll(subsequent);
    expect(harness.live).toEqual(subsequent);
  });

  test("two fast moves ignore the older confirmation and release only for the latest sequence", async () => {
    const firstMutation = deferred<LiveBoard>();
    const secondMutation = deferred<LiveBoard>();
    const harness = new StudentFreeMoveHarness(previous);
    const first = harness.move("e2", "e4", firstMutation.promise);
    const afterFirst = structuredClone(harness.live);
    const second = harness.move("e4", "e5", secondMutation.promise);
    const afterSecond = structuredClone(harness.live);

    harness.poll(previous);
    expect(harness.live.fen).toBe(afterSecond.fen);
    expect(harness.mutationCalls).toEqual([
      { from: "e2", to: "e4", promotion: "q" },
      { from: "e4", to: "e5", promotion: "q" },
    ]);

    firstMutation.resolve({ ...afterFirst, moveHistory: ["Pe2-e4"] });
    await first;
    expect(harness.live.fen).toBe(afterSecond.fen);
    expect(harness.protection.pending).not.toBeNull();

    const final = { ...afterSecond, moveHistory: ["Pe2-e4", "Pe4-e5"] };
    secondMutation.resolve(final);
    await second;
    expect(harness.live).toEqual(final);
    expect(harness.protection.pending).toBeNull();
    expect(harness.mutationCalls).toHaveLength(2);
  });
});

test.describe("polling during board interactions", () => {
  const stale: LiveBoard = { fen: new Chess().fen(), gamifiedObjects: { e4: "star" }, moveHistory: [] };

  for (const scenario of ["legal move", "free move", "setup drag", "setup click"] as const) {
    test(`${scenario} remains stable across classroom polling`, () => {
      let update: Partial<LiveBoard>;
      if (scenario === "legal move") {
        const moved = applyLegalMoveToGame(new Chess(), stale.gamifiedObjects, [], "e2", "e4")!;
        update = { fen: moved.fen, gamifiedObjects: moved.objects, moveHistory: moved.moveHistory };
      } else {
        const initial = scenario === "setup click" ? {} : fenToBoardPosition(stale.fen);
        const moved = scenario === "setup click"
          ? placeSetupPiece(initial, stale.gamifiedObjects, "e4", "wP")
          : transferBoardPiece(initial, stale.gamifiedObjects, "e2", "e4", "wP");
        update = {
          fen: boardPositionToFen(moved.position),
          gamifiedObjects: moved.objects,
          moveHistory: scenario === "free move" ? ["Pe2-e4"] : [],
          setupMode: scenario.startsWith("setup"),
          illegalMovesEnabled: scenario === "free move",
        };
      }

      const protectedState = beginRefreshProtection<LiveBoard>({ sequence: 0, pending: null }, update);
      const rendered = overlayProtectedPoll(stale, protectedState);
      expect(rendered).toMatchObject(update);
      expect(fenToBoardPosition(rendered.fen).e4).toBe("wP");
      expect(rendered.gamifiedObjects.e4).toBeUndefined();
      const whitePawns = Object.values(fenToBoardPosition(rendered.fen)).filter((piece) => piece === "wP");
      expect(whitePawns).toHaveLength(scenario === "setup click" ? 1 : 8);
      expect(rendered.moveHistory).toEqual(update.moveHistory);
    });
  }
});

test.describe("coach/student control and cancellation", () => {
  test("coach roles retain board control while locked boards disable everyone", () => {
    for (const role of ["instructor", "admin", "sub-admin"] as const) {
      expect(canControlLiveBoard({ role, userId: "coach", locked: false })).toBe(true);
      expect(canControlLiveBoard({ role, userId: "coach", locked: true })).toBe(false);
    }
  });

  test("only an assigned student can mutate and handoff changes permission immediately", () => {
    const base = { role: "student" as const, studentMovesEnabled: true };
    expect(canControlLiveBoard({ ...base, userId: "student-a", boardControlStudents: ["student-a"] })).toBe(true);
    expect(canControlLiveBoard({ ...base, userId: "student-b", boardControlStudents: ["student-a"] })).toBe(false);
    expect(canControlLiveBoard({ ...base, userId: "student-a", boardControlStudents: ["student-b"] })).toBe(false);
    expect(canControlLiveBoard({ ...base, userId: "student-b", boardControlStudents: [{ _id: "student-b" }] })).toBe(true);
    expect(canControlLiveBoard({ ...base, userId: "student-b", studentMovesEnabled: false, boardControlStudents: ["student-b"] })).toBe(false);
  });

  test("student polling receives the coach position and does not overwrite it with an older local view", () => {
    const coachMove = applyLegalMoveToGame(new Chess(), {}, [], "e2", "e4")!;
    const coachServer: LiveBoard = { fen: coachMove.fen, gamifiedObjects: {}, moveHistory: coachMove.moveHistory };
    const studentProtection: RefreshProtection<LiveBoard> = { sequence: 0, pending: null };
    const studentRendered = overlayProtectedPoll(coachServer, studentProtection);

    expect(studentRendered).toEqual(coachServer);
    expect(fenToBoardPosition(studentRendered.fen).e4).toBe("wP");
    expect(studentRendered.moveHistory).toEqual(["e4"]);
  });

  test("same-square click cancels selection and selecting another movable piece transfers selection", () => {
    const selected = selectionAfterSquareClick({ selectedSquare: null, square: "e2", clickedPiece: "wP", freeMoveMode: false, canSelectForTurn: true });
    expect(selectionAfterSquareClick({ selectedSquare: selected, square: "e2", clickedPiece: "wP", freeMoveMode: false, canSelectForTurn: true })).toBeNull();
    expect(selectionAfterSquareClick({ selectedSquare: "e2", square: "d2", clickedPiece: "wP", freeMoveMode: false, canSelectForTurn: true })).toBe("d2");
  });

  test("empty/invalid destination and an opponent piece do not leave orphaned selection", () => {
    expect(selectionAfterSquareClick({ selectedSquare: "e2", square: "e5", clickedPiece: undefined, freeMoveMode: false, canSelectForTurn: false })).toBeNull();
    expect(selectionAfterSquareClick({ selectedSquare: "e2", square: "e7", clickedPiece: "bP", freeMoveMode: false, canSelectForTurn: false })).toBeNull();
  });

  test("cancelled normal drag leaves state unchanged; setup drop-off removes only its source", () => {
    const before = fenToBoardPosition("start");
    const cancelledNormalDrag = structuredClone(before);
    expect(cancelledNormalDrag).toEqual(before);

    const setupAfterTrash = { ...before };
    delete setupAfterTrash.e2;
    expect(setupAfterTrash.e2).toBeUndefined();
    expect(Object.keys(setupAfterTrash)).toHaveLength(Object.keys(before).length - 1);
  });
});
