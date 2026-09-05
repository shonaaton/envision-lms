import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import "@/models/User";
import { estimateClock, isPlayingStatus, playerKeyForExternal, playerKeyForUser } from "@/lib/tournamentEngine";
import { canBerserkTimeControl, resolveTimeControl } from "@/lib/tournament/timeControl";
import { tieBreakFor } from "@/lib/tournament/scoring";
import { redactTournamentForPlayer } from "@/lib/tournament/redact";
import { maxRoundsWithoutRepeat } from "@/lib/tournament/swiss";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";
import { consumeTournamentRate, rateIdentity, rateLimitedResponse } from "@/lib/tournamentRateLimit";

/**
 * Tournament state: a read.
 *
 * This endpoint used to run the entire tournament lifecycle — starting events,
 * creating pairings, enforcing timeouts, advancing rounds, sending
 * notifications — which meant a tournament only progressed while somebody had a
 * page open, and one move made every connected client re-run all of it.
 *
 * All of that now lives in `tournamentLifecycle` behind the scheduled worker.
 * Nothing here writes.
 */

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** Only the fields a lobby needs. Move histories are never sent in bulk. */
const GAME_LIST_FIELDS =
  "tournament source roundNumber tableNumber whiteKey blackKey whiteName blackName whiteUser blackUser whiteExternalUsername blackExternalUsername status result termination winnerKey ply createdAt endedAt";

const ACTIVE_GAME_FIELDS = `${GAME_LIST_FIELDS} fen startFen moveHistorySAN moveHistoryUCI turn whiteClockMs blackClockMs whiteIncrementMs blackIncrementMs initialClockMs incrementMs lastMoveAt startedAt firstMoveDeadlineAt drawOfferBy berserkWhite berserkBlack whiteRating blackRating`;

