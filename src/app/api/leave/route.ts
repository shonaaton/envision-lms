import { NextResponse } from "next/server";
import { resolveLeaveViewer } from "@/lib/leave/leaveAccess";
import { forbidden, leaveErrorResponse } from "@/lib/leave/leaveHttp";
import { applyForLeave, getLeaveSummary, listLeaves } from "@/lib/leave/leaveService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await resolveLeaveViewer();
  if (!viewer) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(params.get("summary") === "1" ? await getLeaveSummary(viewer) : { viewer, ...(await listLeaves(viewer)) });
  } catch (error) {
    return leaveErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const viewer = await resolveLeaveViewer();
  if (!viewer) return forbidden();
  try {
    return NextResponse.json({ leave: await applyForLeave(viewer, await req.json()) }, { status: 201 });
  } catch (error) {
    return leaveErrorResponse(error);
  }
}
