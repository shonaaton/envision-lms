import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";
import { scoringOptionsFor, toScoredGame } from "@/lib/tournamentEngine";
import { rawScore, scoreGame } from "@/lib/tournament/scoring";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/**
 * Per-game points come from the same scoring function the standings table
 * uses. This route previously carried its own copy with different streak
 * semantics, so a player's game list could contradict their own score.
 */
function buildGameRows(games: any[], playerKey: string, tournament: any) {
  const options = scoringOptionsFor(tournament);
  const priorResults: string[] = [];
  let legacyStreak = 0;

  return games.map((game: any) => {
    const isWhite = game.whiteKey === playerKey;
    const scored = toScoredGame(game);
    const raw = rawScore(scored.result, playerKey, scored.whiteKey, scored.blackKey);
    const scoresHere = game.status === "completed" && game.result !== "*" && scored.endedAt <= options.scoringCutoff;
    const isBye = game.termination === "bye";

    const pointsEarned = !scoresHere
      ? 0
      : isBye
        ? 1
        : scoreGame({ game: scored, playerKey, priorResults: [...priorResults], legacyStreak, options });

    if (scoresHere && !isBye) {
      priorResults.push(raw === 1 ? "W" : raw === 0.5 ? "D" : "L");
      legacyStreak = raw === 1 ? Math.max(1, legacyStreak + 1) : 0;
    }

    return {
      ...game,
      color: isWhite ? "White" : "Black",
      opponentName: isWhite ? game.blackName || "Bye" : game.whiteName,
      opponentRating: isWhite ? Number(game.blackRating || 0) : Number(game.whiteRating || 0),
      pointsEarned,
      countedInStandings: scoresHere,
    };
  });
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
  if (role === "student" && !(await isCurrentStudent(userId))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }
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
  const games = buildGameRows(chronologicalGames, playerKey, tournament).reverse();
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
