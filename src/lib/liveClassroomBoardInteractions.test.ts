import { describe, expect, it } from "vitest";

import { pollResponseAction } from "./liveClassroomBoardInteractions";

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
