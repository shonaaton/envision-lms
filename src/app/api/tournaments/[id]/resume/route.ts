import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { recordActivity } from "@/lib/activity";
import { syncArenaPairings } from "@/lib/tournamentEngine";
import { emitTournamentUpdate } from "@/lib/tournamentSocketServer";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  tournament.pausedByAdmin = false;
  tournament.adminActions = [...(tournament.adminActions || []), {
    actor: (session!.user as any).id,
    action: "tournament.resumed",
    note: "Tournament pairing resumed by admin.",
    createdAt: new Date(),
  }];
  await tournament.save();
  if (tournament.type === "arena" && ["live", "playing"].includes(String(tournament.status || ""))) await syncArenaPairings(String(tournament._id));
  await recordActivity({ actor: (session!.user as any).id, type: "tournament.resumed", label: `Resumed tournament ${tournament.name}`, entityType: "Tournament", entityId: tournament._id.toString() });
  emitTournamentUpdate(tournament._id.toString(), "resume");
  return NextResponse.json({ ok: true });
}
