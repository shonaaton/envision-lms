import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cronAuth";
import { processDueAskCoachEmailReminders } from "@/lib/askCoachEmailReminders";

export const dynamic = "force-dynamic";

async function processReminders(req: Request) {
  const authorized = await authorizeCronRequest(req, "ask_coach_email_reminders");
  if (!authorized.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const counts = await processDueAskCoachEmailReminders();
  return NextResponse.json({ ok: true, counts });
}

export async function GET(req: Request) {
  return processReminders(req);
}

export async function POST(req: Request) {
  return processReminders(req);
}
