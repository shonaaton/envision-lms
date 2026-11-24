import { NextResponse } from "next/server";
import { createHomework } from "@/lib/branch/homeworkAssign";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Homework built by hand, for classes or students. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    return NextResponse.json(await createHomework(access.branch, await req.json(), actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
