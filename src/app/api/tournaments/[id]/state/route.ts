import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import "@/models/User";
import { playerKeyForExternal, playerKeyForUser } from "@/lib/tournamentEngine";
import { finalizeTournamentIfComplete, recalculateTournamentStandings, startTournament, syncArenaPairings, syncSwissRoundState } from "@/lib/tournamentEngine";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

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
  const tournament: any = await Tournament.findById(params.id).populate("participants", "name username").lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const guestJoined = guestUsername
    ? (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === guestUsername.toLowerCase())
    : false;

  const role = session ? (session.user as any).role : "";
  const userId = session ? (session.user as any).id : "";
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
    const dueToStart =
      ["draft", "upcoming"].includes(String(mutable.status || "")) &&
      new Date(mutable.startAt || 0).getTime() <= Date.now() &&
      participantCount(mutable) >= 2;
    if (dueToStart) {
      await startTournament(mutable);
    }
    if (mutable.status === "live" && mutable.type === "arena") {
      await syncArenaPairings(mutable);
    }
    if (mutable.type === "swiss") await syncSwissRoundState(mutable);
    await recalculateTournamentStandings(mutable);
    await finalizeTournamentIfComplete(mutable);
    await mutable.save();
  }

  const fresh: any = await Tournament.findById(params.id).populate("participants", "name username").lean();
  const games = await TournamentGame.find({ tournament: params.id }).sort({ createdAt: -1 }).lean();
  const joined = guestJoined || (fresh.participants || []).some((player: any) => objectId(player) === String(userId));
  const isGuest = guestJoined && !session;
  const myPlayerKey = isGuest ? playerKeyForExternal(guestUsername) : playerKeyForUser(String(userId));
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
            status: joined ? (fresh.status === "live" ? "waiting" : "joined") : "not_joined",
            result: "*",
          };

  return NextResponse.json({
    tournament: fresh,
    activeGame,
    games: games.slice(0, 25),
    myGames,
    joined,
    currentSeat,
    canManage: role === "admin",
    canPlay: isGuest || role === "student" || role === "admin",
    guestUsername: isGuest ? guestUsername : "",
  });
}
