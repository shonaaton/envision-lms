import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { GoogleBusinessIntegration } from "@/models/GoogleBusinessIntegration";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const integration: any = await GoogleBusinessIntegration.findOne({ singletonKey: "google-business" }).lean();
  return NextResponse.json({
    connected: Boolean(integration?.refreshToken),
    connectedAt: integration?.connectedAt,
    lastSyncedAt: integration?.lastSyncedAt,
    lastSyncError: integration?.lastSyncError,
    locations: integration?.locations || [],
  });
}
