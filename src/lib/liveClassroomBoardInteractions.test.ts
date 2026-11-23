import { describe, expect, it } from "vitest";

import { Chess } from "chess.js";

import { extendLiveMoveLine, pollResponseAction, type LiveMoveLineState } from "./liveClassroomBoardInteractions";

const settled = {
  lastAppliedSentAt: 10,
  lastSaveSettledAt: 12,
  savesOutstanding: false,
  hasPendingLocalState: true,
  holdLocalState: false,
};

describe("pollResponseAction", () => {
  it("drops a response older than one already used", () => {
    expect(pollResponseAction({ ...settled, sentAt: 9 })).toBe("drop");
    expect(pollResponseAction({ ...settled, sentAt: 9, hasPendingLocalState: false })).toBe("drop");
  });

  it("applies a response as is when this tab has nothing pending", () => {
    expect(pollResponseAction({ ...settled, sentAt: 11, hasPendingLocalState: false })).toBe("apply");
  });

  it("keeps local changes on top of a response sent before the last save finished", () => {
    // The coach pressed an arrow, the save finished at tick 12, and this poll
    // left at tick 11 - it can still carry the move before.
    expect(pollResponseAction({ ...settled, sentAt: 11 })).toBe("overlay");
  });

  it("keeps local changes while a save is still in flight or waiting to be sent", () => {
    expect(pollResponseAction({ ...settled, sentAt: 13, savesOutstanding: true })).toBe("overlay");
  });

  it("keeps local changes while the caller holds them", () => {
    expect(pollResponseAction({ ...settled, sentAt: 13, holdLocalState: true })).toBe("overlay");
  });

  it("releases local changes once a response was sent after every save finished", () => {
    expect(pollResponseAction({ ...settled, sentAt: 13 })).toBe("apply_and_release");
  });

  it("walks a slow arrow sequence without ever going back", () => {
    // Ticks: poll A sent (1); arrow 1 saved (2); poll B sent (3); arrow 2 saved
    // (4); B returns; A returns last.
    let lastApplied = 0;
    const b = pollResponseAction({ sentAt: 3, lastAppliedSentAt: lastApplied, lastSaveSettledAt: 4, savesOutstanding: false, hasPendingLocalState: true, holdLocalState: false });
    expect(b).toBe("overlay");
    lastApplied = 3;
    const a = pollResponseAction({ sentAt: 1, lastAppliedSentAt: lastApplied, lastSaveSettledAt: 4, savesOutstanding: false, hasPendingLocalState: true, holdLocalState: false });
    expect(a).toBe("drop");
  });
});

// Mirrors applyMoves in LiveClassroom: replay from the start, stop at the first
// move that does not fit. A broken line made one step back land near the start.
function replay(startFen: string, moves: string[], count: number) {
  const chess = startFen ? new Chess(startFen) : new Chess();
  for (const move of moves.slice(0, count)) {
    try {
      chess.move(move);
    } catch {
      break;
    }
  }
  return chess.fen();
}

function emptyLine(): LiveMoveLineState {
  return { mainMoves: [], variations: [], activeVariationId: "", index: 0, navigationStartFen: "" };
}

describe("extendLiveMoveLine", () => {
  it("keeps coach and student moves in one line, so one step back is one move back", () => {
    // Coach resets the board, then coach (white) and student (black) alternate.
    const board = new Chess();
    let line = emptyLine();
    const fensAfter: string[] = [];
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]) {
      const before = board.fen();
      board.move(san);
      line = extendLiveMoveLine(line, san, before).state;
      fensAfter.push(board.fen());
    }
    expect(line.mainMoves).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]);
    expect(line.index).toBe(6);
    expect(replay(line.navigationStartFen, line.mainMoves, line.index - 1)).toBe(fensAfter[4]);
  });

  it("steps forward when the move is the one the line already expects", () => {
    const line = { ...emptyLine(), mainMoves: ["e4", "e5"], navigationStartFen: new Chess().fen() };
    const result = extendLiveMoveLine(line, "e4", new Chess().fen());
    expect(result.state.mainMoves).toEqual(["e4", "e5"]);
    expect(result.update.pgnMoveIndex).toBe(1);
    expect(result.update).not.toHaveProperty("pgnMoves");
  });

  it("branches a variation when a different move is played mid-line", () => {
    const line = { ...emptyLine(), mainMoves: ["e4", "e5", "Nf3"], index: 1, navigationStartFen: new Chess().fen() };
    const result = extendLiveMoveLine(line, "c5", "fen", () => "v1");
    expect(result.state.mainMoves).toEqual(["e4", "e5", "Nf3"]);
    expect(result.state.activeVariationId).toBe("v1");
    expect(result.state.variations[0]).toMatchObject({ id: "v1", branchAt: 1, moves: ["e4", "c5"] });
    expect(result.update.pgnMoveIndex).toBe(2);
  });

  it("records where a new line starts only once", () => {
    const first = extendLiveMoveLine(emptyLine(), "e4", "start-fen");
    expect(first.update.navigationStartFen).toBe("start-fen");
    const second = extendLiveMoveLine(first.state, "e5", "other-fen");
    expect(second.update).not.toHaveProperty("navigationStartFen");
  });
});
