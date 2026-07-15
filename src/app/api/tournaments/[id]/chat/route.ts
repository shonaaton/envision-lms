import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { playerKeyForExternal, playerKeyForUser } from "@/lib/tournamentEngine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (!tournament.chatEnabled) return NextResponse.json({ error: "Chat is disabled for this tournament." }, { status: 400 });
  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const body = await req.json();
  const message = String(body.message || "").trim().slice(0, 500);
  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  const senderKey = session ? playerKeyForUser(String((session.user as any).id)) : guestUsername ? playerKeyForExternal(guestUsername) : "";
  const senderName = session ? String((session.user as any).name || (session.user as any).email || "User") : guestUsername;
  if (!senderKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  tournament.chatMessages = [...(tournament.chatMessages || []), { senderKey, senderName, message, createdAt: new Date(), hidden: false }].slice(-200);
  await tournament.save();
  return NextResponse.json({ ok: true });
}
