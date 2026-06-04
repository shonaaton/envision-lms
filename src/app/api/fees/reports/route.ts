import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { CreditLedger, Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";

export const dynamic = "force-dynamic";

function td(value: unknown) {
  return `<td>${String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
}

function workbook(title: string, headers: string[], rows: unknown[][]) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><h2>${title}</h2><table border="1"><thead><tr>${headers
    .map((h) => `<th>${h}</th>`)
    .join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(td).join("")}</tr>`).join("")}</tbody></table></body></html>`;
}

export async function GET(req: Request) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const type = new URL(req.url).searchParams.get("type") || "fee";

  const [invoices, payments, credits] = await Promise.all([
    Invoice.find({}).populate("student plan").sort({ createdAt: -1 }).lean(),
    Payment.find({}).populate("user").sort({ createdAt: -1 }).lean(),
    CreditLedger.find({}).populate("student").sort({ createdAt: -1 }).lean(),
  ]);

  let title = "Fee Report";
  let headers = ["Invoice", "Student", "Plan", "Status", "Amount", "Late Fee", "GST", "Total", "Due Date"];
  let rows = invoices.map((i: any) => [
    i.invoiceNumber,
    i.student?.name,
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
    headers = ["Payment ID", "User", "Purpose", "Amount", "Status", "Paid At", "Invoice"];
    rows = payments.map((p: any) => [p._id, p.user?.name, p.purpose, formatINR(p.amount), p.status, p.paidAt ? new Date(p.paidAt).toLocaleString("en-IN") : "", p.invoiceNumber]);
  } else if (type === "gst") {
    title = "GST Report";
    headers = ["Invoice", "Student", "Taxable", "GST %", "CGST", "SGST", "GST Total", "Status"];
    rows = invoices.map((i: any) => [i.invoiceNumber, i.student?.name, formatINR(i.taxableAmount || 0), i.gstPercentage, formatINR(i.cgstAmount || 0), formatINR(i.sgstAmount || 0), formatINR(i.gstAmount || 0), i.status]);
  } else if (type === "collection") {
    title = "Collection Report";
    headers = ["Type", "Student", "Credits", "Balance After", "Invoice", "Date", "Note"];
    rows = credits.map((c: any) => [c.type, c.student?.name, c.credits, c.balanceAfter, c.invoice || "", new Date(c.createdAt).toLocaleString("en-IN"), c.note]);
  }

  return new NextResponse(workbook(title, headers, rows), {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-report.xls"`,
    },
  });
}
