import { canAccessFeature } from "@/lib/featureAccess";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { recordActivity } from "@/lib/activity";
import { randomBytes } from "crypto";
import { emitTournamentUpdate } from "@/lib/tournamentSocketServer";
import { TournamentGame } from "@/models/TournamentGame";

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
];

/**
 * The schedule: when it starts, the clock and how long it runs. Changing any
 * of these once boards exist would give players in one event different
 * games, so they stay open only until the first pairing.
 */
const scheduleFields = ["startAt", "initialClockSeconds", "timeControlMinutes", "incrementSeconds", "arenaDurationMinutes", "rounds", "breakBetweenRoundsMinutes"];

const LIVE_STATUSES = ["live", "playing"];

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !(await canAccessFeature("tournaments", session.user as any, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (["completed", "finished", "cancelled"].includes(String(tournament.status || ""))) {
    return NextResponse.json({ error: "Completed or cancelled tournaments are read-only." }, { status: 400 });
  }

  const body = await req.json();
  const has = (field: string) => Object.prototype.hasOwnProperty.call(body, field) && body[field] !== null && body[field] !== "";

  // Only a real change to the schedule counts, so re-saving the dialog with
  // the same values still works after the start.
  const currentClock = Number(tournament.initialClockSeconds) > 0 ? Number(tournament.initialClockSeconds) : Number(tournament.timeControlMinutes || 0) * 60;
  const current: Record<string, number> = {
    startAt: new Date(tournament.startAt || 0).getTime(),
    initialClockSeconds: currentClock,
    timeControlMinutes: currentClock / 60,
    incrementSeconds: Number(tournament.incrementSeconds || 0),
    arenaDurationMinutes: Number(tournament.arenaDurationMinutes || 0),
    rounds: Number(tournament.rounds || 0),
    breakBetweenRoundsMinutes: Number(tournament.breakBetweenRoundsMinutes || 0),
  };
  const asNumber = (field: string) => (field === "startAt" ? new Date(body.startAt).getTime() : Number(body[field]));
  const scheduleChanged = scheduleFields.filter((field) => has(field) && asNumber(field) !== current[field]);
  if (scheduleChanged.length) {
    const started = LIVE_STATUSES.includes(String(tournament.status || "")) || Boolean(await TournamentGame.exists({ tournament: tournament._id }));
    if (started) return badRequest("The start time, time control and length can't change once games have been paired.");
  }

  // Validate everything before writing, so a bad value saves nothing.
  let nextStart: Date | null = null;
  if (has("startAt")) {
    nextStart = new Date(body.startAt);
    if (Number.isNaN(nextStart.getTime())) return badRequest("Choose a valid start date and time.");
  }
  let clockSeconds: number | null = null;
  if (has("initialClockSeconds") || has("timeControlMinutes")) {
    clockSeconds = has("initialClockSeconds") ? Math.round(Number(body.initialClockSeconds)) : Math.round(Number(body.timeControlMinutes) * 60);
    if (!Number.isFinite(clockSeconds) || clockSeconds < 15) return badRequest("Time control must be at least 15 seconds.");
  }
  let increment: number | null = null;
  if (has("incrementSeconds")) {
    increment = Math.round(Number(body.incrementSeconds));
    if (!Number.isFinite(increment) || increment < 0 || increment > 180) return badRequest("Increment must be between 0 and 180 seconds.");
  }
  let duration: number | null = null;
  if (has("arenaDurationMinutes") && tournament.type === "arena") {
    duration = Math.round(Number(body.arenaDurationMinutes));
    if (!Number.isFinite(duration) || duration < 1 || duration > 24 * 60) return badRequest("Arena length must be between 1 minute and 24 hours.");
  }
  let rounds: number | null = null;
  if (has("rounds") && tournament.type === "swiss") {
    rounds = Math.round(Number(body.rounds));
    if (!Number.isFinite(rounds) || rounds < 1 || rounds > 50) return badRequest("Rounds must be between 1 and 50.");
  }
  let breakMinutes: number | null = null;
  if (has("breakBetweenRoundsMinutes")) {
    breakMinutes = Math.round(Number(body.breakBetweenRoundsMinutes));
    if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 120) return badRequest("Break between rounds must be 0 to 120 minutes.");
  }
  if (Object.prototype.hasOwnProperty.call(body, "name") && !String(body.name || "").trim()) return badRequest("Tournament name is required.");

  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) tournament[field] = body[field];
  }
  if (typeof tournament.name === "string") tournament.name = tournament.name.trim();
  if (clockSeconds !== null) {
    // Same shape as creation: seconds are canonical, minutes kept for old readers.
    tournament.initialClockSeconds = clockSeconds;
    tournament.timeControlMinutes = clockSeconds / 60;
  }
  if (increment !== null) tournament.incrementSeconds = increment;
  if (duration !== null) tournament.arenaDurationMinutes = duration;
  if (rounds !== null) tournament.rounds = rounds;
  if (breakMinutes !== null) tournament.breakBetweenRoundsMinutes = breakMinutes;
  if (nextStart && nextStart.getTime() !== new Date(tournament.startAt || 0).getTime()) {
    // A new start time gets its own 30- and 10-minute reminders.
    tournament.startAt = nextStart;
    tournament.remindersSent = [];
    if (tournament.status === "starting_soon" && nextStart.getTime() - Date.now() > 15 * 60 * 1000) tournament.status = "upcoming";
  }
  // "Coaches can play" lives under access (lib/tournament/studentAccess.ts).
  if (typeof body.coachesCanPlay === "boolean") {
    tournament.set("access.coachesCanPlay", body.coachesCanPlay);
  }
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

/**
 * Permanent delete, admins only. Allowed for an event nobody finished a game
 * in: a cancelled one, or one that never started. A tournament with a
 * completed game has standings and ratings hanging off it, so it is cancelled
 * instead and stays on record.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Only admins can delete tournaments." }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).select("name status type");
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (LIVE_STATUSES.includes(String(tournament.status || ""))) return badRequest("End or cancel the tournament before deleting it.");
  const finishedGames = await TournamentGame.countDocuments({ tournament: tournament._id, status: "completed" });
  if (finishedGames > 0) {
    return badRequest(`${finishedGames} game${finishedGames === 1 ? " was" : "s were"} played in this tournament, so it stays on record. Cancel it instead.`);
  }
  await TournamentGame.deleteMany({ tournament: tournament._id });
  await Tournament.deleteOne({ _id: tournament._id });
  await recordActivity({
    actor: user.id,
    type: "tournament.deleted",
    label: `Deleted tournament ${tournament.name}`,
    entityType: "Tournament",
    entityId: tournament._id.toString(),
    metadata: { status: tournament.status, type: tournament.type },
  });
  emitTournamentUpdate(tournament._id.toString(), "deleted");
  return NextResponse.json({ ok: true });
}
