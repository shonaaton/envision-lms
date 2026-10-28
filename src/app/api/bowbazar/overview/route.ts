import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { branchOverview } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("view");
  if (!access) return forbidden();
  try {
    const overview = await branchOverview(access.branch);
    // A coach sees seats, not money.
    return NextResponse.json(access.can.has("fees") ? overview : { ...overview, totals: null });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
