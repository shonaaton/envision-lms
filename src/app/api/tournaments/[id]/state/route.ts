import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import "@/models/User";
import { playerKeyForExternal, playerKeyForUser } from "@/lib/tournamentEngine";
import { autoAdvanceSwissTournament, enforceTournamentGameTimeouts, finalizeTournamentIfComplete, recalculateTournamentStandings, startTournament, syncArenaPairings } from "@/lib/tournamentEngine";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { notifyExternalTournamentParticipants, notifyTournamentUsers } from "@/lib/tournamentNotifications";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function participantCount(tournament: any) {
  return Number((tournament?.participants || []).length) + Number((tournament?.externalParticipants || []).length);
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
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
  const isGuest = guestJoined && !session;
  const myPlayerKey = isGuest ? playerKeyForExternal(guestUsername) : playerKeyForUser(String(userId));
  const allowed = guestJoined || (
    session && (
      role === "admin" ||
      role === "instructor" ||
      tournament.access?.allActiveStudents ||
      (tournament.access?.users || []).map((id: any) => String(id)).includes(String(userId)) ||
      (tournament.participants || []).some((player: any) => objectId(player) === String(userId))
    )
  );
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const mutable: any = await Tournament.findById(params.id);
  if (mutable) {
    if ((guestJoined || session) && myPlayerKey) {
      const states = mutable.participantStates || [];
      const index = states.findIndex((entry: any) => entry.playerKey === myPlayerKey);
      if (index >= 0) states[index].lastSeenAt = new Date();
      mutable.participantStates = states;
    }
    const now = Date.now();
    const status = String(mutable.status || "");
    if (["created", "registration_open", "upcoming"].includes(status)) {
      const startsIn = new Date(mutable.startAt || 0).getTime() - now;
      if (startsIn > 0 && startsIn <= 15 * 60 * 1000) {
        mutable.status = "starting_soon";
        const alreadyNotified = (mutable.adminActions || []).some((action: any) => action.action === "notification.starting_soon");
        if (!alreadyNotified) {
          await notifyTournamentUsers(mutable, {
            type: "tournament.starting_soon",
            title: "Tournament starting soon",
            message: `${mutable.name} starts in less than 15 minutes.`,
            href: `/tournaments/${mutable._id}`,
          });
          await notifyExternalTournamentParticipants(mutable, {
            subject: `Starting soon: ${mutable.name}`,
            message: (participant) => `Hello ${participant.displayName || participant.username},\n\n${mutable.name} starts in less than 15 minutes. Open your tournament link to enter the lobby.`,
          });
          mutable.adminActions = [...(mutable.adminActions || []), {
            action: "notification.starting_soon",
            note: "Starting-soon notification sent.",
            createdAt: new Date(),
          }];
        }
      }
    }
    const dueToStart =
      ["created", "registration_open", "starting_soon", "upcoming"].includes(String(mutable.status || "")) &&
      new Date(mutable.startAt || 0).getTime() <= Date.now() &&
      participantCount(mutable) >= 2;
    if (dueToStart) {
      await startTournament(mutable);
    }
    await enforceTournamentGameTimeouts(mutable);
    if (["live", "playing"].includes(String(mutable.status || "")) && mutable.type === "arena") {
      await syncArenaPairings(mutable);
    }
    if (mutable.type === "swiss") await autoAdvanceSwissTournament(mutable);
    await recalculateTournamentStandings(mutable);
    await finalizeTournamentIfComplete(mutable);
    await mutable.save();
  }

  const fresh: any = await Tournament.findById(params.id).populate("participants", "name username rating").lean();
  const games = await TournamentGame.find({ tournament: params.id }).sort({ createdAt: -1 }).lean();
  const joined = guestJoined || (fresh.participants || []).some((player: any) => objectId(player) === String(userId));
  const activeGame =
    games.find((game: any) =>
      game.status === "active" &&
      (isGuest
        ? [String(game.whiteExternalUsername || "").toLowerCase(), String(game.blackExternalUsername || "").toLowerCase()].includes(guestUsername.toLowerCase())
        : [game.whiteUser?.toString?.(), game.blackUser?.toString?.()].includes(String(userId)))
    ) || null;
  const myGames = games.filter((game: any) =>
    isGuest
      ? [String(game.whiteExternalUsername || "").toLowerCase(), String(game.blackExternalUsername || "").toLowerCase()].includes(guestUsername.toLowerCase())
      : [game.whiteUser?.toString?.(), game.blackUser?.toString?.()].includes(String(userId))
  ).slice(0, 10);
  const liveRound = (fresh.roundsData || []).find((round: any) => round.status !== "completed") || null;
  const seatFromRound = liveRound?.pairings?.find((pairing: any) => pairing.whiteKey === myPlayerKey || pairing.blackKey === myPlayerKey) || null;
  const fallbackGame = myGames[0] || null;
  const participantState = (fresh.participantStates || []).find((entry: any) => entry.playerKey === myPlayerKey) || null;
  if (activeGame && myPlayerKey) {
    const field = activeGame.whiteKey === myPlayerKey ? "whiteOnlineAt" : activeGame.blackKey === myPlayerKey ? "blackOnlineAt" : "";
    if (field) await TournamentGame.updateOne({ _id: activeGame._id }, { $set: { [field]: new Date() } });
  }
  const featuredGame = games
    .filter((game: any) => game.status === "active")
    .sort((a: any, b: any) => {
      const aScore = (fresh.standings || []).find((entry: any) => entry.playerKey === a.whiteKey)?.points || 0;
      const bScore = (fresh.standings || []).find((entry: any) => entry.playerKey === b.whiteKey)?.points || 0;
      return bScore - aScore;
    })[0] || null;
  const topGames = games
    .filter((game: any) => game.status === "active")
    .slice(0, 8);
  const health = {
    activeGames: games.filter((game: any) => game.status === "active").length,
    queuedPlayers: (fresh.participantStates || []).filter((entry: any) => ["joined", "queued"].includes(entry.status)).length,
    staleConnections: games.filter((game: any) =>
      game.status === "active" &&
      [game.whiteOnlineAt, game.blackOnlineAt].some((value: any) => value && Date.now() - new Date(value).getTime() > 30_000)
    ).length,
  };
  const currentSeat = activeGame
    ? {
        roundNumber: Number(activeGame.roundNumber || fresh.currentRound || 0),
        boardNumber: Number(activeGame.tableNumber || 0),
        color: isGuest
          ? String(activeGame.whiteExternalUsername || "").toLowerCase() === guestUsername.toLowerCase() ? "white" : "black"
          : String(activeGame.whiteUser || "") === String(userId) ? "white" : "black",
        opponentName: isGuest
          ? String(activeGame.whiteExternalUsername || "").toLowerCase() === guestUsername.toLowerCase() ? (activeGame.blackName || "Bye") : activeGame.whiteName
          : String(activeGame.whiteUser || "") === String(userId) ? (activeGame.blackName || "Bye") : activeGame.whiteName,
        status: "active",
        result: activeGame.result || "*",
      }
    : seatFromRound
      ? {
          roundNumber: Number(liveRound?.roundNumber || fresh.currentRound || 0),
          boardNumber: Number(seatFromRound.tableNumber || 0),
          color: seatFromRound.whiteKey === myPlayerKey ? "white" : "black",
          opponentName: seatFromRound.whiteKey === myPlayerKey ? (seatFromRound.blackName || "Bye") : seatFromRound.whiteName,
          status: seatFromRound.status === "completed" ? "completed" : "assigned",
          result: seatFromRound.result || "*",
        }
      : fallbackGame
        ? {
            roundNumber: Number(fallbackGame.roundNumber || 0),
            boardNumber: Number(fallbackGame.tableNumber || 0),
            color: isGuest
              ? String(fallbackGame.whiteExternalUsername || "").toLowerCase() === guestUsername.toLowerCase() ? "white" : "black"
              : String(fallbackGame.whiteUser || "") === String(userId) ? "white" : "black",
            opponentName: isGuest
              ? String(fallbackGame.whiteExternalUsername || "").toLowerCase() === guestUsername.toLowerCase() ? (fallbackGame.blackName || "Bye") : fallbackGame.whiteName
              : String(fallbackGame.whiteUser || "") === String(userId) ? (fallbackGame.blackName || "Bye") : fallbackGame.whiteName,
            status: fallbackGame.status || "completed",
            result: fallbackGame.result || "*",
          }
        : {
            roundNumber: Number(fresh.currentRound || 0),
            boardNumber: 0,
            color: "",
            opponentName: "",
            status: joined ? (participantState?.status === "paused" ? "paused" : ["live", "playing"].includes(String(fresh.status || "")) ? "waiting" : "joined") : "not_joined",
            result: "*",
          };

  return NextResponse.json({
    tournament: fresh,
    activeGame,
    games: games.slice(0, 25),
    myGames,
    featuredGame,
    topGames,
    joined,
    currentSeat,
    participantState,
    health,
    myPlayerKey,
    canManage: role === "admin",
    canPlay: isGuest || role === "student" || role === "admin",
    guestUsername: isGuest ? guestUsername : "",
  });
}
