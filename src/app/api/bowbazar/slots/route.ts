import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { listSlots, saveSlot, seedDefaultSlots } from "@/lib/branch/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("view");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ slots: await listSlots(access.branch), canEdit: access.can.has("slots") });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const access = await requireBranchAccess("slots");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    if (body?.seedDefaults) return NextResponse.json({ created: await seedDefaultSlots(access.branch) });
    const slot = await saveSlot(access.branch, body);
    return NextResponse.json({ id: String(slot._id) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
