import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { finalizeTournamentIfComplete, generateSwissRound, recalculateTournamentStandings } from "@/lib/tournamentEngine";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.type !== "swiss") return NextResponse.json({ error: "Next round is only available for Swiss tournaments." }, { status: 400 });

  const currentRound = Number(tournament.currentRound || 0);
  if (currentRound) {
    const unfinished = await TournamentGame.exists({ tournament: params.id, roundNumber: currentRound, status: "active" });
    if (unfinished) return NextResponse.json({ error: "Some games in the current round are still active." }, { status: 400 });
    tournament.roundsData = (tournament.roundsData || []).map((round: any) =>
      Number(round.roundNumber) === currentRound ? { ...round, status: "completed", endedAt: new Date(), pairings: (round.pairings || []).map((pairing: any) => ({ ...pairing, status: "completed" })) } : round
    );
    await recalculateTournamentStandings(tournament);
    await tournament.save();
    await finalizeTournamentIfComplete(tournament);
    if (tournament.status === "completed") return NextResponse.json({ ok: true, completed: true });
  }

  await generateSwissRound(tournament);
  return NextResponse.json({ ok: true, round: tournament.currentRound });
}
