import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { gameId: string } }) {
  const session = await auth();
  await dbConnect();
  const game: any = await TournamentGame.findById(params.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const tournament: any = await Tournament.findById(game.tournament);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const userId = session ? String((session.user as any).id) : "";
  const isWhite = String(game.whiteUser || "") === userId || (normalizedGuest && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest);
  const isBlack = String(game.blackUser || "") === userId || (normalizedGuest && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest);
  if (!isWhite && !isBlack) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (isWhite) {
    game.whiteOnlineAt = new Date();
    game.whiteDisconnectedAt = undefined;
  }
  if (isBlack) {
    game.blackOnlineAt = new Date();
    game.blackDisconnectedAt = undefined;
  }
  await game.save();
  return NextResponse.json({ ok: true });
}
