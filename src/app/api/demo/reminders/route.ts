import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { processDueDemoReminders } from "@/lib/demoWorkflow";

export const dynamic = "force-dynamic";

async function isAllowed(req: Request) {
  const secret = process.env.DEMO_REMINDER_SECRET || process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret && provided === secret) return true;
  const session = await auth();
  return ["admin", "sub-admin"].includes(String((session?.user as any)?.role || ""));
}

async function processReminders(req: Request) {
  if (!(await isAllowed(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const counts = await processDueDemoReminders();
  return NextResponse.json({ ok: true, counts });
}

export async function GET(req: Request) {
  return processReminders(req);
}

export async function POST(req: Request) {
  return processReminders(req);
}
