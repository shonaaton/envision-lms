import { NextResponse } from "next/server";
import { requireSalesViewer } from "@/lib/salesAudit";
import { getSalesDirectory } from "@/lib/salesDirectory";

export const dynamic = "force-dynamic";

/** Refresh feed for the directory page. No export branch, by design. */
export async function GET() {
  const viewer = await requireSalesViewer("salesDirectory");
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getSalesDirectory());
}
