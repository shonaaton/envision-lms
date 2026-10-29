import { NextResponse } from "next/server";
import { addHoliday, listHolidays } from "@/lib/branch/comms";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json({ holidays: await listHolidays(access.branch) });
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** `{ date, reason, slotIds (empty = whole centre), notify }` */
export async function POST(req: Request) {
  const access = await requireBranchAccess("messages");
  if (!access) return forbidden();
  try {
    return NextResponse.json(await addHoliday(access.branch, await req.json(), { id: access.actorId, name: access.user.name }));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
