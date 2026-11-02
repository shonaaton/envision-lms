import { NextResponse } from "next/server";
import { winBackList } from "@/lib/retention/familyCallService";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ rows: await winBackList() });
}
