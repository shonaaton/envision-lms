import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { closeWaitlistEntry } from "@/lib/branch/waitlist";

export const dynamic = "force-dynamic";

/** `{ status: "placed" | "removed" }` */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    return NextResponse.json({ waitlist: await closeWaitlistEntry(access.branch, params.id, body?.status) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
