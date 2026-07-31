import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { syncGoogleReviews } from "@/lib/googleReviews";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireAdminApiAccess(req, "manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const syncedCount = await syncGoogleReviews();
    return NextResponse.json({ ok: true, syncedCount });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not sync Google reviews." }, { status: 400 });
  }
}
