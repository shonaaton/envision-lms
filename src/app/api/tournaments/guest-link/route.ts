import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { consumeTournamentRate, rateIdentity, rateLimitedResponse } from "@/lib/tournamentRateLimit";
import { notifyExternalTournamentParticipant } from "@/lib/tournamentNotifications";
import { guestTournamentLink, tournamentStartLabel } from "@/lib/tournamentReminders";

/**
 * "Email me my tournament link", from the login page.
 *
 * Tournament guests have no portal account, yet they keep coming to /login
 * (Riya Sadhukhan tried 12 times on 14 Nov 2026 and never reached the room).
 * This sends every upcoming or live tournament they registered for with that
 * email, with their username and the room link. The answer is the same whether
 * or not the address is registered, so it cannot be used to find out who is.
 */

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["created", "registration_open", "starting_soon", "upcoming", "live", "playing"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAME_ANSWER = {
  ok: true,
  message: "If that email is registered for a tournament as a guest, we have sent the tournament link to it. Check your inbox and spam folder.",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(request: Request) {
  const limit = consumeTournamentRate("guestLink", rateIdentity({ request }));
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter the email address you registered with." }, { status: 400 });
  // Per inbox too, so nobody can flood someone else's mailbox from many addresses.
  if (!consumeTournamentRate("guestLinkInbox", `email:${email}`).allowed) return NextResponse.json(SAME_ANSWER);

  await dbConnect();
  const pattern = new RegExp(`^${escapeRegExp(email)}$`, "i");
  const tournaments: any[] = await Tournament.find({
    status: { $in: OPEN_STATUSES },
    "externalInvite.enabled": true,
    externalParticipants: { $elemMatch: { email: pattern } },
  })
    .select("name startAt status externalInvite.token externalParticipants.username externalParticipants.displayName externalParticipants.email")
    .sort({ startAt: 1 })
    .limit(5)
    .lean();

  for (const tournament of tournaments) {
    const guest = (tournament.externalParticipants || []).find((player: any) => pattern.test(String(player.email || "")));
    if (!guest || !tournament.externalInvite?.token) continue;
    const name = guest.displayName || guest.username;
    const live = ["live", "playing"].includes(String(tournament.status));
    await notifyExternalTournamentParticipant({
      email: guest.email,
      name,
      tournamentName: tournament.name,
      subject: `Your tournament link: ${tournament.name}`,
      message: `Hello ${name},\n\nYou asked for your link to ${tournament.name}${live ? ", which is being played now" : `, starting ${tournamentStartLabel(tournament)}`}.\n\nYou do not need an academy login. Tap "Enter Tournament Room" below. If it asks, choose "I have already registered" and enter this email and your username.\n\nYour username: ${guest.username}`,
      href: guestTournamentLink(tournament),
      tournamentId: String(tournament._id),
    }).catch(() => null);
  }

  console.info(`[tournament] guest link requested matches=${tournaments.length}`);
  return NextResponse.json(SAME_ANSWER);
}
