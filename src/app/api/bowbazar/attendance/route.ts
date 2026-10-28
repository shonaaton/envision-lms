import { NextResponse } from "next/server";
import { registerDay } from "@/lib/branch/attendance";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { todayKey } from "@/lib/branch/rules";

export const dynamic = "force-dynamic";

/** The classes on `?date=` (default today) and how far each register has got. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const date = new URL(req.url).searchParams.get("date") || todayKey();
    return NextResponse.json(await registerDay(access.branch, date));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
