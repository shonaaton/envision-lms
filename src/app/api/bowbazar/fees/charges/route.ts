import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { addCharges } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

/** A one-off charge on each chosen student's bill: `{ studentIds, label, kind, amount, month, note }`. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await addCharges(access.branch, await req.json(), { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
