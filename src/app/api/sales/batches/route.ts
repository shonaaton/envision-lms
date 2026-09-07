import { NextResponse } from "next/server";
import { getBatchVacancy } from "@/lib/batchVacancy";
import { requireSalesViewer } from "@/lib/salesAudit";

export const dynamic = "force-dynamic";

/** Refresh feed for the vacancy board. No export branch, by design. */
export async function GET() {
  const viewer = await requireSalesViewer("batchVacancy");
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getBatchVacancy());
}
