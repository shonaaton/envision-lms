import { NextResponse } from "next/server";
import { listAdmissions, sendDetailsForms, startAdmission } from "@/lib/branch/admissions";
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

/**
 * Starts an admission and sends the family the form link, or with
 * `action: "details"` sends the details form to existing students (`studentIds`).
 */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    const body = await req.json();
    if (body?.action === "details") return NextResponse.json(await sendDetailsForms(access.branch, body.studentIds, actor, req));
    return NextResponse.json(await startAdmission(access.branch, body, actor, req));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
