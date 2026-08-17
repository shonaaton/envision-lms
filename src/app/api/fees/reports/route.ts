import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { CreditLedger, Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { requireFeesAccess } from "@/lib/feesAccess";

export const dynamic = "force-dynamic";

function td(value: unknown) {
  return `<td>${String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
}

function workbook(title: string, headers: string[], rows: unknown[][]) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><h2>${title}</h2><table border="1"><thead><tr>${headers
    .map((h) => `<th>${h}</th>`)
    .join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(td).join("")}</tr>`).join("")}</tbody></table></body></html>`;
}

function csv(headers: string[], rows: unknown[][]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

function withinRange(dateValue: unknown, url: URL) {
  if (!dateValue) return false;
  const date = new Date(dateValue as string | number | Date);
  if (Number.isNaN(date.getTime())) return false;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const month = url.searchParams.get("month");
  const fy = url.searchParams.get("fy");
  if (month) {
    const monthDate = new Date(`${month}-01`);
    const rangeStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const rangeEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return date >= rangeStart && date <= rangeEnd;
  }
  if (from || to) {
    const rangeStart = from ? new Date(from) : new Date(-8640000000000000);
    const rangeEnd = to ? new Date(`${to}T23:59:59.999`) : new Date(8640000000000000);
    return date >= rangeStart && date <= rangeEnd;
  }
  if (fy) {
    const startYear = Number(fy);
    const rangeStart = new Date(startYear, 3, 1);
    const rangeEnd = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
    return date >= rangeStart && date <= rangeEnd;
  }
  return true;
}

function invoiceReportDate(invoice: any) {
  return invoice.issueDate || invoice.dueDate || invoice.createdAt;
}

function paymentReportDate(payment: any) {
  return payment.paidAt || payment.createdAt;
}

function isGstInvoice(invoice: any) {
  return invoice.invoiceMode !== "non_gst" && (Number(invoice.gstAmount || 0) > 0 || Number(invoice.gstPercentage || 0) > 0);
}

export async function GET(req: Request) {
  if (!(await requireFeesAccess("export", "feeReports"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "fee";
  const format = url.searchParams.get("format") || "xls";
  const planType = url.searchParams.get("planType");
  const student = url.searchParams.get("student");

  const [invoices, payments, credits] = await Promise.all([
    Invoice.find(student ? { student } : {}).populate("student plan").sort({ createdAt: -1 }).lean(),
    Payment.find(student ? { user: student } : {}).populate("user").sort({ createdAt: -1 }).lean(),
    CreditLedger.find(student ? { student } : {}).populate("student invoice").sort({ createdAt: -1 }).lean(),
  ]);
  const filteredInvoices = (planType ? invoices.filter((i: any) => i.type === planType) : invoices)
    .filter((i: any) => withinRange(invoiceReportDate(i), url));

  let title = "Fee Report";
  let headers = ["Invoice", "Student", "Student ID", "Plan", "Status", "Amount", "Late Fee", "GST", "Total", "Due Date"];
  let rows = filteredInvoices.map((i: any) => [
    i.invoiceNumber,
    i.student?.name,
    i.student?.username || i.student?._id?.toString?.() || "-",
    i.plan?.name || i.type,
    i.status,
    formatINR(i.amount),
    formatINR(i.lateFee || 0),
    formatINR(i.gstAmount || 0),
    formatINR(i.totalAmount),
    new Date(i.dueDate).toLocaleDateString("en-IN"),
  ]);

  if (type === "transaction" || type === "payment") {
    title = type === "payment" ? "Payment Report" : "Transaction Report";
    headers = ["Payment ID", "User", "User ID", "Purpose", "Amount", "Status", "Paid At", "Invoice"];
    rows = payments
      .filter((p: any) => withinRange(paymentReportDate(p), url))
      .map((p: any) => [p._id, p.user?.name, p.user?.username || p.user?._id?.toString?.() || "-", p.purpose, formatINR(p.amount), p.status, p.paidAt ? new Date(p.paidAt).toLocaleString("en-IN") : "", p.invoiceNumber]);
  } else if (type === "gst") {
    title = "GST Report";
    headers = ["Invoice", "Student", "Student ID", "Taxable", "GST %", "CGST", "SGST", "GST Total", "Total Amount", "Invoice Date", "Status"];
    rows = filteredInvoices
      .filter((i: any) => isGstInvoice(i))
      .map((i: any) => [i.invoiceNumber, i.student?.name, i.student?.username || i.student?._id?.toString?.() || "-", formatINR(i.taxableAmount || 0), i.gstPercentage, formatINR(i.cgstAmount || 0), formatINR(i.sgstAmount || 0), formatINR(i.gstAmount || 0), formatINR(i.totalAmount || 0), new Date(i.issueDate || i.createdAt).toLocaleDateString("en-IN"), i.status]);
  } else if (type === "collection") {
    title = "Collection Report";
    headers = ["Type", "Student", "Student ID", "Credits", "Balance After", "Invoice", "Date", "Note"];
    rows = credits
      .filter((c: any) => withinRange(c.createdAt, url))
      .map((c: any) => [c.type, c.student?.name, c.student?.username || c.student?._id?.toString?.() || "-", c.credits, c.balanceAfter, c.invoice?.invoiceNumber || c.invoice || "", new Date(c.createdAt).toLocaleString("en-IN"), c.note]);
  }

  if (format === "csv") {
    return new NextResponse(csv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-report.csv"`,
      },
    });
  }

  return new NextResponse(workbook(title, headers, rows), {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-report.xls"`,
    },
  });
}
