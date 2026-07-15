import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { applyGameMove, enforceTournamentGameTimeouts, finalizeTournamentIfComplete, queueCompletedArenaPlayers, recalculateTournamentStandings, syncArenaPairings, syncSwissRoundState } from "@/lib/tournamentEngine";
import { StudentReward } from "@/models/ClassroomLive";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

export const dynamic = "force-dynamic";

async function awardForGame(game: any) {
  if (game.status !== "completed" || !game.result || game.result === "*") return;
  const rewards: Array<{ student: any; xp: number; coins: number; reason: string }> = [];
  if (game.whiteUser) {
    rewards.push({
      student: game.whiteUser,
      xp: game.result === "1-0" ? 10 : game.result === "1/2-1/2" ? 5 : 2,
      coins: game.result === "1-0" ? 5 : game.result === "1/2-1/2" ? 2 : 1,
      reason: `Tournament game vs ${game.blackName || "bye"}`,
    });
  }
  if (game.blackUser) {
    rewards.push({
      student: game.blackUser,
      xp: game.result === "0-1" ? 10 : game.result === "1/2-1/2" ? 5 : 2,
      coins: game.result === "0-1" ? 5 : game.result === "1/2-1/2" ? 2 : 1,
      reason: `Tournament game vs ${game.whiteName}`,
    });
  }
  await Promise.all(
    rewards.map((reward) =>
      StudentReward.findOneAndUpdate(
        { student: reward.student, sourceType: "tournament_game", sourceId: game._id },
        { student: reward.student, sourceType: "tournament_game", sourceId: game._id, xp: reward.xp, coins: reward.coins, reason: reward.reason },
        { upsert: true, new: true }
      )
    )
  );
}

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const session = await auth();

  await dbConnect();
  let game: any = await TournamentGame.findById(params.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.status !== "active") return NextResponse.json({ error: "This game is no longer active." }, { status: 400 });

  const tournament: any = await Tournament.findById(game.tournament);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  await enforceTournamentGameTimeouts(tournament);
  game = await TournamentGame.findById(params.gameId);
  if (game.status !== "active") return NextResponse.json({ error: "This game is no longer active." }, { status: 400 });

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const isGuestWhite = normalizedGuest && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest;
  const isGuestBlack = normalizedGuest && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest;
  if (!session && !isGuestWhite && !isGuestBlack) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session ? String((session.user as any).id) : "";
  const isWhite = String(game.whiteUser || "") === userId;
  const isBlack = String(game.blackUser || "") === userId;
  const isAdmin = session ? (session.user as any).role === "admin" : false;
  if (!isWhite && !isBlack && !isGuestWhite && !isGuestBlack && !isAdmin) {
    return NextResponse.json({ error: "You are not assigned to this game." }, { status: 403 });
  }
  if ((game.turn === "w" && !isWhite && !isGuestWhite) || (game.turn === "b" && !isBlack && !isGuestBlack)) {
    return NextResponse.json({ error: "It is not your turn." }, { status: 400 });
  }

  const body = await req.json();
  try {
    await applyGameMove(game, { from: body.from, to: body.to, promotion: body.promotion || "q" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not register move" }, { status: 400 });
  }

  if (game.status === "completed") {
    queueCompletedArenaPlayers(tournament, game);
    const currentRound = (tournament.roundsData || []).find((round: any) => Number(round.roundNumber) === Number(game.roundNumber));
    if (currentRound) {
      currentRound.pairings = (currentRound.pairings || []).map((pairing: any) =>
        String(pairing.gameId) === String(game._id) ? { ...pairing, status: "completed", result: game.result } : pairing
      );
      if ((currentRound.pairings || []).every((pairing: any) => pairing.status === "completed")) {
        currentRound.status = "completed";
        currentRound.endedAt = new Date();
      }
    }
    await awardForGame(game);
  }
  if (tournament.type === "swiss") {
    await syncSwissRoundState(tournament);
  }
  await recalculateTournamentStandings(tournament);
  if (tournament.type === "arena") await syncArenaPairings(tournament);
  await finalizeTournamentIfComplete(tournament);
  await tournament.save();

  return NextResponse.json({ ok: true, game });
}
