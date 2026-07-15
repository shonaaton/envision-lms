import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { playerKeyForExternal, playerKeyForUser, recalculateTournamentStandings, setTournamentPlayerState, syncSwissRoundState } from "@/lib/tournamentEngine";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  const body = await req.json();
  const playerKey = String(body.playerKey || "");
  const reason = String(body.reason || "Participant removed by admin.").trim().slice(0, 500);
  if (!playerKey) return NextResponse.json({ error: "Missing playerKey" }, { status: 400 });
  if (playerKey.startsWith("user:")) {
    const userId = playerKey.replace("user:", "");
    tournament.participants = (tournament.participants || []).filter((item: any) => item?.toString?.() !== userId);
    setTournamentPlayerState(tournament, playerKeyForUser(userId), "withdrawn");
  } else if (playerKey.startsWith("external:")) {
    const username = playerKey.replace("external:", "");
    tournament.externalParticipants = (tournament.externalParticipants || []).filter((item: any) => playerKeyForExternal(item.username) !== `external:${username}`);
    setTournamentPlayerState(tournament, `external:${username}`, "withdrawn");
  }
  const activeGames = await TournamentGame.find({
    tournament: params.id,
    status: "active",
    $or: [{ whiteKey: playerKey }, { blackKey: playerKey }],
  });
  for (const game of activeGames as any[]) {
    game.status = "aborted";
    game.result = "*";
    game.termination = "manual";
    game.winnerKey = "";
    game.drawOfferBy = "";
    game.endedAt = new Date();
    await game.save();
  }
  if (activeGames.length) {
    tournament.roundsData = (tournament.roundsData || []).map((round: any) => ({
      ...round,
      pairings: (round.pairings || []).map((pairing: any) =>
        activeGames.some((game: any) => String(game._id) === String(pairing.gameId))
          ? { ...pairing, status: "aborted", result: "*" }
          : pairing
      ),
    }));
  }
  if (tournament.type === "swiss") await syncSwissRoundState(tournament);
  await recalculateTournamentStandings(tournament);

  tournament.adminActions = [...(tournament.adminActions || []), {
    actor: (session!.user as any).id,
    action: "participant.removed",
    note: reason,
    metadata: { playerKey, abortedGames: activeGames.length },
    createdAt: new Date(),
  }];
  await tournament.save();
  await recordActivity({ actor: (session!.user as any).id, type: "tournament.participant_removed", label: `Removed participant from ${tournament.name}`, entityType: "Tournament", entityId: tournament._id.toString(), metadata: { playerKey, abortedGames: activeGames.length, reason } });
  return NextResponse.json({ ok: true, abortedGames: activeGames.length });
}
