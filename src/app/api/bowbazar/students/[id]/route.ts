import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { resetStudentPassword, setStudentStatus, updateStudent } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

/** `action`: "update" (details, slots, fee), "status" (active / inactive) or "resetPassword". */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    if (body?.action === "status") {
      await setStudentStatus(access.branch, params.id, body, access.actorId);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "resetPassword") return NextResponse.json(await resetStudentPassword(access.branch, params.id));
    await updateStudent(access.branch, params.id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
