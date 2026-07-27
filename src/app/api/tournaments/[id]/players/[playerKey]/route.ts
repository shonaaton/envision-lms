import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function completedScore(result: string, playerKey: string, whiteKey: string, blackKey: string) {
  if (result === "1-0") return playerKey === whiteKey ? 1 : 0;
  if (result === "0-1") return playerKey === blackKey ? 1 : 0;
  if (result === "1/2-1/2") return 0.5;
  return 0;
}

function pointsForGame(game: any, playerKey: string, tournament: any, recentResults: string[]) {
  if (game.status !== "completed" || game.result === "*") return 0;
  const raw = completedScore(game.result, playerKey, game.whiteKey, game.blackKey);
  const isWhite = game.whiteKey === playerKey;
  if (game.source !== "arena") return raw;
  if (raw === 1) {
    const previousWin = recentResults[recentResults.length - 1] === "W";
    const streakBonus = tournament.arenaStreaks !== false && previousWin ? 2 : 0;
    const berserkBonus = (isWhite && game.berserkWhite) || (!isWhite && game.berserkBlack) ? 1 : 0;
    return 2 + streakBonus + berserkBonus;
  }
  if (raw === 0.5) {
    const moveCount = Number((game.moveHistorySAN || []).length || 0);
    const earlyDrawLimit = Math.max(0, Number(tournament.earlyDrawMoveLimit ?? 10));
    if (earlyDrawLimit > 0 && moveCount > 0 && moveCount < earlyDrawLimit) return 0;
    const drawStreakLimit = Math.max(0, Number(tournament.drawStreakLimit ?? 2));
    let trailingDraws = 0;
    for (let index = recentResults.length - 1; index >= 0; index -= 1) {
      if (recentResults[index] !== "D") break;
      trailingDraws += 1;
    }
    return drawStreakLimit > 0 && trailingDraws >= drawStreakLimit ? 0 : 1;
  }
  return 0;
}

export async function GET(_: Request, { params }: { params: { id: string; playerKey: string } }) {
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
  const userId = session ? String((session.user as any).id) : "";
  const allowed = guestJoined || (
    session && (
      role === "admin" ||
      role === "instructor" ||
      tournament.access?.allActiveStudents ||
      (tournament.access?.users || []).map((id: any) => String(id)).includes(userId) ||
      (tournament.participants || []).some((player: any) => objectId(player) === userId)
    )
  );
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const playerKey = decodeURIComponent(params.playerKey);
  const standings = Array.isArray(tournament.standings) ? tournament.standings : [];
  const player = standings.find((entry: any) => entry.playerKey === playerKey);
  if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const chronologicalGames = await TournamentGame.find({
    tournament: params.id,
    $or: [{ whiteKey: playerKey }, { blackKey: playerKey }],
  }).sort({ createdAt: 1 }).lean();
  const recentResults: string[] = [];
  const games = chronologicalGames.map((game: any) => {
    const isWhite = game.whiteKey === playerKey;
    const raw = completedScore(game.result, playerKey, game.whiteKey, game.blackKey);
    const pointsEarned = pointsForGame(game, playerKey, tournament, recentResults);
    if (game.status === "completed" && game.result !== "*") {
      recentResults.push(raw === 1 ? "W" : raw === 0.5 ? "D" : "L");
    }
    return {
      ...game,
      color: isWhite ? "White" : "Black",
      opponentName: isWhite ? game.blackName || "Bye" : game.whiteName,
      opponentRating: isWhite ? Number(game.blackRating || 0) : Number(game.whiteRating || 0),
      pointsEarned,
    };
  }).reverse();
  const ratedOpponents = games.map((game: any) => Number(game.opponentRating || 0)).filter((rating: number) => rating > 0);

  return NextResponse.json({
    player,
    games,
    stats: {
      averageOpponentRating: ratedOpponents.length ? Math.round(ratedOpponents.reduce((sum: number, rating: number) => sum + rating, 0) / ratedOpponents.length) : null,
      winPercentage: Number(player.gamesPlayed || 0) ? Math.round((Number(player.wins || 0) / Number(player.gamesPlayed || 0)) * 100) : 0,
      totalGames: games.length,
    },
  });
}
