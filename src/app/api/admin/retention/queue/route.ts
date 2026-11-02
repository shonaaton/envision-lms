import { NextResponse } from "next/server";
import { monthlyQueue } from "@/lib/retention/familyCallService";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";

export const dynamic = "force-dynamic";

/** This month's families with their call state: the Today, Monthly calls and Renewals tabs. */
export async function GET() {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await monthlyQueue());
}
