import { beforeEach, describe, expect, it } from "vitest";
import {
  PRESENCE_GRACE_MS,
  forgetTournamentPresence,
  isPlayerPresent,
  playerSeen,
  playerSocketClosed,
  playerSocketOpened,
  presentPlayerKeys,
} from "./presence";

const T = "t1";

beforeEach(() => forgetTournamentPresence(T));

describe("tournament presence", () => {
  it("nobody is present until they open the room", () => {
    expect(isPlayerPresent(T, "external:ana")).toBe(false);
    expect(presentPlayerKeys(T).size).toBe(0);
  });

  it("an open socket keeps a player present however long it stays open", () => {
    playerSocketOpened(T, "external:ana", 0);
    expect(isPlayerPresent(T, "external:ana", 10 * 60_000)).toBe(true);
  });

  it("two tabs: closing one keeps the player present", () => {
    playerSocketOpened(T, "user:1", 0);
    playerSocketOpened(T, "user:1", 0);
    playerSocketClosed(T, "user:1", 1_000);
    expect(isPlayerPresent(T, "user:1", 5 * 60_000)).toBe(true);
  });

  it("closing the last socket leaves a short grace for a page change or reconnect, then they are gone", () => {
    playerSocketOpened(T, "user:1", 0);
    playerSocketClosed(T, "user:1", 1_000);
    expect(isPlayerPresent(T, "user:1", 1_000 + PRESENCE_GRACE_MS)).toBe(true);
    expect(isPlayerPresent(T, "user:1", 1_001 + PRESENCE_GRACE_MS)).toBe(false);
  });

  it("an HTTP poll counts when the socket cannot connect", () => {
    playerSeen(T, "external:ben", 0);
    expect(presentPlayerKeys(T, 20_000).has("external:ben")).toBe(true);
    expect(presentPlayerKeys(T, PRESENCE_GRACE_MS + 1).has("external:ben")).toBe(false);
  });

  it("rooms are separate per tournament", () => {
    playerSocketOpened(T, "user:1", 0);
    expect(isPlayerPresent("t2", "user:1", 0)).toBe(false);
  });
});
