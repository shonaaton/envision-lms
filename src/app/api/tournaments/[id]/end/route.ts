import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { recalculateTournamentStandings } from "@/lib/tournamentEngine";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  await TournamentGame.updateMany(
    { tournament: params.id, status: "active" },
    { $set: { status: "aborted", termination: "manual", endedAt: new Date(), result: "*" } }
  );
  tournament.status = "completed";
  tournament.endedAt = new Date();
  await recalculateTournamentStandings(tournament);
  await tournament.save();
  return NextResponse.json({ ok: true });
}
