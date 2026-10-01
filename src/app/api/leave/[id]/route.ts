import { NextResponse } from "next/server";
import { resolveLeaveViewer } from "@/lib/leave/leaveAccess";
import { forbidden, leaveErrorResponse } from "@/lib/leave/leaveHttp";
import { applyLeaveAction } from "@/lib/leave/leaveService";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await resolveLeaveViewer();
  if (!viewer) return forbidden();
  try {
    return NextResponse.json({ leave: await applyLeaveAction(params.id, await req.json(), viewer) });
  } catch (error) {
    return leaveErrorResponse(error);
  }
}
