import { NextResponse } from "next/server";
import { archiveAnnouncement } from "@/lib/branch/comms";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Takes it off families' pages. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    await archiveAnnouncement(access.branch, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
