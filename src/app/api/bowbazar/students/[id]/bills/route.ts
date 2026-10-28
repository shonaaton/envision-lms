import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { studentBills } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ bills: await studentBills(access.branch, params.id) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
