import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { isPlayingStatus, playerKeyForExternal, playerKeyForUser, setTournamentPlayerState, syncArenaPairings } from "@/lib/tournamentEngine";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";
import { consumeTournamentRate, rateIdentity, rateLimitedResponse } from "@/lib/tournamentRateLimit";

/**
 * A player's own place in the Arena queue.
 *
 * Pausing stops new pairings; it never touches a game already in progress, so
 * "pause" always means "after this game". Resuming triggers a pairing pass
 * immediately rather than leaving the player to wait for the next tick.
 *
 * This replaces using `join` as an implicit resume, which was easy to misread.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  await dbConnect();

  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.type !== "arena") {
    return NextResponse.json({ error: "Queue control applies to Arena tournaments." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const guestJoined = guestUsername
    ? (tournament.externalParticipants || []).some((player: any) => String(player.username || "").toLowerCase() === guestUsername.toLowerCase())
    : false;

  const userId = session ? String((session.user as any).id) : "";
  const role = session ? (session.user as any).role : "";

  const limit = consumeTournamentRate("result", rateIdentity({ userId, guestUsername, request: req }));
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  if (role === "student" && !(await isCurrentStudent(userId))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }

  const playerKey = session ? playerKeyForUser(userId) : guestJoined ? playerKeyForExternal(guestUsername) : "";
  if (!playerKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const registered =
    (tournament.participants || []).some((player: any) => String(player?._id ?? player) === userId) || guestJoined;
  if (!registered) return NextResponse.json({ error: "Join the tournament before changing your queue status." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  if (!["pause", "resume"].includes(action)) {
    return NextResponse.json({ error: "Choose either pause or resume." }, { status: 400 });
  }

  setTournamentPlayerState(tournament, playerKey, action === "pause" ? "paused" : "joined");
  await tournament.save();

  const activeGame = await TournamentGame.findOne(
    { tournament: tournament._id, status: "active", $or: [{ whiteKey: playerKey }, { blackKey: playerKey }] },
    "_id"
  ).lean();

  if (action === "resume" && isPlayingStatus(tournament.status) && !tournament.pausedByAdmin) {
    await syncArenaPairings(String(tournament._id));
  }

  return NextResponse.json({
    ok: true,
    status: action === "pause" ? "paused" : "queued",
    // A paused player with a game in progress finishes it; the pause takes
    // effect once that board is done.
    finishingGame: Boolean(activeGame),
  });
}
