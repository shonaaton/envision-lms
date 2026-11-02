import { NextResponse } from "next/server";
import { courseCatalog } from "@/lib/branch/courses";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** The academy's courses, levels and topics: the same syllabus the online classes follow. */
export async function GET() {
  const access = await requireBranchAccess("view");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ courses: await courseCatalog() });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
