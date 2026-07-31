import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { dbConnect } from "@/lib/db";
import { GoogleBusinessIntegration } from "@/models/GoogleBusinessIntegration";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
