import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { requireFeesAccess } from "@/lib/feesAccess";
import { getFeesAnalytics, resolveRange, type GstFilter } from "@/lib/feesAnalytics";

export const dynamic = "force-dynamic";

function gstParam(value: string | null): GstFilter {
  return value === "gst" || value === "non_gst" ? value : "all";
}

function cell(value: unknown, type?: string) {
  if (value === null || value === undefined || value === "") return "";
  if (type === "money") return formatINR(Number(value || 0));
  if (type === "percent") return `${Number(value || 0)}%`;
  if (type === "date") return new Date(value as string).toLocaleDateString("en-IN");
  if (type === "datetime") return new Date(value as string).toLocaleString("en-IN");
  return String(value);
}

function csv(headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

export async function GET(req: Request) {
  if (!(await requireFeesAccess("view", "feeDashboard"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();

  const url = new URL(req.url);
  const { from, to } = resolveRange(url.searchParams.get("from"), url.searchParams.get("to"));
  const analytics = await getFeesAnalytics({ from, to, gst: gstParam(url.searchParams.get("gst")) });

  const exportId = url.searchParams.get("export");
  if (exportId) {
    const table = analytics.tables[exportId];
    if (!table) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    const headers = table.columns.map((column) => column.label);
    const rows = table.rows.map((row) => table.columns.map((column) => cell(row[column.key], column.type)));
    return new NextResponse(csv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportId}-${analytics.range.from}-to-${analytics.range.to}.csv"`,
      },
    });
  }

  return NextResponse.json(analytics);
}
