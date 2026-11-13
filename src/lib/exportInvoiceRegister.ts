// Loads the export (LUT) invoice register for a period. Shared by the
// /fees/export-invoices page, the fee dashboard panel and the Excel route.

import { dbConnect } from "@/lib/db";
import { academyDateTime } from "@/lib/academyTime";
import { exportRegisterRows, type ExportPeriod } from "@/lib/exportInvoiceReport";
import { Invoice } from "@/models/Fee";

const DAY = 24 * 60 * 60 * 1000;

export async function loadExportRegister(period: Pick<ExportPeriod, "from" | "to">) {
  await dbConnect();
  // A day of slack each side; the academy-time date filter in
  // exportRegisterRows decides exactly which invoices belong to the period.
  const invoices = await Invoice.find({
    "exportSupply.currency": { $exists: true },
    issueDate: { $gte: new Date(academyDateTime(period.from).getTime() - DAY), $lte: new Date(academyDateTime(period.to, "23:59").getTime() + DAY) },
  })
    .populate("student", "name username email")
    .lean();
  return exportRegisterRows(invoices as any[], period);
}
