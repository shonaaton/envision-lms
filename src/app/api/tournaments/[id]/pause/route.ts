import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { playerKeyForExternal, playerKeyForUser, setTournamentPlayerState } from "@/lib/tournamentEngine";
import { emitTournamentUpdate } from "@/lib/tournamentSocketServer";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.type !== "arena" || !["live", "playing"].includes(String(tournament.status || ""))) {
    return NextResponse.json({ error: "Pause is available only during live Arena tournaments." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const guestJoined = guestUsername
    ? (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === guestUsername.toLowerCase())
    : false;
  const playerKey = session ? playerKeyForUser(String((session.user as any).id)) : guestJoined ? playerKeyForExternal(guestUsername) : "";
  if (!playerKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  setTournamentPlayerState(tournament, playerKey, "paused");
  await tournament.save();
  emitTournamentUpdate(tournament._id.toString(), "pause");
  return NextResponse.json({ ok: true });
}
