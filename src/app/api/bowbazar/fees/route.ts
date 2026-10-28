import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { createBill, monthReport } from "@/lib/branch/service";
import { monthKey } from "@/lib/branch/rules";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    const month = new URL(req.url).searchParams.get("month") || monthKey();
    return NextResponse.json(await monthReport(access.branch, month));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** A one-off bill for a student and month. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await createBill(access.branch, await req.json()));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
