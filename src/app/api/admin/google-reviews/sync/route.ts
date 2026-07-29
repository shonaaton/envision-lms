import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncGoogleReviews } from "@/lib/googleReviews";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const syncedCount = await syncGoogleReviews();
    return NextResponse.json({ ok: true, syncedCount });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not sync Google reviews." }, { status: 400 });
  }
}
