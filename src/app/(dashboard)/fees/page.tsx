import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { CreditLedger, FeeAssignment, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import Link from "next/link";
import { AlertTriangle, Banknote, FileText, Receipt, Users, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

function monthRange() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function Card({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: any }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Icon size={18} /></span>
      </div>
    </div>
  );
}

export default async function FeesDashboardPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  await ensureMonthlyInvoices();

  const { from, to } = monthRange();
  const invoiceFilter = role === "admin" ? {} : { student: userId };
  const [invoices, assignments, students, recentCredits] = await Promise.all([
    Invoice.find(invoiceFilter).populate("student plan").sort({ createdAt: -1 }).limit(80).lean(),
    FeeAssignment.find(role === "admin" ? {} : { student: userId }).populate("student plan").sort({ creditBalance: 1 }).lean(),
    User.countDocuments({ role: "student", isActive: { $ne: false } }),
    CreditLedger.find(role === "admin" ? {} : { student: userId }).populate("student").sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const currentInvoices = invoices.filter((i: any) => new Date(i.createdAt) >= from && new Date(i.createdAt) <= to);
  const collected = currentInvoices.filter((i: any) => i.status === "paid").reduce((sum: number, i: any) => sum + i.totalAmount, 0);
  const outstanding = currentInvoices.filter((i: any) => i.status !== "paid").reduce((sum: number, i: any) => sum + i.totalAmount, 0);
  const gst = currentInvoices.reduce((sum: number, i: any) => sum + (i.gstAmount || 0), 0);
  const late = currentInvoices.reduce((sum: number, i: any) => sum + (i.lateFee || 0), 0);
  const creditAssignments = assignments.filter((a: any) => a.type === "credits");
  const monthlyAssignments = assignments.filter((a: any) => a.type === "monthly");
  const lowCredit = creditAssignments.filter((a: any) => a.creditBalance <= 3);

  const quickLinks = role === "admin"
    ? [
        ["/fees/fee-plans", "Fee Plans"],
        ["/fees/student-fees", "Student Fees"],
        ["/fees/credit-monitoring", "Credit Monitoring"],
        ["/fees/invoices", "Invoices"],
        ["/fees/reports", "Reports"],
        ["/admin/settings", "Academy Setup"],
      ]
    : [["/fees/invoices", "My Invoices"], ["/invoices", "Invoice List"]];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Fees Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">High-level fee collection, invoices, and credit monitoring.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card label="Outstanding Fees" value={formatINR(outstanding)} note="Current month" icon={AlertTriangle} />
        <Card label="Fees Collected" value={formatINR(collected)} note="Current month" icon={Banknote} />
        <Card label="GST Collected" value={formatINR(gst)} note="Current month" icon={Receipt} />
        <Card label="Late Fees" value={formatINR(late)} note="Current month" icon={FileText} />
        <Card label="Active Students" value={students} note="Total active students" icon={Users} />
        <Card label="Credit Students" value={creditAssignments.length} note={`${lowCredit.length} low credit`} icon={WalletCards} />
        <Card label="Monthly Students" value={monthlyAssignments.length} note="Monthly plan assigned" icon={Banknote} />
        <Card label="Recent Invoices" value={invoices.length} note="Latest 80 records" icon={Receipt} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Quick Links</h2>
          <div className="grid grid-cols-1 gap-2">
            {quickLinks.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">{label}</Link>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Students With Low Credits</h2>
          <div className="space-y-2 text-sm">
            {lowCredit.slice(0, 8).map((a: any) => (
              <div key={a._id} className="flex items-center justify-between rounded-md bg-rose-50 px-3 py-2 text-rose-900">
                <span>{a.student?.name || "Student"}</span><b>{a.creditBalance}</b>
              </div>
            ))}
            {lowCredit.length === 0 && <p className="text-slate-500">No low credit students.</p>}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Recent Transactions</h2>
          <div className="space-y-2 text-sm">
            {recentCredits.map((item: any) => (
              <div key={item._id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <span>{item.student?.name || item.type}</span>
                <b className={item.credits > 0 ? "text-emerald-700" : "text-rose-700"}>{item.credits > 0 ? "+" : ""}{item.credits}</b>
              </div>
            ))}
            {recentCredits.length === 0 && <p className="text-slate-500">No recent transactions.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
