import { NextResponse } from "next/server";
import { assignTemplate } from "@/lib/branch/homeworkAssign";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** `{ templateId, slotIds, studentIds, dueDate }`: sets a template as homework. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    return NextResponse.json(await assignTemplate(access.branch, await req.json(), actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
