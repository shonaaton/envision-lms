import { expect, test } from "@playwright/test";
import { decideChessAccess } from "../src/lib/chess/accessDecision";
import { createGameHash, normalizeTimeControl, parseGameFromPgn, splitPgnGames } from "../src/lib/chess/pgn";
import { ChessComProvider, LichessProvider } from "../src/lib/chess/providers";

const pgn = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abc123"]
[Date "2026.08.31"]
[UTCTime "14:12:00"]
[White "Arjun"]
[Black "Opponent42"]
[Result "1-0"]
[WhiteElo "1510"]
[BlackElo "1492"]
[WhiteRatingDiff "+8"]
[BlackRatingDiff "-7"]
[TimeControl "300+3"]
[ECO "C50"]
[Opening "Italian Game"]
[Termination "Normal"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;

test("parses PGN from the student's perspective", () => {
  const game = parseGameFromPgn(pgn, "arjun", "LICHESS");

  expect(game).toMatchObject({
    platform: "LICHESS",
    result: "win",
    studentColor: "white",
    opponentUsername: "Opponent42",
    studentRating: 1510,
    opponentRating: 1492,
    ratingChange: 8,
    timeControlCategory: "blitz",
    opening: "Italian Game",
    eco: "C50",
  });
});

test("rejects PGN that does not include the linked username", () => {
  expect(parseGameFromPgn(pgn, "another-student", "LICHESS")).toBeNull();
});

test("categorizes common online chess time controls", () => {
  expect(normalizeTimeControl("900+10")).toBe("rapid");
  expect(normalizeTimeControl("60+0")).toBe("bullet");
  expect(normalizeTimeControl("1800+0")).toBe("classical");
  expect(normalizeTimeControl("1/3")).toBe("correspondence");
  expect(normalizeTimeControl("-")).toBe("unknown");
});

test("generates stable duplicate hashes from core game identity", () => {
  const first = createGameHash({ pgn });
  const second = createGameHash({ pgn: pgn.replace("1. e4 e5", "  1. e4   e5") });
  const platformIdHash = createGameHash({ platform: "LICHESS", platformGameId: "abc123" });

  expect(first).toHaveLength(64);
  expect(first).toBe(second);
  expect(platformIdHash).toBe(createGameHash({ platform: "LICHESS", platformGameId: "abc123" }));
  expect(platformIdHash).not.toBe(first);
});

test("splits multi-game PGN streams", () => {
  expect(splitPgnGames(`${pgn}\n\n${pgn.replace("abc123", "def456")}`)).toHaveLength(2);
});

test("enforces student and teacher chess access decisions", () => {
  expect(decideChessAccess({ role: "student", userId: "s1", requestedStudentId: "s1" })).toEqual({ allowed: true, studentId: "s1", scope: "own" });
  expect(decideChessAccess({ role: "student", userId: "s1", requestedStudentId: "s2" })).toEqual({ allowed: false });
  expect(decideChessAccess({ role: "instructor", userId: "t1", requestedStudentId: "s2", assignedStudentIds: ["s2"] })).toEqual({ allowed: true, studentId: "s2", scope: "assigned" });
  expect(decideChessAccess({ role: "instructor", userId: "t1", requestedStudentId: "s3", assignedStudentIds: ["s2"] })).toEqual({ allowed: false });
});

test("enforces admin and sub-admin permission decisions", () => {
  expect(decideChessAccess({ role: "admin", userId: "a1", requestedStudentId: "s1", canViewAll: true })).toEqual({ allowed: true, studentId: "s1", scope: "all" });
  expect(decideChessAccess({ role: "sub-admin", userId: "sa1", requestedStudentId: "s1", canViewAll: true })).toEqual({ allowed: true, studentId: "s1", scope: "all" });
  expect(decideChessAccess({ role: "sub-admin", userId: "sa1", requestedStudentId: "s1", canViewAll: false })).toEqual({ allowed: false });
});

test("validates Chess.com usernames through provider response status", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (url: RequestInfo | URL) =>
    new Response(String(url).includes("valid-user") ? "{}" : "{}", {
      status: String(url).includes("valid-user") ? 200 : 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const provider = new ChessComProvider();
    await expect(provider.validateUsername("valid-user")).resolves.toBe(true);
    await expect(provider.validateUsername("missing-user")).resolves.toBe(false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("validates Lichess usernames through provider response status", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (url: RequestInfo | URL) =>
    new Response(String(url).includes("valid-user") ? "{}" : "{}", {
      status: String(url).includes("valid-user") ? 200 : 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const provider = new LichessProvider();
    await expect(provider.validateUsername("valid-user")).resolves.toBe(true);
    await expect(provider.validateUsername("missing-user")).resolves.toBe(false);
  } finally {
    global.fetch = originalFetch;
  }
});
