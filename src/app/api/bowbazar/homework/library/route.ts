import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/branch/homeworkTemplates";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** The academy's homework templates (the online ones), read-only for the branch. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(
      await listTemplates({
        q: params.get("q") || "",
        course: params.get("course") || "",
        level: params.get("level") || "",
        auto: params.get("auto") || "",
        page: Number(params.get("page") || 1),
      })
    );
  } catch (error) {
    return branchErrorResponse(error);
  }
}
