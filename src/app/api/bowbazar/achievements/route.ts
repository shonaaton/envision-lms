import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { listAchievements, saveAchievement } from "@/lib/branch/records";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("achievements");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ achievements: await listAchievements(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** Multipart: the fields plus an optional `image`. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("achievements");
  if (!access) return forbidden();
  try {
    const form = await req.formData();
    const fields = Object.fromEntries(Array.from(form.entries()).filter(([, value]) => typeof value === "string"));
    const image = form.get("image");
    return NextResponse.json(await saveAchievement(access.branch, fields, image && typeof image !== "string" ? image : null, { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
