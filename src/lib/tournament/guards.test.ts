import { describe, expect, it } from "vitest";
import {
  acquirePairingLockGuard,
  berserkGuard,
  claimRoundGuard,
  finishGameGuard,
  matchesFilter,
  moveGuard,
  releasePairingLockGuard,
  releaseRoundGuard,
  type Filter,
} from "./guards";

/**
 * An in-memory stand-in for the one MongoDB operation the tournament's safety
 * rests on: `findOneAndUpdate(filter, update)` applied atomically.
 *
 * Races are produced by interleaving deliberately rather than by sleeping and
 * hoping. Every writer reads the document, yields, and only then tries to
 * commit — which is exactly the window a real race opens, and the window the
 * guards have to close.
 */
class ConditionalStore {
  private documents = new Map<string, any>();

  /**
   * A dotted key is a path into a nested object, as it is in MongoDB, not a
   * property whose name happens to contain a dot. The harness has to get this
   * right or it would be testing something the database does not do.
   */
  private static setPath(document: any, path: string, value: any) {
    const parts = path.split(".");
    let target = document;
    for (const part of parts.slice(0, -1)) {
      if (typeof target[part] !== "object" || target[part] === null) target[part] = {};
      target = target[part];
    }
    target[parts[parts.length - 1]] = value;
  }

  private static unsetPath(document: any, path: string) {
    const parts = path.split(".");
    let target = document;
    for (const part of parts.slice(0, -1)) {
      if (typeof target[part] !== "object" || target[part] === null) return;
      target = target[part];
    }
    delete target[parts[parts.length - 1]];
  }

  insert(id: string, document: any) {
    const next: any = { _id: id };
    for (const [key, value] of Object.entries(document)) ConditionalStore.setPath(next, key, value);
    this.documents.set(id, next);
  }

  read(id: string) {
    const document = this.documents.get(id);
    return document ? structuredClone(document) : null;
  }

  /** Atomic: match the filter and apply, or change nothing. Returns success. */
  findOneAndUpdate(id: string, filter: Filter, update: Record<string, any>) {
    const document = this.documents.get(id);
    if (!matchesFilter(document, filter)) return false;
    const next = structuredClone(document);
    for (const [key, value] of Object.entries(update.$set || {})) ConditionalStore.setPath(next, key, value);
    for (const key of Object.keys(update.$unset || {})) ConditionalStore.unsetPath(next, key);
    this.documents.set(id, next);
    return true;
  }
}

/** Run writers concurrently, each having read state before any of them commits. */
async function racing<T>(writers: Array<() => T>): Promise<T[]> {
  return Promise.all(
    writers.map(async (writer) => {
      // Yield so every writer has observed the pre-race state.
      await Promise.resolve();
      return writer();
    })
  );
}

