import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { playerKeyForExternal, playerKeyForUser } from "@/lib/tournamentEngine";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

export const dynamic = "force-dynamic";

function fallbackPgn(game: any) {
  return [
    `[Event "${game.source === "arena" ? "Arena" : "Swiss"} Tournament"]`,
    `[White "${game.whiteName || ""}"]`,
    `[Black "${game.blackName || "Bye"}"]`,
    `[Result "${game.result || "*"}"]`,
    "",
    `${(game.moveHistorySAN || []).join(" ") || "*"}`
  ].join("\n");
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestToken = String(tournament.externalInvite?.token || "");
  const guestUsername = guestToken ? getTournamentGuestUsername(cookieStore, guestToken) : "";
  const isGuest = Boolean(guestUsername && !session);
  const playerKey = isGuest ? playerKeyForExternal(guestUsername) : session ? playerKeyForUser(String((session.user as any).id)) : "";
  if (!playerKey) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const games = await TournamentGame.find({
    tournament: params.id,
    $or: [{ whiteKey: playerKey }, { blackKey: playerKey }],
  }).sort({ createdAt: 1 }).lean();
  const body = games.map((game: any) => game.pgn || fallbackPgn(game)).join("\n\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-my-games.pgn"`,
    },
  });
}
