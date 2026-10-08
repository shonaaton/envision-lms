import { NextResponse } from "next/server";
import { resolveLeaveViewer } from "@/lib/leave/leaveAccess";
import { forbidden, leaveErrorResponse } from "@/lib/leave/leaveHttp";
import { isValidDateKey } from "@/lib/leave/leaveRules";
import { teachingClassesOn } from "@/lib/leave/leaveService";

export const dynamic = "force-dynamic";

/**
 * The applicant's own classes on a day, to pick from for a half-day leave.
 * With `?user=`, someone else's, for an admin or Sub Admin recording their leave.
 */
export async function GET(req: Request) {
  const viewer = await resolveLeaveViewer();
  const params = new URL(req.url).searchParams;
  const user = String(params.get("user") || "");
  const forOther = Boolean(user) && user !== viewer?.id;
  if (!viewer || !(forOther ? viewer.canApplyForOthers : viewer.canApply)) return forbidden();
  try {
    if (forOther && !/^[a-f0-9]{24}$/i.test(user)) return NextResponse.json({ error: "Choose a staff member." }, { status: 400 });
    const date = String(params.get("date") || "");
    if (!isValidDateKey(date)) return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
    const classes = await teachingClassesOn(forOther ? user : viewer.id, date);
    return NextResponse.json({
      classes: classes.map((item) => ({ ...item, start: item.start.toISOString(), end: item.end.toISOString() })),
    });
  } catch (error) {
    return leaveErrorResponse(error);
  }
}
