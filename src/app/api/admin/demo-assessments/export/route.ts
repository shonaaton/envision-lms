import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { academyDateKey } from "@/lib/academyTime";
import { canExportDemoAssessments, demoAssessmentReportSheet } from "@/lib/demoAssessmentExport";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/** Full demo assessment report. Admins and the demo sub-admin only. */
export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canExportDemoAssessments(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = resolveFormat(new URL(req.url).searchParams.get("format"), "xlsx");
  const body = buildSpreadsheet(format, [await demoAssessmentReportSheet()]);
  return new NextResponse(body, { headers: spreadsheetHeaders(format, `demo-assessments-${academyDateKey(new Date())}`, body) });
}
