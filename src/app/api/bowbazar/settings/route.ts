import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { getBranchSettings, saveBranchSettings } from "@/lib/branch/settings";

export const dynamic = "force-dynamic";

/** Read by anyone who adds students (for the admission fee); changed by those who run fees. */
export async function GET() {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ settings: await getBranchSettings(access.branch), canEdit: access.can.has("fees") });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ settings: await saveBranchSettings(access.branch, await req.json(), access.actorId) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
