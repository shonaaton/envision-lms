import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { updateOnlineClass } from "@/lib/branch/onlineClasses";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("slots");
  if (!access) return forbidden();
  try {
    await updateOnlineClass(access.branch, params.id, await req.json(), { id: access.actorId, name: String(access.user.name || "") });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
