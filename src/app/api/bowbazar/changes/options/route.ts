import { NextResponse } from "next/server";
import { changeOptions } from "@/lib/branch/changes";
import { BranchError } from "@/lib/branch/service";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { BranchStudent } from "@/models/Branch";

export const dynamic = "force-dynamic";

/** `?studentId=&type=week&fromDate=` or `type=permanent`: where staff could move a student, with free seats. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    const studentId = params.get("studentId") || "";
    const student: any = /^[a-f0-9]{24}$/i.test(studentId) ? await BranchStudent.findOne({ _id: studentId, branch: access.branch }).lean() : null;
    if (!student) throw new BranchError("Student not found.", 404);
    const type = params.get("type") === "permanent" ? "permanent" : "week";
    return NextResponse.json({ options: await changeOptions(access.branch, student, { type, fromDate: params.get("fromDate") || "" }) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
