import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const source: any = await Tournament.findById(params.id).lean();
  if (!source) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  const startAt = new Date(source.startAt || Date.now());
  startAt.setDate(startAt.getDate() + 7);
  const clone = await Tournament.create({
    name: `${source.name} Copy`,
    description: source.description,
    type: source.type,
    status: "created",
    arenaDurationMinutes: source.arenaDurationMinutes,
    rounds: source.rounds,
    timeControlMinutes: source.timeControlMinutes,
    incrementSeconds: source.incrementSeconds,
    breakBetweenRoundsMinutes: source.breakBetweenRoundsMinutes,
    rated: source.rated,
    allowBerserk: source.allowBerserk,
    arenaStreaks: source.arenaStreaks,
    chatEnabled: source.chatEnabled,
    lateJoiningAllowed: source.lateJoiningAllowed,
    entryRestrictions: source.entryRestrictions,
    startAt,
    startingPosition: source.startingPosition,
    access: source.access,
    createdBy: (session!.user as any).id,
    parentTournament: source._id,
  });
  await recordActivity({ actor: (session!.user as any).id, type: "tournament.cloned", label: `Cloned tournament ${source.name}`, entityType: "Tournament", entityId: clone._id.toString() });
  return NextResponse.json({ ok: true, tournamentId: clone._id.toString() });
}
