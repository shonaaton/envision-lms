import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { completeGame, finalizeTournamentIfComplete, recalculateTournamentStandings, syncArenaPairings } from "@/lib/tournamentEngine";
import { StudentReward } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

async function awardForGame(game: any) {
  if (game.status !== "completed" || game.result === "*") return;
  const items = [
    game.whiteUser
      ? {
          student: game.whiteUser,
          xp: game.result === "1-0" ? 10 : game.result === "1/2-1/2" ? 5 : 2,
          coins: game.result === "1-0" ? 5 : game.result === "1/2-1/2" ? 2 : 1,
          reason: `Tournament game vs ${game.blackName || "bye"}`,
        }
      : null,
    game.blackUser
      ? {
          student: game.blackUser,
          xp: game.result === "0-1" ? 10 : game.result === "1/2-1/2" ? 5 : 2,
          coins: game.result === "0-1" ? 5 : game.result === "1/2-1/2" ? 2 : 1,
          reason: `Tournament game vs ${game.whiteName}`,
        }
      : null,
  ].filter(Boolean) as any[];
  await Promise.all(
    items.map((reward) =>
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
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const game: any = await TournamentGame.findById(params.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const role = (session.user as any).role;
  const userId = String((session.user as any).id);
  const body = await req.json();

  if (role !== "admin" && ![String(game.whiteUser || ""), String(game.blackUser || "")].includes(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.action === "resign") {
    const userIsWhite = String(game.whiteUser || "") === userId;
    await completeGame(game, {
      result: userIsWhite ? "0-1" : "1-0",
      termination: "resign",
      winnerKey: userIsWhite ? game.blackKey : game.whiteKey,
    });
  } else if (body.action === "draw") {
    await completeGame(game, {
      result: "1/2-1/2",
      termination: "draw_agreement",
    });
  } else if (role === "admin" && body.result) {
    await completeGame(game, {
      result: body.result,
      termination: "manual",
      winnerKey: body.result === "1-0" ? game.whiteKey : body.result === "0-1" ? game.blackKey : "",
    });
  } else {
    return NextResponse.json({ error: "Unsupported result action." }, { status: 400 });
  }

  await awardForGame(game);
  const tournament: any = await Tournament.findById(game.tournament);
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
  await recalculateTournamentStandings(tournament);
  if (tournament.type === "arena") await syncArenaPairings(tournament);
  await finalizeTournamentIfComplete(tournament);
  await tournament.save();

  return NextResponse.json({ ok: true, game });
}
