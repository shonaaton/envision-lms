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

function reportDateFilter(url: URL) {
  const filter: any = {};
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const month = url.searchParams.get("month");
  const fy = url.searchParams.get("fy");
  if (month) {
    const date = new Date(`${month}-01`);
    filter.createdAt = { $gte: new Date(date.getFullYear(), date.getMonth(), 1), $lte: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999) };
  } else if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999`);
  } else if (fy) {
    const startYear = Number(fy);
    filter.createdAt = { $gte: new Date(startYear, 3, 1), $lte: new Date(startYear + 1, 2, 31, 23, 59, 59, 999) };
  }
  return filter;
}

export async function GET(req: Request) {
  if (!(await requireFeesAccess("export"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "fee";
  const format = url.searchParams.get("format") || "xls";
  const dateFilter = reportDateFilter(url);
  const planType = url.searchParams.get("planType");
  const student = url.searchParams.get("student");

  const [invoices, payments, credits] = await Promise.all([
    Invoice.find({ ...dateFilter, ...(student ? { student } : {}) }).populate("student plan").sort({ createdAt: -1 }).lean(),
    Payment.find({ ...dateFilter, ...(student ? { user: student } : {}) }).populate("user").sort({ createdAt: -1 }).lean(),
    CreditLedger.find({ ...dateFilter, ...(student ? { student } : {}) }).populate("student invoice").sort({ createdAt: -1 }).lean(),
  ]);
  const filteredInvoices = planType ? invoices.filter((i: any) => i.type === planType) : invoices;

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
    rows = payments.map((p: any) => [p._id, p.user?.name, p.user?.username || p.user?._id?.toString?.() || "-", p.purpose, formatINR(p.amount), p.status, p.paidAt ? new Date(p.paidAt).toLocaleString("en-IN") : "", p.invoiceNumber]);
  } else if (type === "gst") {
    title = "GST Report";
    headers = ["Invoice", "Student", "Student ID", "Taxable", "GST %", "CGST", "SGST", "GST Total", "Total Amount", "Invoice Date", "Status"];
    rows = filteredInvoices
      .filter((i: any) => i.invoiceMode === "included")
      .map((i: any) => [i.invoiceNumber, i.student?.name, i.student?.username || i.student?._id?.toString?.() || "-", formatINR(i.taxableAmount || 0), i.gstPercentage, formatINR(i.cgstAmount || 0), formatINR(i.sgstAmount || 0), formatINR(i.gstAmount || 0), formatINR(i.totalAmount || 0), new Date(i.issueDate || i.createdAt).toLocaleDateString("en-IN"), i.status]);
  } else if (type === "collection") {
    title = "Collection Report";
    headers = ["Type", "Student", "Student ID", "Credits", "Balance After", "Invoice", "Date", "Note"];
    rows = credits.map((c: any) => [c.type, c.student?.name, c.student?.username || c.student?._id?.toString?.() || "-", c.credits, c.balanceAfter, c.invoice?.invoiceNumber || c.invoice || "", new Date(c.createdAt).toLocaleString("en-IN"), c.note]);
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
