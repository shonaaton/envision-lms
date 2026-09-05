import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { startTournament } from "@/lib/tournamentEngine";
import { recordActivity } from "@/lib/activity";
import { emitTournamentStatus } from "@/lib/tournamentSocketServer";

/**
 * Admin override: start a tournament now.
 *
 * The scheduled worker starts due tournaments on its own; this exists for the
 * cases automation cannot judge — a session running late, a field that is ready
 * early. It calls the same lifecycle function the worker calls, and is
 * idempotent: starting an already-started tournament changes nothing.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  if (["live", "playing"].includes(String(tournament.status))) {
    return NextResponse.json({ ok: true, alreadyStarted: true });
  }
  if (["completed", "finished", "cancelled"].includes(String(tournament.status))) {
    return NextResponse.json({ error: "This tournament has already ended." }, { status: 400 });
  }

  const participantCount = (tournament.participants || []).length + (tournament.externalParticipants || []).length;
  if (participantCount < 2) {
    return NextResponse.json({ error: "At least two participants are needed to start." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  tournament.adminActions = [
    ...(tournament.adminActions || []),
    {
      actor: (session!.user as any).id,
      action: "tournament.started_manually",
      note: String(body.reason || "Started early by admin.").slice(0, 500),
      createdAt: new Date(),
    },
  ];
  await startTournament(tournament);
  emitTournamentStatus(String(tournament._id), "playing", { startedAt: tournament.startedAt });

  await recordActivity({
    actor: (session!.user as any).id,
    type: "tournament.started_manually",
    label: `Started tournament ${tournament.name}`,
    entityType: "Tournament",
    entityId: String(tournament._id),
  });
  return NextResponse.json({ ok: true });
}
