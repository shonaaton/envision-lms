import { NextResponse } from "next/server";
import { branchHomework } from "@/lib/branch/attendance";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ homework: await branchHomework(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
