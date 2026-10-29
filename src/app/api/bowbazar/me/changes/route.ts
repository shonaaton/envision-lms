import { NextResponse } from "next/server";
import { myChanges, requestChange } from "@/lib/branch/changes";
import { branchErrorResponse, forbidden, requireBranchStudent } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** The student's own class-time requests. */
export async function GET() {
  const me = await requireBranchStudent();
  if (!me) return forbidden();
  try {
    return NextResponse.json({ changes: await myChanges(me.student) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** Ask the centre: `{ type: "week" | "permanent", fromSlot, fromDate, toSlot, reason }`. */
export async function POST(req: Request) {
  const me = await requireBranchStudent();
  if (!me) return forbidden();
  try {
    return NextResponse.json(await requestChange(me.branch, me.student, await req.json(), me.actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