describe("move guard", () => {
  function gameStore() {
    const store = new ConditionalStore();
    store.insert("g1", { status: "active", turn: "w", ply: 4, fen: "position-4" });
    return store;
  }

  it("lets exactly one of two identical concurrent moves through", async () => {
    const store = gameStore();
    const observed = store.read("g1");
    const results = await racing([
      () => store.findOneAndUpdate("g1", moveGuard("g1", observed.turn, observed.ply), { $set: { ply: 5, turn: "b", fen: "position-5" } }),
      () => store.findOneAndUpdate("g1", moveGuard("g1", observed.turn, observed.ply), { $set: { ply: 5, turn: "b", fen: "position-5" } }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.read("g1").ply).toBe(5);
  });

  it("rejects a double-tap however many times it is sent", async () => {
    const store = gameStore();
    const observed = store.read("g1");
    const results = await racing(
      Array.from({ length: 8 }, () => () =>
        store.findOneAndUpdate("g1", moveGuard("g1", observed.turn, observed.ply), { $set: { ply: 5, turn: "b" } })
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.read("g1").ply).toBe(5);
  });

  it("rejects a move sent from a stale position", () => {
    const store = gameStore();
    // The client still thinks it is ply 3; the game has moved on to 4.
    expect(store.findOneAndUpdate("g1", moveGuard("g1", "w", 3), { $set: { ply: 4 } })).toBe(false);
  });

  it("rejects a move for the wrong side even at the right ply", () => {
    const store = gameStore();
    expect(store.findOneAndUpdate("g1", moveGuard("g1", "b", 4), { $set: { ply: 5 } })).toBe(false);
  });

  it("rejects a move once the game has finished", () => {
    const store = new ConditionalStore();
    store.insert("g1", { status: "completed", turn: "w", ply: 4 });
    expect(store.findOneAndUpdate("g1", moveGuard("g1", "w", 4), { $set: { ply: 5 } })).toBe(false);
  });

  it("accepts the first move of a game created before ply existed", () => {
    const store = new ConditionalStore();
    store.insert("legacy", { status: "active", turn: "w" });
    expect(store.findOneAndUpdate("legacy", moveGuard("legacy", "w", 0), { $set: { ply: 1 } })).toBe(true);
  });

  it("guards that legacy game normally from its second move on", async () => {
    const store = new ConditionalStore();
    store.insert("legacy", { status: "active", turn: "b", ply: 1 });
    const results = await racing([
      () => store.findOneAndUpdate("legacy", moveGuard("legacy", "b", 1), { $set: { ply: 2 } }),
      () => store.findOneAndUpdate("legacy", moveGuard("legacy", "b", 1), { $set: { ply: 2 } }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("lets a sequence of legitimate moves through one after another", () => {
    const store = gameStore();
    expect(store.findOneAndUpdate("g1", moveGuard("g1", "w", 4), { $set: { ply: 5, turn: "b" } })).toBe(true);
    expect(store.findOneAndUpdate("g1", moveGuard("g1", "b", 5), { $set: { ply: 6, turn: "w" } })).toBe(true);
    expect(store.read("g1").ply).toBe(6);
  });
});

describe("finishing a game once", () => {
  it("records only one result when a resignation and a flag-fall race", async () => {
    const store = new ConditionalStore();
    store.insert("g1", { status: "active" });
    const results = await racing([
      () => store.findOneAndUpdate("g1", finishGameGuard("g1"), { $set: { status: "completed", result: "0-1", termination: "resign" } }),
      () => store.findOneAndUpdate("g1", finishGameGuard("g1"), { $set: { status: "completed", result: "1-0", termination: "timeout" } }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.read("g1").status).toBe("completed");
  });

  it("stops the timeout worker re-finishing a game that just ended", () => {
    const store = new ConditionalStore();
    store.insert("g1", { status: "completed", result: "1-0" });
    expect(store.findOneAndUpdate("g1", finishGameGuard("g1"), { $set: { result: "0-1" } })).toBe(false);
    expect(store.read("g1").result).toBe("1-0");
  });

  it("does not let an abort overwrite a real result", () => {
    const store = new ConditionalStore();
    store.insert("g1", { status: "completed", result: "1-0" });
    expect(store.findOneAndUpdate("g1", finishGameGuard("g1"), { $set: { status: "aborted", result: "*" } })).toBe(false);
  });
});

describe("berserk", () => {
  it("applies once when a player taps twice", async () => {
    const store = new ConditionalStore();
    store.insert("g1", { status: "active", berserkWhite: false, whiteClockMs: 180000 });
    const results = await racing([
      () => store.findOneAndUpdate("g1", berserkGuard("g1", "white"), { $set: { berserkWhite: true, whiteClockMs: 90000 } }),
      () => store.findOneAndUpdate("g1", berserkGuard("g1", "white"), { $set: { berserkWhite: true, whiteClockMs: 45000 } }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    // The clock was halved once, not twice.
    expect(store.read("g1").whiteClockMs).toBe(90000);
  });

  it("lets both sides berserk independently", () => {
    const store = new ConditionalStore();
    store.insert("g1", { status: "active", berserkWhite: false, berserkBlack: false });
    expect(store.findOneAndUpdate("g1", berserkGuard("g1", "white"), { $set: { berserkWhite: true } })).toBe(true);
    expect(store.findOneAndUpdate("g1", berserkGuard("g1", "black"), { $set: { berserkBlack: true } })).toBe(true);
  });
});

describe("arena pairing lock", () => {
  const now = new Date(1_700_000_000_000);

  it("admits one of several simultaneous pairing passes", async () => {
    const store = new ConditionalStore();
    store.insert("t1", { type: "arena" });
    const results = await racing(
      ["a", "b", "c", "d"].map((token) => () =>
        store.findOneAndUpdate("t1", acquirePairingLockGuard("t1", now), {
          $set: { "pairingLock.token": token, "pairingLock.expiresAt": new Date(now.getTime() + 20_000) },
        })
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("hands the lock on once the holder's claim expires", () => {
    const store = new ConditionalStore();
    store.insert("t1", { "pairingLock.token": "stale", "pairingLock.expiresAt": new Date(now.getTime() - 1000) });
    expect(store.findOneAndUpdate("t1", acquirePairingLockGuard("t1", now), { $set: { "pairingLock.token": "fresh" } })).toBe(true);
  });

  it("refuses a second holder while the claim is live", () => {
    const store = new ConditionalStore();
    store.insert("t1", { "pairingLock.token": "held", "pairingLock.expiresAt": new Date(now.getTime() + 10_000) });
    expect(store.findOneAndUpdate("t1", acquirePairingLockGuard("t1", now), { $set: { "pairingLock.token": "other" } })).toBe(false);
  });

  it("lets only the holder release the lock", () => {
    const store = new ConditionalStore();
    store.insert("t1", { "pairingLock.token": "mine", "pairingLock.expiresAt": new Date(now.getTime() + 10_000) });
    // A pass that timed out and lost its claim cannot free the new holder's.
    expect(store.findOneAndUpdate("t1", releasePairingLockGuard("t1", "someone-else"), { $unset: { pairingLock: 1 } })).toBe(false);
    expect(store.findOneAndUpdate("t1", releasePairingLockGuard("t1", "mine"), { $unset: { pairingLock: 1 } })).toBe(true);
  });

  it("frees the lock for the next pass after release", () => {
    const store = new ConditionalStore();
    store.insert("t1", {});
    store.findOneAndUpdate("t1", acquirePairingLockGuard("t1", now), {
      $set: { "pairingLock.token": "first", "pairingLock.expiresAt": new Date(now.getTime() + 20_000) },
    });
    store.findOneAndUpdate("t1", releasePairingLockGuard("t1", "first"), { $unset: { "pairingLock.token": 1, "pairingLock.expiresAt": 1 } });
    expect(store.findOneAndUpdate("t1", acquirePairingLockGuard("t1", now), { $set: { "pairingLock.token": "second" } })).toBe(true);
  });
});

describe("swiss round claim", () => {
  const now = new Date(1_700_000_000_000);

  it("generates round 4 once when four callers race for it", async () => {
    // The tick, a finished move, a finished result and an admin all arrive at
    // the same moment: exactly the case that produced duplicate rounds before.
    const store = new ConditionalStore();
    store.insert("t1", { currentRound: 3 });
    const results = await racing(
      ["tick", "move", "result", "admin"].map((token) => () =>
        store.findOneAndUpdate("t1", claimRoundGuard("t1", 3, now), {
          $set: { "roundLock.token": token, "roundLock.expiresAt": new Date(now.getTime() + 30_000), currentRound: 4 },
        })
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.read("t1").currentRound).toBe(4);
  });

  it("refuses a claim for a round that has already been generated", () => {
    const store = new ConditionalStore();
    store.insert("t1", { currentRound: 4 });
    expect(store.findOneAndUpdate("t1", claimRoundGuard("t1", 3, now), { $set: { currentRound: 4 } })).toBe(false);
  });

  it("refuses a claim while another generator holds the lock", () => {
    const store = new ConditionalStore();
    store.insert("t1", { currentRound: 3, "roundLock.token": "busy", "roundLock.expiresAt": new Date(now.getTime() + 30_000) });
    expect(store.findOneAndUpdate("t1", claimRoundGuard("t1", 3, now), { $set: { currentRound: 4 } })).toBe(false);
  });

  it("recovers if a generator dies holding the lock", () => {
    const store = new ConditionalStore();
    store.insert("t1", { currentRound: 3, "roundLock.token": "crashed", "roundLock.expiresAt": new Date(now.getTime() - 1) });
    expect(store.findOneAndUpdate("t1", claimRoundGuard("t1", 3, now), { $set: { currentRound: 4 } })).toBe(true);
  });

  it("lets only the claimant release the round lock", () => {
    const store = new ConditionalStore();
    store.insert("t1", { currentRound: 4, "roundLock.token": "mine" });
    expect(store.findOneAndUpdate("t1", releaseRoundGuard("t1", "other"), { $unset: { roundLock: 1 } })).toBe(false);
    expect(store.findOneAndUpdate("t1", releaseRoundGuard("t1", "mine"), { $unset: { roundLock: 1 } })).toBe(true);
  });

  it("advances round by round under sustained contention", async () => {
    // Five rounds, four racing callers each time: five rounds, not twenty.
    const store = new ConditionalStore();
    store.insert("t1", { currentRound: 0 });
    for (let round = 1; round <= 5; round += 1) {
      const results = await racing(
        Array.from({ length: 4 }, () => () =>
          store.findOneAndUpdate("t1", claimRoundGuard("t1", round - 1, now), { $set: { currentRound: round } })
        )
      );
      expect(results.filter(Boolean), `round ${round}`).toHaveLength(1);
    }
    expect(store.read("t1").currentRound).toBe(5);
  });
});

describe("matchesFilter", () => {
  it("treats a missing document as no match", () => {
    expect(matchesFilter(null, { _id: "x" })).toBe(false);
  });

  it("reads nested paths the way Mongo does", () => {
    expect(matchesFilter({ pairingLock: { token: "a" } }, { "pairingLock.token": "a" })).toBe(true);
    expect(matchesFilter({ pairingLock: { token: "a" } }, { "pairingLock.token": "b" })).toBe(false);
  });

  it("handles a missing nested path without throwing", () => {
    expect(matchesFilter({}, { "pairingLock.token": "a" })).toBe(false);
    expect(matchesFilter({}, { "pairingLock.expiresAt": { $exists: false } })).toBe(true);
  });

  it("requires every branch of an $or to be considered", () => {
    expect(matchesFilter({ ply: 3 }, { $or: [{ ply: 3 }, { ply: { $exists: false } }] })).toBe(true);
    expect(matchesFilter({ ply: 3 }, { $or: [{ ply: 4 }, { ply: 5 }] })).toBe(false);
  });

  it("compares dates for $lte rather than strings", () => {
    const now = new Date(2000);
    expect(matchesFilter({ at: new Date(1000) }, { at: { $lte: now } })).toBe(true);
    expect(matchesFilter({ at: new Date(3000) }, { at: { $lte: now } })).toBe(false);
  });

  it("requires all top-level conditions to hold", () => {
    expect(matchesFilter({ status: "active", turn: "w" }, { status: "active", turn: "w" })).toBe(true);
    expect(matchesFilter({ status: "active", turn: "b" }, { status: "active", turn: "w" })).toBe(false);
  });
});
