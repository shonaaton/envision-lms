import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { Activity } from "@/models/Activity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const type = String(url.searchParams.get("type") || "");
  const from = url.searchParams.get("from") ? new Date(String(url.searchParams.get("from"))) : null;
  const to = url.searchParams.get("to") ? new Date(String(url.searchParams.get("to"))) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const logs = await Activity.find({
    ...(type ? { type } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
  })
    .populate("actor", "name username email role batches")
    .populate("targetUser", "name username email role batches")
    .sort({ occurredAt: -1 })
    .limit(500)
    .lean();

  return NextResponse.json(logs);
}

