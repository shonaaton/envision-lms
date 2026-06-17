import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { startTournament } from "@/lib/tournamentEngine";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.status === "completed") return NextResponse.json({ error: "Tournament already completed" }, { status: 400 });
  if (tournament.status === "live") return NextResponse.json({ error: "Tournament is already live." }, { status: 400 });

  const participantCount = Number((tournament.participants || []).length) + Number((tournament.externalParticipants || []).length);
  if (participantCount < 2) {
    return NextResponse.json({ error: "At least two participants are required to start a tournament." }, { status: 400 });
  }
  if (tournament.type === "swiss" && Number(tournament.rounds || 0) < 1) {
    return NextResponse.json({ error: "Swiss tournaments need at least one round." }, { status: 400 });
  }
  if (tournament.type === "arena" && Number(tournament.arenaDurationMinutes || 0) < 1) {
    return NextResponse.json({ error: "Arena tournaments need a valid duration." }, { status: 400 });
  }

  await startTournament(tournament);
  await recordActivity({
    actor: (session!.user as any).id,
    type: "tournament.started",
    label: `Started tournament ${tournament.name}`,
    entityType: "Tournament",
    entityId: tournament._id.toString(),
  });

  return NextResponse.json({ ok: true });
}
