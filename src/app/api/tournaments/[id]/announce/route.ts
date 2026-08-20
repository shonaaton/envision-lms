import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { notifyExternalTournamentParticipant, notifyTournamentUsers } from "@/lib/tournamentNotifications";
import { recordActivity } from "@/lib/activity";
import { emitTournamentUpdate } from "@/lib/tournamentSocketServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  const body = await req.json();
  const title = String(body.title || "Tournament announcement").trim();
  const message = String(body.message || "").trim();
  if (!message) return NextResponse.json({ error: "Announcement message is required." }, { status: 400 });

  await notifyTournamentUsers(tournament, {
    type: "tournament.announcement",
    title,
    message,
    href: `/tournaments/${tournament._id}`,
  });
  await Promise.all((tournament.externalParticipants || []).map((participant: any) =>
    notifyExternalTournamentParticipant({
      email: participant.email,
      name: participant.displayName || participant.username,
      tournamentName: tournament.name,
      subject: title,
      message,
      href: `/tournament-join/${tournament.externalInvite?.token || ""}/play`,
      tournamentId: tournament._id.toString(),
    })
  ));
  tournament.adminActions = [...(tournament.adminActions || []), {
    actor: (session!.user as any).id,
    action: "organizer.announcement",
    note: title,
    metadata: { message },
    createdAt: new Date(),
  }];
  await tournament.save();
  await recordActivity({
    actor: (session!.user as any).id,
    type: "tournament.announcement",
    label: `Sent announcement for ${tournament.name}`,
    entityType: "Tournament",
    entityId: tournament._id.toString(),
  });
  emitTournamentUpdate(tournament._id.toString(), "announcement");
  return NextResponse.json({ ok: true });
}
