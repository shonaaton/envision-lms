import { NextResponse } from "next/server";
import { listChanges, requestChange } from "@/lib/branch/changes";
import { BranchError } from "@/lib/branch/service";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { BranchStudent } from "@/models/Branch";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await listChanges(access.branch));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** Staff move a student themselves (`studentId` plus the same fields a family sends); approved at once. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const student: any = /^[a-f0-9]{24}$/i.test(String(body?.studentId || ""))
      ? await BranchStudent.findOne({ _id: body.studentId, branch: access.branch }).lean()
      : null;
    if (!student) throw new BranchError("Student not found.", 404);
    const actor = { id: access.actorId, name: String(access.user.name || ""), staff: true };
    return NextResponse.json(await requestChange(access.branch, student, body, actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
