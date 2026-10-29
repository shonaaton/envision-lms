import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { addToWaitlist, listWaitlist } from "@/lib/branch/waitlist";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("view");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ waitlist: await listWaitlist(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** `{ slotId, name, phone, note }` */
export async function POST(req: Request) {
  const access = await requireBranchAccess("students");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ waitlist: await addToWaitlist(access.branch, await req.json(), { id: access.actorId, name: access.user.name }) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
