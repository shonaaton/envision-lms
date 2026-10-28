import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { saveSlot } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("slots");
  if (!access) return forbidden();
  try {
    await saveSlot(access.branch, await req.json(), params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
