import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { changeClassSession } from "@/lib/branch/classSessions";

export const dynamic = "force-dynamic";

/** Changes one date of an online class: cancel, restore, reschedule, extra class, students for that class only. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("slots");
  if (!access) return forbidden();
  try {
    const result = await changeClassSession(access.branch, params.id, await req.json(), { id: access.actorId, name: String(access.user.name || "") });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
