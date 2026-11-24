import { NextResponse } from "next/server";
import { assignFromLog } from "@/lib/branch/homeworkTemplates";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** `{ templateId, dueDate }`: sets homework for the student a log line missed. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    return NextResponse.json({ row: await assignFromLog(access.branch, params.id, await req.json(), actor) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
