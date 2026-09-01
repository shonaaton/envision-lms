import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { enqueueDueChessSyncs } from "@/lib/chess/sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const configuredSecret = process.env.CHESS_SYNC_SECRET || process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-chess-sync-secret") || new URL(req.url).searchParams.get("secret");
  if (configuredSecret && providedSecret === configuredSecret) {
    const jobs = await enqueueDueChessSyncs();
    return NextResponse.json({ queued: jobs.length });
  }

  const session = await auth();
  if (!session?.user || !(await canAccessFeature("playerAnalytics", session.user as any, "sync"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const jobs = await enqueueDueChessSyncs();
  return NextResponse.json({ queued: jobs.length });
}
