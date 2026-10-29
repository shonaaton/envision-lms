import { NextResponse } from "next/server";
import { cancelChange, decideChange } from "@/lib/branch/changes";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** `action`: "approve", "reject" (with `note`) or "cancel" (a waiting request, or a one-week move still to come). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const actor = { id: access.actorId, name: String(access.user.name || ""), staff: true };
    if (body?.action === "cancel") {
      await cancelChange(access.branch, params.id, actor);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await decideChange(access.branch, params.id, { approve: body?.action === "approve", note: body?.note }, actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
