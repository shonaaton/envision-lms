import { beforeEach, describe, expect, it, vi } from "vitest";
import { joinExternalTournament } from "@/app/tournament-join/[token]/actions";
import { applyGameMove, startTournament } from "@/lib/tournamentEngine";
import { GET as getTournamentState } from "@/app/api/tournaments/[id]/state/route";

const mocks = vi.hoisted(() => ({
  findTournament: vi.fn(),
  updateTournament: vi.fn(),
  findGame: vi.fn(),
  findGames: vi.fn(),
  createGame: vi.fn(),
  updateGame: vi.fn(),
  setCookie: vi.fn(),
  guestUsername: "",
  auth: vi.fn(),
  notifyAdmins: vi.fn(),
}));

vi.mock("@/models/Tournament", () => ({
  Tournament: { findOne: mocks.findTournament, findById: mocks.findTournament, updateOne: mocks.updateTournament },
}));
vi.mock("@/models/TournamentGame", () => ({
  TournamentGame: {
    findOne: mocks.findGame,
    find: mocks.findGames,
    create: mocks.createGame,
    findOneAndUpdate: mocks.updateGame,
    updateOne: vi.fn(),
  },
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/studentAccess", () => ({ isCurrentStudent: vi.fn() }));
vi.mock("@/lib/humanVerification", () => ({ isTurnstileEnabled: () => false }));
vi.mock("@/lib/tournamentNotifications", () => ({
  notifyAdmins: mocks.notifyAdmins,
  notifyExternalTournamentParticipant: vi.fn(),
  notifyExternalTournamentParticipants: vi.fn(),
  notifyTournamentUsers: vi.fn(),
}));
vi.mock("@/lib/tournamentGuests", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tournamentGuests")>(),
  getTournamentGuestUsername: () => mocks.guestUsername,
  setTournamentGuestUsername: mocks.setCookie,
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: () => new Headers({ "x-real-ip": "test-guest" }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));

const tournamentId = "507f1f77bcf86cd799439011";
const registrationKey = "3a8e6875-8289-4a57-9db3-acbc4e6d9f45";

function invite(overrides: Record<string, unknown> = {}) {
  return {
    _id: tournamentId,
    __v: 0,
    name: "Practice tournament",
    status: "registration_open",
    startAt: new Date("2026-11-12T14:30:00Z"),
    timeControlMinutes: 10,
    incrementSeconds: 0,
    type: "swiss",
    externalInvite: { accessMode: "public", token: "event" },
    externalParticipants: [],
    ...overrides,
  };
}

function lean(value: unknown) {
  const query = { select: () => query, lean: async () => value };
  return query;
}

function form(overrides: Record<string, string> = {}) {
  const input = new FormData();
  for (const [key, value] of Object.entries({ token: "event", username: "GuestOne", pin: "375282", registrationKey, ...overrides })) {
    input.set(key, value);
  }
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guestUsername = "";
  mocks.setCookie.mockReturnValue(true);
});

describe("external registration", () => {
  it("does not create a second profile for an already registered browser", async () => {
    mocks.guestUsername = "GUESTONE";
    mocks.findTournament.mockReturnValue(lean(invite({ externalParticipants: [{ username: "GuestOne" }] })));
    await expect(joinExternalTournament(form({ username: "GuestTwo" }))).rejects.toThrow("/tournament-join/event/play");
    expect(mocks.updateTournament).not.toHaveBeenCalled();
  });

  it("rechecks uniqueness after losing a concurrent registration write", async () => {
    mocks.findTournament
      .mockReturnValueOnce(lean(invite()))
      .mockReturnValueOnce(lean(invite({ __v: 1, externalParticipants: [{ username: "GuestTwo", email: "guest@example.com" }] })));
    mocks.updateTournament.mockResolvedValue({ modifiedCount: 0 });

    await expect(joinExternalTournament(form({ email: "GUEST@example.com" }))).rejects.toThrow("error=email_registered");
    expect(mocks.updateTournament).toHaveBeenCalledTimes(1);
    expect(mocks.updateTournament.mock.calls[0][0]).toMatchObject({ __v: 0, status: "registration_open" });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("blocks new late entries but lets a previously registered guest recover their seat", async () => {
    mocks.findTournament.mockReturnValue(lean(invite({
      status: "playing",
      lateJoiningAllowed: false,
      externalParticipants: [{ username: "GuestOne" }],
    })));
    await expect(joinExternalTournament(form({ username: "GuestTwo" }))).rejects.toThrow("error=late_join");
    await expect(joinExternalTournament(form({ username: "guestone" }))).rejects.toThrow("/tournament-join/event/play");
    expect(mocks.setCookie).toHaveBeenCalledWith(undefined, "event", "GuestOne");
    expect(mocks.updateTournament).not.toHaveBeenCalled();
  });

  it("requires the original PIN for cross-device recovery of a new guest profile", async () => {
    mocks.findTournament.mockReturnValue(lean(invite({ type: "arena", status: "playing" })));
    mocks.updateTournament.mockResolvedValue({ modifiedCount: 1 });
    await expect(joinExternalTournament(form())).rejects.toThrow("/tournament-join/event/play");
    const write = mocks.updateTournament.mock.calls[0][1].$push;
    expect(write.participantStates).toMatchObject({ playerKey: "external:guestone", status: "queued" });
    expect(write.externalParticipants.pinHash).not.toBe("375282");
    expect(write.externalParticipants.pinHash).toBeTruthy();

    mocks.findTournament.mockReturnValue(lean(invite({ externalParticipants: [write.externalParticipants] })));
    mocks.setCookie.mockClear();
    await expect(joinExternalTournament(form({ pin: "000000" }))).rejects.toThrow("error=pin_mismatch");
    expect(mocks.setCookie).not.toHaveBeenCalled();
    await expect(joinExternalTournament(form({ username: "GUESTONE" }))).rejects.toThrow("/tournament-join/event/play");
    expect(mocks.setCookie).toHaveBeenCalledWith(undefined, "event", "GuestOne");
    expect(mocks.updateTournament).toHaveBeenCalledTimes(1);
  });
});

describe.each(["swiss", "arena"])("%s guest games", (type) => {
  it("creates one board for two distinct players and accepts its first move", async () => {
    const tournament = invite({
      type,
      rounds: 1,
      arenaDurationMinutes: 20,
      externalParticipants: [{ username: "GuestOne" }, { username: "GUESTONE" }, { username: "GuestTwo" }],
      save: vi.fn(),
    });
    mocks.findTournament.mockResolvedValue(tournament);
    mocks.findGames.mockReturnValue(lean([]));
    mocks.updateTournament.mockResolvedValue({ modifiedCount: 1 });
    mocks.createGame.mockImplementation(async (data) => ({
      ...data,
      _id: "board-1",
      moveHistorySAN: [],
      moveHistoryUCI: [],
    }));

    await startTournament(tournament);
    expect(mocks.createGame).toHaveBeenCalledTimes(1);
    const [board] = mocks.createGame.mock.calls[0];
    expect(board).toMatchObject({ source: type, status: "active", ply: 0, turn: "w" });
    expect(new Set([board.whiteKey, board.blackKey])).toEqual(new Set(["external:guestone", "external:guesttwo"]));
    const game = await mocks.createGame.mock.results[0].value;
    mocks.updateGame.mockImplementation(async (_, update) => ({ ...game, ...update.$set }));

    const played = await applyGameMove(game, { from: "e2", to: "e4" }, { expectedPly: 0 });
    expect(played).toMatchObject({ status: "active", turn: "b", ply: 1, moveHistorySAN: ["e4"] });
    expect(played.firstMoveDeadlineAt.getTime()).toBeGreaterThan(Date.now());
  });


  it("returns the guest's board by player key when the socket event was missed", async () => {
    mocks.guestUsername = "GUESTONE";
    mocks.findTournament.mockReturnValue(lean(invite({
      type,
      status: "playing",
      currentRound: type === "swiss" ? 1 : 0,
      externalParticipants: [{ username: "GuestOne" }],
    })));
    mocks.auth.mockResolvedValue({ user: { id: "student-with-an-lms-session", role: "student" } });
    const request = new Request(`https://example.test/api/tournaments/${tournamentId}/state?guest=1&poll=1`);

    mocks.findGame.mockReturnValueOnce(lean(null)).mockReturnValueOnce(lean({ _id: "board-1", ply: 0 }));
    const waiting = await getTournamentState(request, { params: { id: tournamentId } });
    expect(await waiting.json()).toMatchObject({ status: "playing", gameId: "" });
    const assigned = await getTournamentState(request, { params: { id: tournamentId } });
    expect(await assigned.json()).toMatchObject({ status: "playing", gameId: "board-1", gamePly: 0 });
    expect(mocks.findGame).toHaveBeenLastCalledWith({
      tournament: tournamentId,
      status: "active",
      $or: [{ whiteKey: "external:guestone" }, { blackKey: "external:guestone" }],
    }, "_id ply");
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
