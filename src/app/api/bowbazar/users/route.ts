import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { listBranchUsers } from "@/lib/branch/users";

export const dynamic = "force-dynamic";

/** `?kind=students|staff`: the branch's accounts, for its admin. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("staff");
  if (!access) return forbidden();
  try {
    const kind = new URL(req.url).searchParams.get("kind") === "staff" ? "staff" : "students";
    return NextResponse.json({ users: await listBranchUsers(access.branch, kind), me: access.actorId });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
