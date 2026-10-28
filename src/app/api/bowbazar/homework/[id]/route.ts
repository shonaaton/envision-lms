import { NextResponse } from "next/server";
import { unassignHomework } from "@/lib/branch/attendance";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Takes `?user=` off this homework; the register comes back updated. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const userId = new URL(req.url).searchParams.get("user") || "";
    return NextResponse.json({ register: await unassignHomework(access.branch, params.id, userId) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
