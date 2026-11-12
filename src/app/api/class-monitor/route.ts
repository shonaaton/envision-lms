import { NextResponse } from "next/server";
import { academyDateKey } from "@/lib/academyTime";
import { resolveClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import { classMonitorErrorResponse, forbidden } from "@/lib/classMonitor/classMonitorHttp";
import { classMonitorStartKey, isDateKey } from "@/lib/classMonitor/classMonitorRules";
import { listClassMonitorDay } from "@/lib/classMonitor/classMonitorService";

export const dynamic = "force-dynamic";

/** Every class on one academy day (`?date=YYYY-MM-DD`, today by default) with its form. */
export async function GET(req: Request) {
  const viewer = await resolveClassMonitorViewer();
  if (!viewer) return forbidden();
  try {
    const requested = new URL(req.url).searchParams.get("date");
    const today = academyDateKey(new Date());
    const date = isDateKey(requested) ? requested : today;
    const startKey = classMonitorStartKey();
    const reports = date < startKey ? [] : await listClassMonitorDay(date);
    return NextResponse.json({ date, today, startKey, reports });
  } catch (error) {
    return classMonitorErrorResponse(error);
  }
}
