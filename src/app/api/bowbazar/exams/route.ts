import { NextResponse } from "next/server";
import { assignBranchExam, branchExams } from "@/lib/branch/exams";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("exams");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await branchExams(access.branch));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** `{ tier, levelNumber, studentIds, slotIds }` */
export async function POST(req: Request) {
  const access = await requireBranchAccess("exams");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await assignBranchExam(access.branch, await req.json(), { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
