import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { sendMonthlyReports } from "@/lib/branch/reports";

export const dynamic = "force-dynamic";

/** Sends last month's report now to every family that hasn't had it. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await sendMonthlyReports(access.branch, undefined, req));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
