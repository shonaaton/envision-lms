import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { playerKeyForExternal, playerKeyForUser, recalculateTournamentStandings, setTournamentPlayerState, syncArenaPairings } from "@/lib/tournamentEngine";
import { notifyAdmins, notifyTournamentUsers } from "@/lib/tournamentNotifications";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (["completed", "finished", "cancelled"].includes(String(tournament.status || ""))) {
    return NextResponse.json({ error: "This tournament is no longer joinable." }, { status: 400 });
  }
  const isPlaying = ["live", "playing"].includes(String(tournament.status || ""));
  if (isPlaying && tournament.lateJoiningAllowed === false) {
    return NextResponse.json({ error: "Late joining is disabled for this tournament." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const guestJoined = guestUsername
    ? (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === guestUsername.toLowerCase())
    : false;

  let playerKey = "";
  if (session) {
    const role = (session.user as any).role;
    const userId = String((session.user as any).id);
    const eligible =
      role === "student" ||
      role === "admin" ||
      tournament.access?.allActiveStudents ||
      (tournament.access?.users || []).map((id: any) => String(id)).includes(userId) ||
      (tournament.participants || []).some((player: any) => objectId(player) === userId);
    if (!eligible) return NextResponse.json({ error: "You are not eligible for this tournament." }, { status: 403 });
    if (!(tournament.participants || []).some((player: any) => objectId(player) === userId)) {
      tournament.participants.push(userId);
    }
    playerKey = playerKeyForUser(userId);
  } else if (guestJoined) {
    playerKey = playerKeyForExternal(guestUsername);
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queued = tournament.type === "arena" && isPlaying;
  setTournamentPlayerState(tournament, playerKey, queued ? "queued" : "joined");
  await recalculateTournamentStandings(tournament);
  tournament.adminActions = [...(tournament.adminActions || []), {
    actor: session ? (session.user as any).id : undefined,
    action: "participant.joined",
    note: session ? "Internal participant joined." : "External participant joined.",
    metadata: { playerKey },
    createdAt: new Date(),
  }];
  await tournament.save();
  if (queued) await syncArenaPairings(tournament);
  if (session) {
    await notifyTournamentUsers(tournament, {
      users: [String((session.user as any).id)],
      type: "tournament.registration",
      title: "Tournament registration successful",
      message: `You joined ${tournament.name}.`,
      href: `/tournaments/${tournament._id}`,
    });
  } else {
    await notifyAdmins({
      type: "tournament.external_join",
      title: "External participant joined",
      message: `${guestUsername} joined ${tournament.name}.`,
      tournamentId: tournament._id.toString(),
      href: `/tournaments/${tournament._id}`,
    });
  }
  await recordActivity({
    actor: session ? (session.user as any).id : undefined,
    type: "tournament.joined",
    label: `${session ? "Internal" : "External"} participant joined ${tournament.name}`,
    entityType: "Tournament",
    entityId: tournament._id.toString(),
    metadata: { playerKey },
  });

  return NextResponse.json({ ok: true });
}
