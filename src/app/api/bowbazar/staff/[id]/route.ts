import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { setStaffActive } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    await setStaffActive(access.branch, params.id, body?.isActive !== false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
