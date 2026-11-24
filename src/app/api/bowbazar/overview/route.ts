import { NextResponse } from "next/server";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";
import { branchOverview } from "@/lib/branch/service";
import { registerDay } from "@/lib/branch/attendance";
import { todayKey } from "@/lib/branch/rules";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("view");
  if (!access) return forbidden();
  try {
    const [overview, today] = await Promise.all([branchOverview(access.branch), registerDay(access.branch, todayKey())]);
    const canStudents = access.can.has("students");
    return NextResponse.json({
      ...overview,
      // A coach sees seats, not money, and no admin to-dos.
      totals: access.can.has("fees") ? overview.totals : null,
      loginsNotSent: canStudents ? overview.loginsNotSent : 0,
      detailsMissing: canStudents ? overview.detailsMissing : 0,
      today: { date: today.date, classes: today.classes },
    });
  } catch (error) {
    return branchErrorResponse(error);
  }
}
