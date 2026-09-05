import { describe, expect, it } from "vitest";
import { redactGameForViewer, redactTournamentForPlayer } from "./redact";

const tournament = {
  _id: "t1",
  name: "Friday Arena",
  type: "arena",
  status: "playing",
  standings: [{ playerKey: "user:a", points: 4 }],
  externalInvite: {
    enabled: true,
    accessMode: "password",
    token: "secret-token-abc",
    password: "hunter2",
    entryCode: "ENTRY-99",
  },
  adminActions: [{ action: "tournament.paused", note: "Paused for a fire drill" }],
  pairingLock: { token: "lock-1" },
  roundLock: { token: "lock-2" },
  chatMessages: [
    { senderName: "Ana", message: "good luck", hidden: false },
    { senderName: "Ben", message: "removed by arbiter", hidden: true },
  ],
};

describe("redactTournamentForPlayer", () => {
  it("hides the invite password from a player", () => {
    const result = redactTournamentForPlayer(tournament, false);
    expect(result.externalInvite.password).toBeUndefined();
  });

  it("hides the entry code and the invite token", () => {
    const result = redactTournamentForPlayer(tournament, false);
    expect(result.externalInvite.entryCode).toBeUndefined();
    expect(result.externalInvite.token).toBeUndefined();
  });

  it("still says that an external link exists and how it is gated", () => {
    const result = redactTournamentForPlayer(tournament, false);
    expect(result.externalInvite.enabled).toBe(true);
    expect(result.externalInvite.accessMode).toBe("password");
  });

  it("hides the arbiter audit trail", () => {
    expect(redactTournamentForPlayer(tournament, false).adminActions).toBeUndefined();
  });

  it("hides the internal pairing and round locks", () => {
    const result = redactTournamentForPlayer(tournament, false);
    expect(result.pairingLock).toBeUndefined();
    expect(result.roundLock).toBeUndefined();
  });

  it("drops chat messages an arbiter hid", () => {
    const result = redactTournamentForPlayer(tournament, false);
    expect(result.chatMessages).toHaveLength(1);
    expect(result.chatMessages[0].senderName).toBe("Ana");
  });

  it("keeps everything a player legitimately needs", () => {
    const result = redactTournamentForPlayer(tournament, false);
    expect(result.name).toBe("Friday Arena");
    expect(result.status).toBe("playing");
    expect(result.standings).toHaveLength(1);
  });

  it("gives an arbiter the document untouched", () => {
    expect(redactTournamentForPlayer(tournament, true)).toBe(tournament);
  });

  it("does not mutate the document it was given", () => {
    redactTournamentForPlayer(tournament, false);
    expect(tournament.externalInvite.password).toBe("hunter2");
    expect(tournament.adminActions).toHaveLength(1);
    expect(tournament.chatMessages).toHaveLength(2);
  });

  it("copes with a tournament that has no invite or chat", () => {
    const bare = { _id: "t2", name: "Bare" };
    expect(redactTournamentForPlayer(bare, false)).toEqual(bare);
  });

  it("passes through a missing tournament rather than throwing", () => {
    expect(redactTournamentForPlayer(null, false)).toBeNull();
  });

  it("leaks nothing when serialised, which is how it actually reaches a client", () => {
    // The real test: whatever the shape, none of these strings may appear in
    // the JSON that goes over the wire.
    const wire = JSON.stringify(redactTournamentForPlayer(tournament, false));
    expect(wire).not.toContain("hunter2");
    expect(wire).not.toContain("ENTRY-99");
    expect(wire).not.toContain("secret-token-abc");
    expect(wire).not.toContain("fire drill");
    expect(wire).not.toContain("removed by arbiter");
  });
});

describe("redactGameForViewer", () => {
  const game = {
    _id: "g1",
    fen: "start",
    whiteName: "Ana",
    blackName: "Ben",
    moveHistorySAN: ["e4"],
    whiteActiveTabId: "tab-aaa",
    blackActiveTabId: "tab-bbb",
    whiteActiveTabAt: new Date(0),
    blackActiveTabAt: new Date(0),
  };

  it("hides the browser session identifiers from a spectator", () => {
    const result = redactGameForViewer(game, false);
    expect(result.whiteActiveTabId).toBeUndefined();
    expect(result.blackActiveTabId).toBeUndefined();
    expect(result.whiteActiveTabAt).toBeUndefined();
  });

  it("keeps the chess, which is public in a tournament", () => {
    const result = redactGameForViewer(game, false);
    expect(result.fen).toBe("start");
    expect(result.moveHistorySAN).toEqual(["e4"]);
    expect(result.whiteName).toBe("Ana");
  });

  it("gives an arbiter the game untouched", () => {
    expect(redactGameForViewer(game, true)).toBe(game);
  });

  it("does not mutate the game it was given", () => {
    redactGameForViewer(game, false);
    expect(game.whiteActiveTabId).toBe("tab-aaa");
  });

  it("passes through a missing game", () => {
    expect(redactGameForViewer(null, false)).toBeNull();
  });
});
