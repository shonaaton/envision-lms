import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { deleteAchievement, saveAchievement } from "@/lib/branch/records";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("achievements");
  if (!access) return forbidden();
  try {
    const form = await req.formData();
    const fields = Object.fromEntries(Array.from(form.entries()).filter(([, value]) => typeof value === "string"));
    const image = form.get("image");
    return NextResponse.json(await saveAchievement(access.branch, fields, image && typeof image !== "string" ? image : null, { id: access.actorId, name: access.user.name }, params.id));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireBranchAccess("achievements");
  if (!access) return forbidden();
  try {
    await deleteAchievement(access.branch, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
