import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { DEFAULT_ROLE_ACCESS } from "@/lib/branch/rules";
import { getRoleAccess, saveRoleAccess } from "@/lib/branch/settings";

export const dynamic = "force-dynamic";

/** What managers and coaches may do at the branch; only its admin changes it. */
export async function GET() {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    const saved = await getRoleAccess(access.branch);
    return NextResponse.json({ roleAccess: { manager: saved?.manager ?? DEFAULT_ROLE_ACCESS.manager, coach: saved?.coach ?? DEFAULT_ROLE_ACCESS.coach }, defaults: DEFAULT_ROLE_ACCESS });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ roleAccess: await saveRoleAccess(access.branch, await req.json(), access.actorId) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
