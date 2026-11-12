import { NextResponse } from "next/server";
import { academyDateKey } from "@/lib/academyTime";
import { resolveClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import { classMonitorErrorResponse, forbidden } from "@/lib/classMonitor/classMonitorHttp";
import { resolveReportRange } from "@/lib/classMonitor/classMonitorRules";
import { ClassMonitorError, classMonitorSummary } from "@/lib/classMonitor/classMonitorService";

export const dynamic = "force-dynamic";

/** Totals, per-day and per-coach counts and every class for `?month=`, `?date=` or `?from=&to=`. */
export async function GET(req: Request) {
  const viewer = await resolveClassMonitorViewer();
  if (!viewer) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    let range;
    try {
      range = resolveReportRange({ month: params.get("month"), date: params.get("date"), from: params.get("from"), to: params.get("to") }, academyDateKey(new Date()));
    } catch (error) {
      throw new ClassMonitorError((error as Error).message);
    }
    return NextResponse.json(await classMonitorSummary(range.from, range.to));
  } catch (error) {
    return classMonitorErrorResponse(error);
  }
}
