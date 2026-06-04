import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { FeePlan } from "@/models/Fee";
import { User } from "@/models/User";
import { BarChart3, Download } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FeeReportsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return <div className="p-6">Forbidden</div>;
  await dbConnect();
  const [students, plans] = await Promise.all([
    User.find({ role: "student" }, { passwordHash: 0 }).sort({ name: 1 }).lean(),
    FeePlan.find({}).sort({ name: 1 }).lean(),
  ]);
  const reports = [
    ["fee", "Fee Collection Report", "Fees collected, outstanding fees, late fees, monthly collections"],
    ["transaction", "Transaction Report", "Payment date, student, plan, payment method, amount paid"],
    ["gst", "GST Report", "GST, CGST, SGST and GST invoice summary"],
    ["collection", "Credit Report", "Credits purchased, consumed, and remaining"],
    ["invoice", "Invoice Report", "Invoice number, type, amount, payment status, invoice status"],
    ["payment", "Payment Report", "Payments received and payment state"],
  ];
  const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><BarChart3 size={18} /></span>
        <div><h1 className="text-2xl font-semibold">Fee Reports</h1><p className="text-sm text-slate-500">Separate reports with date, month, financial year, plan type, and student filters.</p></div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {reports.map(([type, title, description]) => (
          <form key={type} action="/api/fees/reports" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <input type="hidden" name="type" value={type} />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input name="from" type="date" className="rounded-md border px-3 py-2 text-sm" />
              <input name="to" type="date" className="rounded-md border px-3 py-2 text-sm" />
              <input name="month" type="month" className="rounded-md border px-3 py-2 text-sm" />
              <input name="fy" type="number" defaultValue={year} className="rounded-md border px-3 py-2 text-sm" placeholder="Financial year start, e.g. 2026" />
              <select name="planType" className="rounded-md border px-3 py-2 text-sm"><option value="">All plan types</option><option value="monthly">Monthly</option><option value="credits">Credit-Based</option></select>
              <select name="student" className="rounded-md border px-3 py-2 text-sm"><option value="">All students</option>{students.map((s: any) => <option key={s._id} value={s._id.toString()}>{s.name}</option>)}</select>
              <select name="format" className="rounded-md border px-3 py-2 text-sm"><option value="xls">Excel (.xls)</option><option value="csv">CSV</option></select>
              <button className="inline-flex items-center justify-center gap-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white"><Download size={15} /> Download</button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
