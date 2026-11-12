import { NextResponse } from "next/server";
import { academyDateKey } from "@/lib/academyTime";
import { resolveClassMonitorViewer } from "@/lib/classMonitor/classMonitorAccess";
import { classMonitorSheets } from "@/lib/classMonitor/classMonitorExport";
import { classMonitorErrorResponse, forbidden } from "@/lib/classMonitor/classMonitorHttp";
import { resolveReportRange } from "@/lib/classMonitor/classMonitorRules";
import { ClassMonitorError, syncClassMonitorDay } from "@/lib/classMonitor/classMonitorService";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/**
 * The Class Monitor download for a day, a month or a range: `?format=xlsx`
 * (two sheets: every class, and every student's join time) or `?format=csv`
 * (the classes sheet).
 */
export async function GET(req: Request) {
  const viewer = await resolveClassMonitorViewer();
  if (!viewer) return forbidden();
  if (!viewer.canExport) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    const today = academyDateKey(new Date());
    let range;
    try {
      range = resolveReportRange({ month: params.get("month"), date: params.get("date"), from: params.get("from"), to: params.get("to") }, today);
    } catch (error) {
      throw new ClassMonitorError((error as Error).message);
    }
    if (range.from <= today && today <= range.to) await syncClassMonitorDay(today);
    const format = resolveFormat(params.get("format"), "xlsx");
    const sheets = await classMonitorSheets(range.from, range.to);
    const body = buildSpreadsheet(format, format === "csv" ? sheets.slice(0, 1) : sheets);
    const name = range.from === range.to ? `class-monitor-${range.from}` : `class-monitor-${range.from}-to-${range.to}`;
    return new NextResponse(body, { headers: spreadsheetHeaders(format, name, body) });
  } catch (error) {
    return classMonitorErrorResponse(error);
  }
}
