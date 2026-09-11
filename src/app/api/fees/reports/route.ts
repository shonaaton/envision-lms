import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { CreditLedger, Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { requireFeesAccess } from "@/lib/feesAccess";
import { buildSpreadsheet, resolveFormat, spreadsheetHeaders, type SheetColumn } from "@/lib/spreadsheet";
import { resolveReportRange, withinReportRange } from "@/lib/reportRange";

export const dynamic = "force-dynamic";

function invoiceReportDate(invoice: any) {
  return invoice.issueDate || invoice.dueDate || invoice.createdAt;
}

function paymentReportDate(payment: any) {
  return payment.paidAt || payment.createdAt;
}

function isGstInvoice(invoice: any) {
  return invoice.invoiceMode !== "non_gst" && (Number(invoice.gstAmount || 0) > 0 || Number(invoice.gstPercentage || 0) > 0);
}

function studentId(person: any) {
  return person?.username || person?._id?.toString?.() || "-";
}

export async function GET(req: Request) {
  if (!(await requireFeesAccess("export", "feeReports"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "fee";
  // Excel is the default because the old ".xls" export was an HTML table, and a
  // rupee-denominated CSV opens as mojibake in Excel unless it is read as UTF-8.
  const format = resolveFormat(url.searchParams.get("format"), "xlsx");
  const planType = url.searchParams.get("planType");
  // Read through the same resolver the preview page uses, so an export always
  // covers exactly the period the filter form was showing.
  const range = resolveReportRange(Object.fromEntries(url.searchParams));
  const student = url.searchParams.get("student");

  const [invoices, payments, credits] = await Promise.all([
    Invoice.find(student ? { student } : {}).populate("student plan").sort({ createdAt: -1 }).lean(),
    Payment.find(student ? { user: student } : {}).populate("user").sort({ createdAt: -1 }).lean(),
    CreditLedger.find(student ? { student } : {}).populate("student invoice").sort({ createdAt: -1 }).lean(),
  ]);
  const filteredInvoices = (planType ? invoices.filter((i: any) => i.type === planType) : invoices)
    .filter((i: any) => withinReportRange(invoiceReportDate(i), range));

  // Rows stay raw - money in paise, dates as dates - and the workbook writer
  // applies the currency and date formats, so the numbers land in a spreadsheet
  // as numbers rather than as text that cannot be summed.
  let title = "Fee Report";
  let columns: SheetColumn[] = [
    { label: "Invoice" },
    { label: "Student" },
    { label: "Student ID" },
    { label: "Plan" },
    { label: "Status" },
    { label: "Amount", type: "money" },
    { label: "Late Fee", type: "money" },
    { label: "GST", type: "money" },
    { label: "Total", type: "money" },
    { label: "Due Date", type: "date" },
  ];
  let rows: unknown[][] = filteredInvoices.map((i: any) => [
    i.invoiceNumber,
    i.student?.name,
    studentId(i.student),
    i.plan?.name || i.type,
    i.status,
    i.amount,
    i.lateFee || 0,
    i.gstAmount || 0,
    i.totalAmount,
    i.dueDate,
  ]);

  if (type === "transaction" || type === "payment") {
    title = type === "payment" ? "Payment Report" : "Transaction Report";
    columns = [
      { label: "Payment ID" },
      { label: "User" },
      { label: "User ID" },
      { label: "Purpose" },
      { label: "Amount", type: "money" },
      { label: "Status" },
      { label: "Paid At", type: "datetime" },
      { label: "Invoice" },
    ];
    rows = payments
      .filter((p: any) => withinReportRange(paymentReportDate(p), range))
      .map((p: any) => [
        p._id?.toString?.() || String(p._id),
        p.user?.name,
        studentId(p.user),
        p.purpose,
        p.amount,
        p.status,
        p.paidAt,
        p.invoiceNumber,
      ]);
  } else if (type === "gst") {
    title = "GST Report";
    columns = [
      { label: "Invoice" },
      { label: "Student" },
      { label: "Student ID" },
      { label: "Taxable", type: "money" },
      { label: "GST %", type: "percent" },
      { label: "CGST", type: "money" },
      { label: "SGST", type: "money" },
      { label: "GST Total", type: "money" },
      { label: "Total Amount", type: "money" },
      { label: "Invoice Date", type: "date" },
      { label: "Status" },
    ];
    rows = filteredInvoices
      .filter((i: any) => isGstInvoice(i))
      .map((i: any) => [
        i.invoiceNumber,
        i.student?.name,
        studentId(i.student),
        i.taxableAmount || 0,
        i.gstPercentage,
        i.cgstAmount || 0,
        i.sgstAmount || 0,
        i.gstAmount || 0,
        i.totalAmount || 0,
        i.issueDate || i.createdAt,
        i.status,
      ]);
  } else if (type === "collection") {
    title = "Collection Report";
    columns = [
      { label: "Type" },
      { label: "Student" },
      { label: "Student ID" },
      { label: "Credits", type: "number" },
      { label: "Balance After", type: "number" },
      { label: "Invoice" },
      { label: "Date", type: "datetime" },
      { label: "Note" },
    ];
    rows = credits
      .filter((c: any) => withinReportRange(c.createdAt, range))
      .map((c: any) => [
        c.type,
        c.student?.name,
        studentId(c.student),
        c.credits,
        c.balanceAfter,
        c.invoice?.invoiceNumber || c.invoice || "",
        c.createdAt,
        c.note,
      ]);
  }

  const body = buildSpreadsheet(format, [{ name: title, columns, rows }]);
  return new NextResponse(body, { headers: spreadsheetHeaders(format, `${type}-report`, body) });
}
