import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { recordActivity } from "@/lib/activity";
import { randomBytes } from "crypto";
import { emitTournamentUpdate } from "@/lib/tournamentSocketServer";

export const dynamic = "force-dynamic";

const editableFields = [
  "name",
  "description",
  "entryRestrictions",
  "rated",
  "allowBerserk",
  "arenaStreaks",
  "chatEnabled",
  "lateJoiningAllowed",
  "timeControlMinutes",
  "incrementSeconds",
  "arenaDurationMinutes",
  "rounds",
  "breakBetweenRoundsMinutes",
];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (["completed", "finished", "cancelled"].includes(String(tournament.status || ""))) {
    return NextResponse.json({ error: "Completed or cancelled tournaments are read-only." }, { status: 400 });
  }

  const body = await req.json();
  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) tournament[field] = body[field];
  }
  if (body.startAt) tournament.startAt = new Date(body.startAt);
  if (body.startingPosition) tournament.startingPosition = body.startingPosition;
  if (body.externalInvite) {
    const current = tournament.externalInvite || {};
    const enabled = Boolean(body.externalInvite.enabled);
    tournament.externalInvite = {
      enabled,
      token: enabled ? String(current.token || randomBytes(24).toString("hex")) : "",
      password: body.externalInvite.accessMode === "password" ? String(body.externalInvite.password || current.password || "") : "",
      entryCode: body.externalInvite.accessMode === "entry_code" ? String(body.externalInvite.entryCode || current.entryCode || "") : "",
      accessMode: String(body.externalInvite.accessMode || current.accessMode || "private"),
      createdAt: current.createdAt || new Date(),
      expiresAt: body.externalInvite.expiresAt ? new Date(body.externalInvite.expiresAt) : undefined,
    };
  }
  tournament.adminActions = [...(tournament.adminActions || []), {
    actor: (session!.user as any).id,
    action: "tournament.edited",
    note: "Tournament settings edited.",
    metadata: { fields: Object.keys(body) },
    createdAt: new Date(),
  }];
  await tournament.save();
  await recordActivity({
    actor: (session!.user as any).id,
    type: "tournament.edited",
    label: `Edited tournament ${tournament.name}`,
    entityType: "Tournament",
    entityId: tournament._id.toString(),
    metadata: { fields: Object.keys(body) },
  });
  emitTournamentUpdate(tournament._id.toString(), "edited");
  return NextResponse.json({ ok: true, tournament });
}
