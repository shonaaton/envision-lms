import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { pendingByStudent } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ students: await pendingByStudent(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
