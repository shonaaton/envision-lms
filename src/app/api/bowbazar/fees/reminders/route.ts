import { NextResponse } from "next/server";
import { sendFeeReminders } from "@/lib/branch/feeJobs";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Sends today's fee reminders now, to every family that owes and wasn't reminded today. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("fees");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await sendFeeReminders(access.branch, { manual: true, request: req }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
