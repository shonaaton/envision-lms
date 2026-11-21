import { NextResponse } from "next/server";
import { requireRetentionAccess, retentionActor } from "@/lib/retention/retentionAccess";
import { errorMessage } from "@/lib/retention/routeErrors";
import { applyTournamentAction, tournamentBoard } from "@/lib/retention/tournamentDetailsService";

export const dynamic = "force-dynamic";

/** The Tournament details tab: `?month=YYYY-MM` (defaults to this month). */
export async function GET(req: Request) {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const month = new URL(req.url).searchParams.get("month");
  return NextResponse.json(await tournamentBoard(month, retentionActor(session).id));
}

/** Mark sent / not sent, fix a student's place, ask Saptarshi for a place's tournaments, answer or withdraw a request. */
export async function POST(req: Request) {
  const session = await requireRetentionAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await applyTournamentAction(body, retentionActor(session)));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save.") }, { status: 400 });
  }
}
