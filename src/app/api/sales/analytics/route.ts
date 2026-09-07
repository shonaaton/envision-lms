import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { canAccessFeature } from "@/lib/featureAccess";
import { resolveRange } from "@/lib/feesAnalytics";
import { getSalesAnalytics } from "@/lib/salesAnalytics";

export const dynamic = "force-dynamic";

/**
 * The sales dashboard feed.
 *
 * There is deliberately no `?export=` branch here. The sales workspace is meant
 * to be readable and not extractable, and the cleanest way to guarantee that is
 * for the export code path not to exist on this route at all.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canAccessFeature("salesPerformance", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const url = new URL(req.url);
  const { from, to } = resolveRange(url.searchParams.get("from"), url.searchParams.get("to"));
  return NextResponse.json(await getSalesAnalytics({ from, to }));
}
