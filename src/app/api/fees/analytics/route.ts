import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isFeesManager, requireFeesAccess } from "@/lib/feesAccess";
import { getFeesAnalytics, resolveRange, type GstFilter } from "@/lib/feesAnalytics";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders, type Sheet } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

function gstParam(value: string | null): GstFilter {
  return value === "gst" || value === "non_gst" ? value : "all";
}

export async function GET(req: Request) {
  // Students hold `feeDashboard:view` for their own credits and invoices page, so
  // the feature check alone is not enough here - this endpoint returns academy-wide
  // financials and must be restricted to staff who manage fees.
  const session = await auth();
  if (!isFeesManager((session?.user as any)?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await requireFeesAccess("view", "feeDashboard"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();

  const url = new URL(req.url);
  const { from, to } = resolveRange(url.searchParams.get("from"), url.searchParams.get("to"));
  const analytics = await getFeesAnalytics({ from, to, gst: gstParam(url.searchParams.get("gst")) });

  const exportId = url.searchParams.get("export");
  if (exportId) {
    // `view` opens the dashboard; taking the rows out of it is a separate grant.
    // Without this, any role that can see a drill-down could also download it,
    // which is exactly what the read-only sales workspace must not allow.
    if (!(await requireFeesAccess("export", "feeDashboard"))) {
      return NextResponse.json({ error: "Exporting is not enabled for this account." }, { status: 403 });
    }
    const table = analytics.tables[exportId];
    if (!table) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    // Values go out raw and typed - money in paise, dates as dates - so the
    // workbook writer can format them as real numbers instead of shipping
    // pre-rendered strings a spreadsheet cannot total.
    const sheet: Sheet = {
      name: table.title,
      columns: table.columns.map((column) => ({ label: column.label, type: column.type })),
      rows: table.rows.map((row) => table.columns.map((column) => row[column.key])),
    };
    const format = resolveFormat(url.searchParams.get("format"));
    const body = buildSpreadsheet(format, [sheet]);
    return new NextResponse(body, {
      headers: spreadsheetHeaders(format, `${exportId}-${analytics.range.from}-to-${analytics.range.to}`, body),
    });
  }

  return NextResponse.json(analytics);
}
