import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cronAuth";
import { processDueClassSessionReminders } from "@/lib/classSessionNotifications";

export const dynamic = "force-dynamic";

async function processReminders(req: Request) {
  const authorized = await authorizeCronRequest(req, "class_session_reminders", ["admin", "sub-admin"]);
  if (!authorized.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const counts = await processDueClassSessionReminders();
  return NextResponse.json({ ok: true, counts });
}

export async function GET(req: Request) {
  return processReminders(req);
}

export async function POST(req: Request) {
  return processReminders(req);
}
