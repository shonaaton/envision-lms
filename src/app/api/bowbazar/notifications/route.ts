import { NextResponse } from "next/server";
import { branchNotifications } from "@/lib/branch/comms";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** `?kind=students|staff`: portal notices this centre's accounts got. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ notifications: await branchNotifications(access.branch, { kind: new URL(req.url).searchParams.get("kind") || "" }) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
