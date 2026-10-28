import { NextResponse } from "next/server";
import { studentHistory } from "@/lib/branch/attendance";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("view");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await studentHistory(access.branch, params.id));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
