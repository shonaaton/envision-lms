import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { playerKeyForExternal, playerKeyForUser, tournamentPgnTimeControl } from "@/lib/tournamentEngine";
import { buildPgn } from "@/lib/tournament/chessRules";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";

export const dynamic = "force-dynamic";

/**
 * PGN is rebuilt from the recorded move history rather than read from the
 * stored `pgn` field. Games played before this rebuild stored only their last
 * move, so trusting that field would export broken games.
 */
function gamePgn(game: any, tournament: any) {
  try {
    return buildPgn(game.moveHistorySAN, {
      event: `${tournament.name || "Tournament"} (${game.source === "arena" ? "Arena" : "Swiss"})`,
      round: game.roundNumber || "-",
      white: game.whiteName || "?",
      black: game.blackName || "Bye",
      result: game.result || "*",
      termination: game.termination || undefined,
      timeControl: tournamentPgnTimeControl(tournament),
      startFen: game.startFen || null,
      date: game.startedAt || game.createdAt,
    });
  } catch {
    // A game whose history will not replay still exports its moves as text,
    // rather than being silently dropped from the download.
    return [
      `[Event "${tournament.name || "Tournament"}"]`,
      `[White "${game.whiteName || "?"}"]`,
      `[Black "${game.blackName || "Bye"}"]`,
      `[Result "${game.result || "*"}"]`,
      "",
      `${(game.moveHistorySAN || []).join(" ") || "*"} ${game.result || "*"}`,
    ].join("\n");
  }
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
  const body = games.map((game: any) => gamePgn(game, tournament)).join("\n\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-my-games.pgn"`,
    },
  });
}
