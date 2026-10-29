import { NextResponse } from "next/server";
import { changeOptions } from "@/lib/branch/changes";
import { branchErrorResponse, forbidden, requireBranchStudent } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** `?type=week&fromDate=` or `?type=permanent`: the classes the student could move to, with free seats. */
export async function GET(req: Request) {
  const me = await requireBranchStudent();
  if (!me) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    const type = params.get("type") === "permanent" ? "permanent" : "week";
    return NextResponse.json({ options: await changeOptions(me.branch, me.student, { type, fromDate: params.get("fromDate") || "" }) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
