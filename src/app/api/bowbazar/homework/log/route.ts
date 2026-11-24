import { NextResponse } from "next/server";
import { clearHomeworkLog, homeworkLogCsv, listHomeworkLog, parseLogFilters } from "@/lib/branch/homeworkTemplates";
import { branchErrorResponse, forbidden, requireBranchAccess } from "@/lib/branch/http";

export const dynamic = "force-dynamic";

/** Bowbazar's homework auto-share log; `?format=csv` downloads it. */
export async function GET(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const params = new URL(req.url).searchParams;
    const filters = parseLogFilters(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await homeworkLogCsv(access.branch, filters), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bowbazar-homework-log.csv"`,
        },
      });
    }
    return NextResponse.json(await listHomeworkLog(access.branch, filters, Number(params.get("page") || 1)));
  } catch (error) {
    return branchErrorResponse(error);
  }
}

/** `{ action: "clear" | "restore", ids }`: hides log lines or brings them back. */
export async function POST(req: Request) {
  const access = await requireBranchAccess("attendance");
  if (!access) return forbidden();
  try {
    const body = await req.json();
    const actor = { id: access.actorId, name: String(access.user.name || "") };
    return NextResponse.json(await clearHomeworkLog(access.branch, body?.ids, body?.action === "restore", actor));
  } catch (error) {
    return branchErrorResponse(error);
  }
}
