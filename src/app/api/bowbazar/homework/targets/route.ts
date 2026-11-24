import { NextResponse } from "next/server";
import { homeworkTargets } from "@/lib/branch/homeworkAssign";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** The classes and students homework can go to. */
export async function GET() {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await homeworkTargets(access.branch));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
