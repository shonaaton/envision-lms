import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cronAuth";
import { dbConnect } from "@/lib/db";
import { processDueDemoReminders } from "@/lib/demoWorkflow";
import { processLeadOwnerFollowUps } from "@/lib/demoLeadOwner";

export const dynamic = "force-dynamic";

async function processReminders(req: Request) {
  const authorized = await authorizeCronRequest(req, "demo_reminders", ["admin", "sub-admin"]);
  if (!authorized.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const counts = await processDueDemoReminders();
  // Rides the same cron: unbooked demo accounts are flagged to their salesperson.
  // A failure here must not cost the class reminders their response.
  const leadOwner = await processLeadOwnerFollowUps().catch((error) => {
    console.error("Lead owner follow-ups failed", error);
    return { error: "failed" };
  });
  return NextResponse.json({ ok: true, counts, leadOwner });
}

export async function GET(req: Request) {
  return processReminders(req);
}

export async function POST(req: Request) {
  return processReminders(req);
}
