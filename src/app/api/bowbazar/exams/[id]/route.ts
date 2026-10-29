import { NextResponse } from "next/server";
import { cancelBranchExam } from "@/lib/branch/exams";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("exams");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await cancelBranchExam(access.branch, params.id, { id: access.actorId }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
