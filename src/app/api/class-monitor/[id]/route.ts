import { NextResponse } from "next/server";
import { resolveClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import { classMonitorErrorResponse, forbidden } from "@/lib/classMonitor/classMonitorHttp";
import { getClassMonitorReport, submitClassMonitorReport } from "@/lib/classMonitor/classMonitorService";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await resolveClassMonitorViewer();
  if (!viewer) return forbidden();
  try {
    return NextResponse.json({ report: await getClassMonitorReport(params.id) });
  } catch (error) {
    return classMonitorErrorResponse(error);
  }
}

/** Submit the form, or correct one already submitted. Closes the class's task and emails the reviewers. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const viewer = await resolveClassMonitorViewer();
  if (!viewer?.canFill) return forbidden();
  try {
    const body = await req.json();
    const report = await submitClassMonitorReport(params.id, body, { id: viewer.id, name: viewer.name });
    return NextResponse.json({ report });
  } catch (error) {
    return classMonitorErrorResponse(error);
  }
}
