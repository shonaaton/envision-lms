import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { listLeads } from "@/lib/branch/leads";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ leads: await listLeads(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
