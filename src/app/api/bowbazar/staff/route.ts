import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { createStaff, listStaff } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ staff: await listStaff(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await createStaff(access.branch, await req.json(), access.actorId));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
