import { NextResponse } from "next/server";
import { listAdmissions, startAdmission } from "@/lib/branch/admissions";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ admissions: await listAdmissions(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** Starts an admission and sends the family the form link. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    return NextResponse.json(await startAdmission(access.branch, await req.json(), actor, req));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
