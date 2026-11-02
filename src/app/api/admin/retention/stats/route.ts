import { NextResponse } from "next/server";
import { callerStats } from "@/lib/retention/familyCallService";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await callerStats(new URL(req.url).searchParams.get("month") || ""));
}
