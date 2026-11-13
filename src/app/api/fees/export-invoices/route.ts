import { NextResponse } from "next/server";
import { requireFeesAccess } from "@/lib/feesAccess";
import { getAcademySettings } from "@/lib/fees";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { exportRegisterSheets, resolveExportPeriod } from "@/lib/exportInvoiceReport";
import { loadExportRegister } from "@/lib/exportInvoiceRegister";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/** Export (LUT) invoice register for the accounts team: ?month=2026-11 or ?fy=2026-27, &format=xlsx|csv|ods. */
export async function GET(req: Request) {
  if (!(await requireFeesAccess("export", "feeReports"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const period = resolveExportPeriod({ month: url.searchParams.get("month"), fy: url.searchParams.get("fy") });
  const format = resolveFormat(url.searchParams.get("format"), "xlsx");
  const [rows, settings] = await Promise.all([loadExportRegister(period), getAcademySettings()]);
  const sheets = exportRegisterSheets(rows, period, {
    gstin: (settings as any)?.gstNumber || ACADEMY_DEFAULTS.gstNumber,
    legalName: ACADEMY_DEFAULTS.legalName,
  });
  // A CSV holds one sheet, so it carries the invoice list the return is filed from.
  const body = buildSpreadsheet(format, format === "csv" ? [sheets[1]] : sheets);
  return new NextResponse(new Uint8Array(body), { headers: spreadsheetHeaders(format, `export-invoices-LUT-${period.fileLabel}`, body) });
}
