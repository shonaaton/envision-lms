import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { updateLead } from "@/lib/branch/leads";

export const dynamic = "force-dynamic";

/** `{ status?, note? }`, or `{ action: "resend" }` to send the slots and fees again, or `{ action: "message" }` for the text only. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await updateLead(access.branch, params.id, await req.json(), { id: access.actorId, name: String(access.user.name || "") }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
