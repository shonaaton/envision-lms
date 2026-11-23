import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { deleteCashEntry, updateCashEntry } from "@/lib/branch/accounts";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ line: await updateCashEntry(access.branch, params.id, await req.json(), { id: access.actorId, name: access.user.name }) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await deleteCashEntry(access.branch, params.id, { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
