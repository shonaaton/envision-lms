import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { runTournamentTick } from "@/lib/tournamentLifecycle";

/**
 * External trigger for the lifecycle worker.
 *
 * The in-process scheduler in `instrumentation.ts` is the normal driver; this
 * endpoint exists for platform cron, for a second instance, and for an admin
 * who wants to nudge the schedule by hand. It runs the same idempotent pass, so
 * calling it alongside the scheduler is harmless.
 */

export const dynamic = "force-dynamic";

async function isAllowed(req: Request) {
  const secret = process.env.TOURNAMENT_CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  const session = await auth();
  return (session?.user as any)?.role === "admin";
}

async function tick(req: Request) {
  if (!(await isAllowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const counts = await runTournamentTick();
  return NextResponse.json({ ok: true, counts });
}

export async function GET(req: Request) {
  return tick(req);
}

export async function POST(req: Request) {
  return tick(req);
}
