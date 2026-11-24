import { NextResponse } from "next/server";
import { checkTopic } from "@/lib/branch/homeworkTemplates";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Which template auto-share would send for a course level and topic. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await checkTopic(await req.json()));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
