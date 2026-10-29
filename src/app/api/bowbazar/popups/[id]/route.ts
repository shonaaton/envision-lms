import { NextResponse } from "next/server";
import { saveBranchPopup } from "@/lib/branch/comms";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Edits a pop-up, or switches it with `{ status: "active" | "archived" }`. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await saveBranchPopup(access.branch, await req.json(), { id: access.actorId, name: access.user.name }, params.id));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
