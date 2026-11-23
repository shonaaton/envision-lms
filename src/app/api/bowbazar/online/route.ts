import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { createOnlineClass, listOnlineClasses } from "@/lib/branch/onlineClasses";

export const dynamic = "force-dynamic";

/** The branch's online classes. Anyone who takes registers sees them; making them needs "slots". */
export async function GET() {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ ...(await listOnlineClasses(access.branch)), canEdit: access.can.has("slots") });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const access = await requireBranchAccess("slots");
  if (!access) return forbidden();
  try {
    const ids = await createOnlineClass(access.branch, await req.json(), { id: access.actorId, name: String(access.user.name || "") });
    return NextResponse.json({ ids });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
