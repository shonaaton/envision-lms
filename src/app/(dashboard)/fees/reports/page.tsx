import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { CreditLedger, Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { User } from "@/models/User";
import { BarChart3, Download, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

const REPORTS: Record<string, { title: string; description: string }> = {
  fee: { title: "Fee Collection Report", description: "Fees collected, outstanding fees, late fees, and monthly collections." },
  transaction: { title: "Transaction Report", description: "Payment date, student, payment method, amount paid, and status." },
  gst: { title: "GST Report", description: "GST, CGST, SGST, taxable amount, and GST invoice summary." },
  collection: { title: "Credit Report", description: "Credits purchased, consumed, remaining, and related notes." },
  invoice: { title: "Invoice Report", description: "Invoice number, type, amount, payment status, and invoice state." },
  payment: { title: "Payment Report", description: "Payments received and payment state." },
};

function value(params: Record<string, string | string[] | undefined>, key: string, fallback = "") {
  const raw = params[key];
  return typeof raw === "string" ? raw : fallback;
}

function dateFilter(params: Record<string, string | string[] | undefined>) {
  const filter: any = {};
  const from = value(params, "from");
  const to = value(params, "to");
  const month = value(params, "month");
  const fy = value(params, "fy");
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

function downloadHref(params: Record<string, string>, format: "xls" | "csv") {
  const next = new URLSearchParams({ ...params, format });
  return `/api/fees/reports?${next.toString()}`;
}

async function getPreview(params: Record<string, string | string[] | undefined>) {
  const type = value(params, "type", "fee");
  const planType = value(params, "planType");
  const student = value(params, "student");
  const filter = dateFilter(params);

  const [invoices, payments, credits] = await Promise.all([
    Invoice.find({ ...filter, ...(student ? { student } : {}) }).populate("student plan").sort({ createdAt: -1 }).limit(300).lean(),
    Payment.find({ ...filter, ...(student ? { user: student } : {}) }).populate("user").sort({ createdAt: -1 }).limit(300).lean(),
    CreditLedger.find({ ...filter, ...(student ? { student } : {}) }).populate("student invoice").sort({ createdAt: -1 }).limit(300).lean(),
  ]);

  const filteredInvoices = planType ? invoices.filter((invoice: any) => invoice.type === planType) : invoices;
  let headers = ["Invoice", "Student", "Student ID", "Plan", "Status", "Amount", "Late Fee", "GST", "Total", "Due Date"];
  let rows = filteredInvoices.map((invoice: any) => [
    invoice.invoiceNumber,
    invoice.student?.name,
    invoice.student?.username || invoice.student?._id?.toString?.() || "-",
    invoice.plan?.name || invoice.type,
    invoice.status,
    formatINR(invoice.amount),
    formatINR(invoice.lateFee || 0),
    formatINR(invoice.gstAmount || 0),
    formatINR(invoice.totalAmount),
    new Date(invoice.dueDate).toLocaleDateString("en-IN"),
  ]);

  if (type === "transaction" || type === "payment") {
    headers = ["Payment ID", "User", "User ID", "Purpose", "Amount", "Status", "Paid At", "Invoice"];
    rows = payments.map((payment: any) => [
      payment._id?.toString(),
      payment.user?.name,
      payment.user?.username || payment.user?._id?.toString?.() || "-",
      payment.purpose,
      formatINR(payment.amount),
      payment.status,
      payment.paidAt ? new Date(payment.paidAt).toLocaleString("en-IN") : "",
      payment.invoiceNumber,
    ]);
  } else if (type === "gst") {
    headers = ["Invoice", "Student", "Student ID", "Taxable", "GST %", "CGST", "SGST", "GST Total", "Status"];
    rows = filteredInvoices.map((invoice: any) => [
      invoice.invoiceNumber,
      invoice.student?.name,
      invoice.student?.username || invoice.student?._id?.toString?.() || "-",
      formatINR(invoice.taxableAmount || 0),
      invoice.gstPercentage,
      formatINR(invoice.cgstAmount || 0),
      formatINR(invoice.sgstAmount || 0),
      formatINR(invoice.gstAmount || 0),
      invoice.status,
    ]);
  } else if (type === "collection") {
    headers = ["Type", "Student", "Student ID", "Credits", "Balance After", "Invoice", "Date", "Note"];
    rows = credits.map((credit: any) => [
      credit.type,
      credit.student?.name,
      credit.student?.username || credit.student?._id?.toString?.() || "-",
      credit.credits,
      credit.balanceAfter,
      credit.invoice?.invoiceNumber || credit.invoice || "",
      new Date(credit.createdAt).toLocaleString("en-IN"),
      credit.note,
    ]);
  }

  return { headers, rows };
}

export default async function FeeReportsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const params = searchParams ? await searchParams : {};
  const currentYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const selectedType = REPORTS[value(params, "type", "fee")] ? value(params, "type", "fee") : "fee";
  const selected = REPORTS[selectedType];
  const students = await User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean();
  const preview = await getPreview({ ...params, type: selectedType });
  const downloadParams = {
    type: selectedType,
    from: value(params, "from"),
    to: value(params, "to"),
    month: value(params, "month"),
    fy: value(params, "fy", String(currentYear)),
    planType: value(params, "planType"),
    student: value(params, "student"),
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><BarChart3 size={18} /></span>
        <div><h1 className="text-2xl font-semibold">Fee Reports</h1><p className="text-sm text-slate-500">Preview reports on the platform, then download Excel or CSV when ready.</p></div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid grid-cols-1 gap-3 lg:grid-cols-7">
          <select name="type" defaultValue={selectedType} className="h-10 rounded-md border border-slate-200 px-3 text-sm lg:col-span-2">
            {Object.entries(REPORTS).map(([key, report]) => <option key={key} value={key}>{report.title}</option>)}
          </select>
          <input name="from" type="date" defaultValue={value(params, "from")} className="h-10 rounded-md border border-slate-200 px-3 text-sm" />
          <input name="to" type="date" defaultValue={value(params, "to")} className="h-10 rounded-md border border-slate-200 px-3 text-sm" />
          <input name="month" type="month" defaultValue={value(params, "month")} className="h-10 rounded-md border border-slate-200 px-3 text-sm" />
          <input name="fy" type="number" defaultValue={value(params, "fy", String(currentYear))} className="h-10 rounded-md border border-slate-200 px-3 text-sm" placeholder="FY start" />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white"><Eye size={15} /> Preview</button>

          <select name="planType" defaultValue={value(params, "planType")} className="h-10 rounded-md border border-slate-200 px-3 text-sm lg:col-span-2">
            <option value="">All plan types</option>
            <option value="monthly">Monthly</option>
            <option value="credits">Credit-Based</option>
          </select>
          <select name="student" defaultValue={value(params, "student")} className="h-10 rounded-md border border-slate-200 px-3 text-sm lg:col-span-3">
            <option value="">All students</option>
            {students.map((student: any) => <option key={student._id} value={student._id.toString()}>{student.name}{student.username ? ` (${student.username})` : ""}</option>)}
          </select>
          <div className="flex gap-2 lg:col-span-2">
            <a href={downloadHref(downloadParams, "xls")} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold"><Download size={15} /> Excel</a>
            <a href={downloadHref(downloadParams, "csv")} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold"><Download size={15} /> CSV</a>
          </div>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <p className="text-sm text-slate-500">{selected.description}</p>
          </div>
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">{preview.rows.length} records</span>
        </div>

        {preview.rows.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">No records found for the selected report filters.</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{preview.headers.map((header) => <th key={header} className="border-b px-3 py-3 font-semibold">{header}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b last:border-0">
                    {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-3 py-3">{String(cell ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
