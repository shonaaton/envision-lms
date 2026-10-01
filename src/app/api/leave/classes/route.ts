import { NextResponse } from "next/server";
import { resolveLeaveViewer } from "@/lib/leave/leaveAccess";
import { forbidden, leaveErrorResponse } from "@/lib/leave/leaveHttp";
import { isValidDateKey } from "@/lib/leave/leaveRules";
import { teachingClassesOn } from "@/lib/leave/leaveService";

export const dynamic = "force-dynamic";

/** The applicant's own classes on a day, to pick from for a half-day leave. */
export async function GET(req: Request) {
  const viewer = await resolveLeaveViewer();
  if (!viewer?.canApply) return forbidden();
  try {
    const date = String(new URL(req.url).searchParams.get("date") || "");
    if (!isValidDateKey(date)) return NextResponse.json({ error: "Choose a valid date." }, { status: 400 });
    const classes = await teachingClassesOn(viewer.id, date);
    return NextResponse.json({
      classes: classes.map((item) => ({ ...item, start: item.start.toISOString(), end: item.end.toISOString() })),
    });
  } catch (error) {
    return leaveErrorResponse(error);
  }
}
