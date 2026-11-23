import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { addCashEntry, listCashbook } from "@/lib/branch/accounts";

export const dynamic = "force-dynamic";

/** The branch cashbook: statement rows, hand-added lines and portal fee payments. */
export async function GET() {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await listCashbook(access.branch));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ line: await addCashEntry(access.branch, await req.json(), { id: access.actorId, name: access.user.name }) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
