import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { completeGame, finalizeTournamentIfComplete, recalculateTournamentStandings, syncArenaPairings, syncSwissRoundState } from "@/lib/tournamentEngine";
import { StudentReward } from "@/models/ClassroomLive";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

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

  await dbConnect();
  const game: any = await TournamentGame.findById(params.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const tournament: any = await Tournament.findById(game.tournament);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const isGuestPlayer =
    normalizedGuest &&
    [String(game.whiteExternalUsername || "").toLowerCase(), String(game.blackExternalUsername || "").toLowerCase()].includes(normalizedGuest);
  if (!session && !isGuestPlayer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session ? (session.user as any).role : "";
  const userId = session ? String((session.user as any).id) : "";
  const body = await req.json();
  const isPlayer = [String(game.whiteUser || ""), String(game.blackUser || "")].includes(userId);
  const isGuestWhite = normalizedGuest && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest;
  const isGuestBlack = normalizedGuest && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest;
  const canActAsPlayer = isPlayer || isGuestWhite || isGuestBlack;

  if (role !== "admin" && !canActAsPlayer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.action === "resign") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only an assigned player can resign this game." }, { status: 400 });
    const userIsWhite = isGuestWhite || String(game.whiteUser || "") === userId;
    await completeGame(game, {
      result: userIsWhite ? "0-1" : "1-0",
      termination: "resign",
      winnerKey: userIsWhite ? game.blackKey : game.whiteKey,
    });
  } else if (body.action === "draw") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only assigned players can agree a draw." }, { status: 400 });
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
  if (tournament.type === "swiss") {
    await syncSwissRoundState(tournament);
  }
  await recalculateTournamentStandings(tournament);
  if (tournament.type === "arena") await syncArenaPairings(tournament);
  await finalizeTournamentIfComplete(tournament);
  await tournament.save();

  return NextResponse.json({ ok: true, game });
}
