import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { abortGame } from "@/lib/tournamentEngine";
import { advanceSwiss } from "@/lib/tournamentLifecycle";
import { recordActivity } from "@/lib/activity";

/**
 * Admin override: advance the Swiss round.
 *
 * Rounds advance on their own once every board finishes and the configured
 * break passes. This forces the next round when an arbiter decides not to wait
 * — for a board nobody is playing, say. Forcing past unfinished games aborts
 * them explicitly rather than leaving them to score later.
 *
 * The round lock means two admins pressing this at once still produce one
 * round, not two.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.type !== "swiss") return NextResponse.json({ error: "Only Swiss tournaments have rounds." }, { status: 400 });
  if (!["live", "playing"].includes(String(tournament.status))) {
    return NextResponse.json({ error: "The tournament is not running." }, { status: 400 });
  }
  if (Number(tournament.currentRound || 0) >= Number(tournament.rounds || 0)) {
    return NextResponse.json({ error: "All scheduled rounds have been played." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const force = body.force === true;
  const unfinished: any[] = await TournamentGame.find({
    tournament: tournament._id,
    status: "active",
    roundNumber: Number(tournament.currentRound || 0),
  });

  if (unfinished.length && !force) {
    return NextResponse.json(
      {
        error: `${unfinished.length} game${unfinished.length === 1 ? " is" : "s are"} still being played.`,
        code: "round_in_progress",
        unfinished: unfinished.length,
      },
      { status: 409 }
    );
  }

  for (const game of unfinished) await abortGame(game, "manual");

  const result = await advanceSwiss(tournament, { force: true });
  if (!result.advanced) {
    return NextResponse.json({ error: "The next round could not be created. It may already be starting." }, { status: 409 });
  }

  await Tournament.updateOne(
    { _id: tournament._id },
    {
      $push: {
        adminActions: {
          actor: (session!.user as any).id,
          action: "tournament.round_forced",
          note: String(body.reason || "Next round forced by admin.").slice(0, 500),
          metadata: { roundNumber: result.roundNumber, abortedGames: unfinished.length },
          createdAt: new Date(),
        },
      },
    }
  );
  await recordActivity({
    actor: (session!.user as any).id,
    type: "tournament.round_forced",
    label: `Forced round ${result.roundNumber} in ${tournament.name}`,
    entityType: "Tournament",
    entityId: String(tournament._id),
    metadata: { abortedGames: unfinished.length },
  });

  return NextResponse.json({ ok: true, roundNumber: result.roundNumber, abortedGames: unfinished.length });
}
