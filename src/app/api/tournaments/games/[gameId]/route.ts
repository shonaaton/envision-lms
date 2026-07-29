import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export async function GET(_: Request, { params }: { params: { gameId: string } }) {
  const session = await auth();
  await dbConnect();
  const game: any = await TournamentGame.findById(params.gameId).lean();
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const tournament: any = await Tournament.findById(game.tournament).populate("participants", "name username rating").lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const guestJoined = guestUsername
    ? (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === guestUsername.toLowerCase())
    : false;
  const role = session ? (session.user as any).role : "";
  const userId = session ? String((session.user as any).id) : "";
  if (role === "student" && !(await isCurrentStudent(userId))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }
  const allowed = guestJoined || (
    session && (
      role === "admin" ||
      role === "instructor" ||
      tournament.access?.allActiveStudents ||
      (tournament.access?.users || []).map((id: any) => String(id)).includes(userId) ||
      (tournament.participants || []).some((player: any) => objectId(player) === userId)
    )
  );
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ game, tournament });
}
