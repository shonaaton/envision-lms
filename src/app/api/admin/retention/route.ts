import { NextResponse } from "next/server";
import { requireRetentionAccess } from "@/lib/retention/retentionAccess";
import { retentionOverview } from "@/lib/retention/retentionService";
import { processRetentionSweep } from "@/lib/retention/retentionSweep";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireRetentionAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await retentionOverview());
}

/** "Check now": runs today's sweep again on demand, e.g. after fixing attendance. */
export async function POST() {
  const session = await requireRetentionAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const summary = await processRetentionSweep(new Date(), { force: true });
  return NextResponse.json({ summary, ...(await retentionOverview()) });
}
