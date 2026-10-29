import { NextResponse } from "next/server";
import { listBranchPopups, saveBranchPopup } from "@/lib/branch/comms";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ popups: await listBranchPopups(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await saveBranchPopup(access.branch, await req.json(), { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
