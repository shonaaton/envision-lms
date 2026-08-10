import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { processDueHomeworkEmailReminders } from "@/lib/homeworkEmailReminders";

export const dynamic = "force-dynamic";

async function isAllowed(req: Request) {
  const secret = process.env.HOMEWORK_REMINDER_SECRET || process.env.ASK_COACH_REMINDER_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  const session = await auth();
  return (session?.user as any)?.role === "admin";
}

async function processReminders(req: Request) {
  if (!(await isAllowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const counts = await processDueHomeworkEmailReminders();
  return NextResponse.json({ ok: true, counts });
}

export async function GET(req: Request) {
  return processReminders(req);
}

export async function POST(req: Request) {
  return processReminders(req);
}