function withLiveClocks(game: any) {
  if (!game) return null;
  const clocks = estimateClock(game);
  return {
    ...game,
    // Derived from the authoritative baseline so the client can tick locally
    // without ever inventing a clock value of its own.
    liveWhiteClockMs: clocks.whiteClockMs,
    liveBlackClockMs: clocks.blackClockMs,
    serverNow: Date.now(),
  };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();

  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).populate("participants", "name username rating").lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const guestJoined = guestUsername
    ? (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === guestUsername.toLowerCase())
    : false;

  const role = session ? (session.user as any).role : "";
  const userId = session ? (session.user as any).id : "";

  const limit = consumeTournamentRate("state", rateIdentity({ userId: String(userId || ""), guestUsername, request }));
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  if (role === "student" && !(await isCurrentStudent(String(userId)))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }

  const isGuest = guestJoined && !session;
  const myPlayerKey = isGuest ? playerKeyForExternal(guestUsername) : playerKeyForUser(String(userId));
  const allowed =
    guestJoined ||
    (session &&
      (role === "admin" ||
        role === "instructor" ||
        tournament.access?.allActiveStudents ||
        (tournament.access?.users || []).map((id: any) => String(id)).includes(String(userId)) ||
        (tournament.participants || []).some((player: any) => objectId(player) === String(userId))));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [activeGameRaw, recentGames, myGamesRaw, liveGames, gameCounts] = await Promise.all([
    TournamentGame.findOne(
      {
        tournament: params.id,
        status: "active",
        ...(isGuest
          ? { $or: [{ whiteExternalUsername: guestUsername }, { blackExternalUsername: guestUsername }] }
          : { $or: [{ whiteUser: userId }, { blackUser: userId }] }),
      },
      ACTIVE_GAME_FIELDS
    ).lean(),
    TournamentGame.find({ tournament: params.id }, GAME_LIST_FIELDS).sort({ createdAt: -1 }).limit(25).lean(),
    TournamentGame.find(
      {
        tournament: params.id,
        ...(isGuest
          ? { $or: [{ whiteExternalUsername: guestUsername }, { blackExternalUsername: guestUsername }] }
          : { $or: [{ whiteUser: userId }, { blackUser: userId }] }),
      },
      GAME_LIST_FIELDS
    )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    TournamentGame.find({ tournament: params.id, status: "active" }, GAME_LIST_FIELDS).sort({ tableNumber: 1 }).limit(24).lean(),
    TournamentGame.aggregate([
      { $match: { tournament: new mongoose.Types.ObjectId(String(params.id)) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const countsByStatus = Object.fromEntries((gameCounts as any[]).map((row) => [row._id, row.count]));
  const activeGame = withLiveClocks(activeGameRaw);
  const joined = guestJoined || (tournament.participants || []).some((player: any) => objectId(player) === String(userId));
  const liveRound = (tournament.roundsData || []).find((round: any) => round.status !== "completed") || null;
  const seatFromRound = liveRound?.pairings?.find((p: any) => p.whiteKey === myPlayerKey || p.blackKey === myPlayerKey) || null;
  const fallbackGame = myGamesRaw[0] || null;
  const participantState = (tournament.participantStates || []).find((entry: any) => entry.playerKey === myPlayerKey) || null;

  const roundProgress = liveRound
    ? {
        roundNumber: Number(liveRound.roundNumber || 0),
        total: (liveRound.pairings || []).length,
        completed: (liveRound.pairings || []).filter((p: any) => ["completed", "aborted"].includes(p.status)).length,
        pairings: (liveRound.pairings || []).map((p: any) => ({
          gameId: String(p.gameId || ""),
          tableNumber: p.tableNumber,
          whiteName: p.whiteName,
          blackName: p.blackName,
          status: p.status,
          result: p.result,
        })),
      }
    : null;

  const lastCompletedRound = (tournament.roundsData || [])
    .filter((round: any) => round.status === "completed")
    .sort((a: any, b: any) => Number(b.roundNumber || 0) - Number(a.roundNumber || 0))[0] || null;
  const breakMs = Math.max(0, Number(tournament.breakBetweenRoundsMinutes || 0)) * 60 * 1000;
  const nextRoundAt =
    tournament.type === "swiss" && !liveRound && lastCompletedRound?.endedAt && Number(tournament.currentRound || 0) < Number(tournament.rounds || 0)
      ? new Date(lastCompletedRound.endedAt).getTime() + breakMs
      : null;

  const seatFor = (game: any, status: string) => ({
    roundNumber: Number(game.roundNumber || tournament.currentRound || 0),
    boardNumber: Number(game.tableNumber || 0),
    gameId: String(game._id),
    color: isGuest
      ? String(game.whiteExternalUsername || "").toLowerCase() === guestUsername.toLowerCase()
        ? "white"
        : "black"
      : String(game.whiteUser || "") === String(userId)
        ? "white"
        : "black",
    opponentName: isGuest
      ? String(game.whiteExternalUsername || "").toLowerCase() === guestUsername.toLowerCase()
        ? game.blackName || "Bye"
        : game.whiteName
      : String(game.whiteUser || "") === String(userId)
        ? game.blackName || "Bye"
        : game.whiteName,
    status,
    result: game.result || "*",
  });

  const currentSeat = activeGame
    ? seatFor(activeGame, "active")
    : seatFromRound
      ? {
          roundNumber: Number(liveRound?.roundNumber || tournament.currentRound || 0),
          boardNumber: Number(seatFromRound.tableNumber || 0),
          gameId: String(seatFromRound.gameId || ""),
          color: seatFromRound.whiteKey === myPlayerKey ? "white" : "black",
          opponentName: seatFromRound.whiteKey === myPlayerKey ? seatFromRound.blackName || "Bye" : seatFromRound.whiteName,
          status: seatFromRound.status === "completed" ? "completed" : "assigned",
          result: seatFromRound.result || "*",
        }
      : fallbackGame
        ? seatFor(fallbackGame, fallbackGame.status || "completed")
        : {
            roundNumber: Number(tournament.currentRound || 0),
            boardNumber: 0,
            gameId: "",
            color: "",
            opponentName: "",
            status: joined
              ? participantState?.status === "paused"
                ? "paused"
                : isPlayingStatus(tournament.status)
                  ? "waiting"
                  : "joined"
              : "not_joined",
            result: "*",
          };

  const timeControl = resolveTimeControl(tournament);

  const canManage = role === "admin";

  return NextResponse.json({
    tournament: redactTournamentForPlayer(tournament, canManage),
    timeControl,
    // Whether Berserk is offered at all, decided once on the server: it needs
    // to be enabled for the event, an Arena, and a time control it can bite on.
    berserkAvailable: Boolean(tournament.allowBerserk) && tournament.type === "arena" && canBerserkTimeControl(timeControl),
    // Named so standings can say what they sorted by.
    tieBreak: tieBreakFor(tournament),
    // How many rounds this field can actually support without a repeat, so an
    // over-scheduled event is visible before it runs out of pairings.
    maxRounds:
      tournament.type === "swiss"
        ? maxRoundsWithoutRepeat((tournament.participants || []).length + (tournament.externalParticipants || []).length)
        : null,
    activeGame,
    games: recentGames,
    myGames: myGamesRaw,
    liveGames,
    featuredGame: liveGames[0] || null,
    topGames: liveGames.slice(0, 8),
    joined,
    currentSeat,
    participantState,
    roundProgress,
    nextRoundAt,
    arenaEndsAt: tournament.arenaEndsAt || null,
    serverNow: Date.now(),
    health: {
      activeGames: Number(countsByStatus.active || 0),
      completedGames: Number(countsByStatus.completed || 0),
      abortedGames: Number(countsByStatus.aborted || 0),
      queuedPlayers: (tournament.participantStates || []).filter((entry: any) => !["paused", "withdrawn"].includes(entry.status)).length,
    },
    myPlayerKey,
    canManage,
    canPlay: isGuest || role === "student" || role === "admin",
    guestUsername: isGuest ? guestUsername : "",
  });
}
