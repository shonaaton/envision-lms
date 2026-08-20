import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { recordActivity } from "@/lib/activity";
import { notifyTournamentUsers } from "@/lib/tournamentNotifications";
import { emitTournamentUpdate } from "@/lib/tournamentSocketServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  await TournamentGame.updateMany(
    { tournament: params.id, status: "active" },
    { $set: { status: "aborted", termination: "manual", result: "*", endedAt: new Date() } }
  );
  tournament.status = "cancelled";
  tournament.endedAt = new Date();
  tournament.adminActions = [...(tournament.adminActions || []), {
    actor: (session!.user as any).id,
    action: "tournament.cancelled",
    note: String(body.reason || "Tournament cancelled."),
    createdAt: new Date(),
  }];
  await tournament.save();
  await notifyTournamentUsers(tournament, {
    type: "tournament.cancelled",
    title: "Tournament cancelled",
    message: `${tournament.name} has been cancelled.`,
    href: `/tournaments/${tournament._id}`,
  });
  await recordActivity({
    actor: (session!.user as any).id,
    type: "tournament.cancelled",
    label: `Cancelled tournament ${tournament.name}`,
    entityType: "Tournament",
    entityId: tournament._id.toString(),
  });
  emitTournamentUpdate(tournament._id.toString(), "cancel");
  return NextResponse.json({ ok: true });
}
