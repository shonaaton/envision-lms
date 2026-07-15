import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { playerKeyForExternal, playerKeyForUser, setTournamentPlayerState } from "@/lib/tournamentEngine";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (["live", "playing", "completed", "finished"].includes(String(tournament.status || ""))) {
    return NextResponse.json({ error: "Withdraw is available only before play starts. Use Pause during a live Arena." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const guestJoined = guestUsername
    ? (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === guestUsername.toLowerCase())
    : false;

  if (session) {
    const userId = String((session.user as any).id);
    tournament.participants = (tournament.participants || []).filter((participant: any) => participant?.toString?.() !== userId);
    setTournamentPlayerState(tournament, playerKeyForUser(userId), "withdrawn");
  } else if (guestJoined) {
    tournament.externalParticipants = (tournament.externalParticipants || []).filter((player: any) => String(player.username || "").toLowerCase() !== guestUsername.toLowerCase());
    setTournamentPlayerState(tournament, playerKeyForExternal(guestUsername), "withdrawn");
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await tournament.save();
  return NextResponse.json({ ok: true });
}
