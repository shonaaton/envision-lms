import { NextResponse } from "next/server";
import { cancelChange } from "@/lib/branch/changes";
import { branchErrorResponse, forbidden, requireBranchStudent } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Withdraw a request the centre hasn't decided yet. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const me = await requireBranchStudent();
  if (!me) return forbidden();
  try {
    await cancelChange(me.branch, params.id, me.actor, String(me.student._id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
