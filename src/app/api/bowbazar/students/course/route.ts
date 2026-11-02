import { NextResponse } from "next/server";
import { setStudentsCourse } from "@/lib/branch/courses";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Puts several students on one course level: `{ studentIds, courseId, levelId }`; an empty courseId takes them off. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const studentIds = Array.isArray(body?.studentIds) ? body.studentIds.map(String) : [];
    return NextResponse.json(await setStudentsCourse(access.branch, studentIds, body, access.actorId));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
