import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { abortGame, freezeTournamentResults, recalculateTournamentStandings } from "@/lib/tournamentEngine";
import { recordActivity } from "@/lib/activity";
import { emitTournamentEnded } from "@/lib/tournamentSocketServer";

/**
 * Admin override: end a tournament now.
 *
 * Games still in progress are aborted rather than decided, so nobody is handed
 * a result they did not play for. Standings are recomputed and frozen once.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (["completed", "finished", "cancelled"].includes(String(tournament.status))) {
    return NextResponse.json({ ok: true, alreadyEnded: true });
  }

  const body = await req.json().catch(() => ({}));
  const activeGames: any[] = await TournamentGame.find({ tournament: tournament._id, status: "active" });
  for (const game of activeGames) await abortGame(game, "manual");

  tournament.status = "finished";
  tournament.endedAt = new Date();
  tournament.adminActions = [
    ...(tournament.adminActions || []),
    {
      actor: (session!.user as any).id,
      action: "tournament.ended_manually",
      note: String(body.reason || "Ended early by admin.").slice(0, 500),
      metadata: { abortedGames: activeGames.length },
      createdAt: new Date(),
    },
  ];

  await recalculateTournamentStandings(tournament);
  await freezeTournamentResults(tournament);
  await tournament.save();
  emitTournamentEnded(String(tournament._id));

  await recordActivity({
    actor: (session!.user as any).id,
    type: "tournament.ended_manually",
    label: `Ended tournament ${tournament.name}`,
    entityType: "Tournament",
    entityId: String(tournament._id),
    metadata: { abortedGames: activeGames.length },
  });
  return NextResponse.json({ ok: true, abortedGames: activeGames.length });
}
