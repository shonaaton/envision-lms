import { dbConnect } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { CreditLedger, Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { User } from "@/models/User";
import { BarChart3, CalendarDays, Download, Eye, FileSpreadsheet, Filter, ReceiptText, UsersRound } from "lucide-react";
import { requireFeesAccess } from "@/lib/feesAccess";

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

function withinRange(dateValue: unknown, params: Record<string, string | string[] | undefined>) {
  if (!dateValue) return false;
  const date = new Date(dateValue as string | number | Date);
  if (Number.isNaN(date.getTime())) return false;
  const from = value(params, "from");
  const to = value(params, "to");
  const month = value(params, "month");
  const fy = value(params, "fy");
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

function downloadHref(params: Record<string, string>, format: "xls" | "csv") {
  const next = new URLSearchParams({ ...params, format });
  return `/api/fees/reports?${next.toString()}`;
}

function reportHref(params: Record<string, string | string[] | undefined>, type: string, currentYear: number) {
  const next = new URLSearchParams({
    type,
    from: value(params, "from"),
    to: value(params, "to"),
    month: value(params, "month"),
    fy: value(params, "fy", String(currentYear)),
    planType: value(params, "planType"),
    student: value(params, "student"),
  });
  return `/fees/reports?${next.toString()}`;
}

function statusClass(value: unknown) {
  const status = String(value || "").toLowerCase();
  if (["paid", "captured", "completed", "success"].includes(status)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["cancelled", "failed", "refunded", "void"].includes(status)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (["pending", "unpaid", "created"].includes(status)) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function filterLabel(params: Record<string, string | string[] | undefined>, currentYear: number) {
  const from = value(params, "from");
  const to = value(params, "to");
  const month = value(params, "month");
  const fy = value(params, "fy", String(currentYear));
  if (month) return new Date(`${month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  if (from || to) return `${from || "Start"} to ${to || "Today"}`;
  return `FY ${fy}-${String(Number(fy) + 1).slice(-2)}`;
}

async function getPreview(params: Record<string, string | string[] | undefined>) {
  const type = value(params, "type", "fee");
  const planType = value(params, "planType");
  const student = value(params, "student");

  const [invoices, payments, credits] = await Promise.all([
    Invoice.find(student ? { student } : {}).populate("student plan").sort({ createdAt: -1 }).lean(),
    Payment.find(student ? { user: student } : {}).populate("user").sort({ createdAt: -1 }).lean(),
    CreditLedger.find(student ? { student } : {}).populate("student invoice").sort({ createdAt: -1 }).lean(),
  ]);

  const filteredInvoices = (planType ? invoices.filter((invoice: any) => invoice.type === planType) : invoices)
    .filter((invoice: any) => withinRange(invoiceReportDate(invoice), params));
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
    rows = payments.filter((payment: any) => withinRange(paymentReportDate(payment), params)).map((payment: any) => [
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
    headers = ["Invoice", "Student", "Student ID", "Taxable", "GST %", "CGST", "SGST", "GST Total", "Total Amount", "Invoice Date", "Status"];
    rows = filteredInvoices.filter((invoice: any) => isGstInvoice(invoice)).map((invoice: any) => [
      invoice.invoiceNumber,
      invoice.student?.name,
      invoice.student?.username || invoice.student?._id?.toString?.() || "-",
      formatINR(invoice.taxableAmount || 0),
      invoice.gstPercentage,
      formatINR(invoice.cgstAmount || 0),
      formatINR(invoice.sgstAmount || 0),
      formatINR(invoice.gstAmount || 0),
      formatINR(invoice.totalAmount || 0),
      new Date(invoice.issueDate || invoice.createdAt).toLocaleDateString("en-IN"),
      invoice.status,
    ]);
  } else if (type === "collection") {
    headers = ["Type", "Student", "Student ID", "Credits", "Balance After", "Invoice", "Date", "Note"];
    rows = credits.filter((credit: any) => withinRange(credit.createdAt, params)).map((credit: any) => [
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
  if (!(await requireFeesAccess("export", "feeReports"))) return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const params = searchParams ? await searchParams : {};
  const currentYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const selectedType = REPORTS[value(params, "type", "fee")] ? value(params, "type", "fee") : "fee";
  const selected = REPORTS[selectedType];
  const students = await User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean();
  const preview = await getPreview({ ...params, type: selectedType });
  const selectedStudent = students.find((student: any) => student._id.toString() === value(params, "student"));
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
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand"><BarChart3 size={18} /></span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Finance workspace</p>
              <h1 className="text-xl font-bold text-slate-950">Fee Reports</h1>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Records</div>
              <div className="mt-1 text-xl font-bold text-slate-950">{preview.rows.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Period</div>
              <div className="mt-1 truncate text-sm font-bold text-slate-950">{filterLabel(params, currentYear)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Audience</div>
              <div className="mt-1 truncate text-sm font-bold text-slate-950">{selectedStudent ? selectedStudent.name : "All students"}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {Object.entries(REPORTS).map(([key, report]) => {
          const active = key === selectedType;
          return (
            <a
              key={key}
              href={reportHref(params, key, currentYear)}
              className={`rounded-lg border p-3 shadow-sm transition hover:border-brand/25 ${active ? "border-brand bg-brand text-white shadow-brand/20" : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"}`}
            >
              <span className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${active ? "bg-accent text-brand" : "bg-brand/10 text-brand"}`}>
                <ReceiptText size={18} />
              </span>
              <span className="block text-sm font-bold">{report.title}</span>
              <span className={`mt-1 line-clamp-2 block text-xs leading-5 ${active ? "text-white/72" : "text-slate-500"}`}>{report.description}</span>
            </a>
          );
        })}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_280px]">
          <input type="hidden" name="type" value={selectedType} />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-brand">
              <CalendarDays size={17} />
              <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Date Range</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">From</span>
                <input name="from" type="date" defaultValue={value(params, "from")} className="input h-10" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">To</span>
                <input name="to" type="date" defaultValue={value(params, "to")} className="input h-10" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Month</span>
                <input name="month" type="month" defaultValue={value(params, "month")} className="input h-10" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Financial Year Start</span>
                <input name="fy" type="number" defaultValue={value(params, "fy", String(currentYear))} className="input h-10" placeholder="FY start" />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-brand">
              <Filter size={17} />
              <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Filters</h2>
            </div>
            <div className="grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Plan Type</span>
                <select name="planType" defaultValue={value(params, "planType")} className="input h-10">
                  <option value="">All plan types</option>
                  <option value="monthly">Monthly</option>
                  <option value="credits">Credit-Based</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Student</span>
                <select name="student" defaultValue={value(params, "student")} className="input h-10">
                  <option value="">All students</option>
                  {students.map((student: any) => <option key={student._id} value={student._id.toString()}>{student.name}{student.username ? ` (${student.username})` : ""}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-brand/10 bg-brand p-4 text-white shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Preview & Export</h2>
            </div>
            <p className="mb-4 text-sm leading-6 text-white/72">Apply filters first. Export uses the same report selection.</p>
            <button className="mb-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-brand shadow-sm"><Eye size={15} /> Preview Report</button>
            <div className="grid grid-cols-2 gap-2">
              <a href={downloadHref(downloadParams, "xls")} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15"><Download size={15} /> Excel</a>
              <a href={downloadHref(downloadParams, "csv")} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15"><Download size={15} /> CSV</a>
            </div>
          </div>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><UsersRound size={18} /></span>
            <div>
              <h2 className="text-base font-bold text-slate-950">{selected.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{selected.description}</p>
            </div>
          </div>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{preview.rows.length} records</span>
        </div>

        {preview.rows.length === 0 ? (
          <div className="p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileSpreadsheet size={22} /></div>
            <h3 className="mt-4 text-sm font-bold text-slate-950">No records found</h3>
            <p className="mt-2 text-sm text-slate-500">Try a wider date range or remove one of the filters.</p>
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>{preview.headers.map((header) => <th key={header} className="border-b border-slate-200 px-4 py-3 font-bold">{header}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="group border-b last:border-0 hover:bg-brand/[0.03]">
                    {row.map((cell, cellIndex) => {
                      const header = preview.headers[cellIndex]?.toLowerCase();
                      const content = String(cell ?? "");
                      return (
                        <td key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-slate-800 group-last:border-b-0">
                          {header === "status" ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(content)}`}>{content || "-"}</span>
                          ) : (
                            <span className={cellIndex === 0 ? "font-semibold text-slate-950" : ""}>{content}</span>
                          )}
                        </td>
                      );
                    })}
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
