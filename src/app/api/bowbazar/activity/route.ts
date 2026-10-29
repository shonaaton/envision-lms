import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { branchActivity } from "@/lib/branch/records";

export const dynamic = "force-dynamic";

/** `?days=&actor=&q=`: the branch's activity log, for its admin. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("activity");
  if (!access) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(await branchActivity(access.branch, { days: Number(params.get("days") || 30), actorId: params.get("actor") || "", q: params.get("q") || "" }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
