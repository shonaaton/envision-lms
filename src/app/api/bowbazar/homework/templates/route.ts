import { NextResponse } from "next/server";
import { searchTemplates } from "@/lib/branch/attendance";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ templates: await searchTemplates(new URL(req.url).searchParams.get("q") || "") });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
