import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { updateOnlineClass } from "@/lib/branch/onlineClasses";
import { deleteOnlineClass } from "@/lib/branch/classSessions";

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

/** Deletes the weekly class; `?notify=0` skips telling the families. Past registers stay. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("slots");
  if (!access) return forbidden();
  try {
    const notify = new URL(req.url).searchParams.get("notify") !== "0";
    const result = await deleteOnlineClass(access.branch, params.id, { notify }, { id: access.actorId, name: String(access.user.name || "") });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
