import { NextResponse } from "next/server";
import { finishBranchLiveClass } from "@/lib/branch/live";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/**
 * The live room's end-of-class summary for a branch's online class: the
 * attendance goes into that day's branch register (lib/branch/live.ts), in
 * place of the online academy's /api/attendance.
 */
export async function POST(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    await finishBranchLiveClass(access.branch, body, { id: access.actorId, name: String(access.user.name || "") });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
