import { NextResponse } from "next/server";
import { cancelHoliday } from "@/lib/branch/comms";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    await cancelHoliday(access.branch, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
