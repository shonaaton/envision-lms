import { NextResponse } from "next/server";
import { assignHomework } from "@/lib/branch/attendance";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Sets a homework template for students on the register: `{ templateId, studentIds, dueDate }`. */
export async function POST(req: Request, { params }: { params: { slotId: string; date: string } }) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    return NextResponse.json(await assignHomework(access.branch, params.slotId, params.date, body, actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
