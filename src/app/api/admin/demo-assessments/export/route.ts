import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { academyDateKey } from "@/lib/academyTime";
import { canExportDemoAssessments, demoLeadReportSheets } from "@/lib/demoAssessmentExport";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/**
 * Every demo lead - its current stage, assessment and whole journey - plus a
 * sheet listing each step. See canExportDemoAssessments for who may download it.
 */
export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canExportDemoAssessments(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = resolveFormat(new URL(req.url).searchParams.get("format"), "xlsx");
  const body = buildSpreadsheet(format, await demoLeadReportSheets());
  return new NextResponse(body, { headers: spreadsheetHeaders(format, `demo-leads-${academyDateKey(new Date())}`, body) });
}
