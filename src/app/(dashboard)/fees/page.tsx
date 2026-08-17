import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ensureMonthlyInvoices } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { CreditLedger, DeletedInvoice, FeeAssignment, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarClock, Download, FileText, FileX2, Receipt, Users, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import { getFeaturePermissionState } from "@/lib/featureAccess";
import { isFeesManager } from "@/lib/feesAccess";

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
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">{label}</div>
          <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Icon size={16} /></span>
      </div>
    </div>
  );
}

function nextMonthlyPaymentDate(assignment: any) {
  if (!assignment?.billingStartDate) return null;
  const plan = assignment.plan || {};
  const now = new Date();
  const start = new Date(assignment.billingStartDate);
  const billingDay = Math.min(28, Math.max(1, Number(plan.billingDay || start.getDate() || 1)));
  let due = new Date(now.getFullYear(), now.getMonth(), billingDay, 23, 59, 59, 999);
  if (due < now) due = new Date(now.getFullYear(), now.getMonth() + 1, billingDay, 23, 59, 59, 999);
  due.setDate(due.getDate() + Number(plan.dueAfterDays || 0));
  return due;
}

function statusTone(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "overdue") return "bg-rose-50 text-rose-700";
  if (status === "cancelled") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-700";
}

export default async function FeesDashboardPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");
  const [dashboardPermissions, feePlanPermissions, studentFeePermissions, creditPermissions, invoicePermissions, reportPermissions] = await Promise.all([
    getFeaturePermissionState("feeDashboard", session!.user as any, ["view"]),
    getFeaturePermissionState("feePlans", session!.user as any, ["view", "edit"]),
    getFeaturePermissionState("studentFees", session!.user as any, ["view", "edit"]),
    getFeaturePermissionState("creditMonitoring", session!.user as any, ["view", "credit"]),
    getFeaturePermissionState("invoices", session!.user as any, ["view", "invoice"]),
    getFeaturePermissionState("feeReports", session!.user as any, ["view", "export"]),
  ]);
  if (!dashboardPermissions.view) redirect("/dashboard");
  const manager = isFeesManager(role);
  await dbConnect();
  await ensureMonthlyInvoices();

  const { from, to } = monthRange();
  const invoiceFilter = manager ? {} : { student: userId };
  const [invoices, assignments, students, recentCredits, deletedInvoiceCount] = await Promise.all([
    Invoice.find(invoiceFilter).populate("student plan").sort({ createdAt: -1 }).limit(80).lean(),
    FeeAssignment.find(manager ? {} : { student: userId }).populate("student plan").sort({ creditBalance: 1 }).lean(),
    User.countDocuments({ role: "student", isActive: { $ne: false } }),
    CreditLedger.find(manager ? {} : { student: userId }).populate("student").sort({ createdAt: -1 }).limit(10).lean(),
    manager ? DeletedInvoice.countDocuments({}) : Promise.resolve(0),
  ]);

  const currentInvoices = invoices.filter((i: any) => new Date(i.createdAt) >= from && new Date(i.createdAt) <= to);
  const collected = currentInvoices.filter((i: any) => i.status === "paid").reduce((sum: number, i: any) => sum + i.totalAmount, 0);
  const outstanding = currentInvoices.filter((i: any) => i.status !== "paid").reduce((sum: number, i: any) => sum + i.totalAmount, 0);
  const gst = currentInvoices.reduce((sum: number, i: any) => sum + (i.gstAmount || 0), 0);
  const late = currentInvoices.reduce((sum: number, i: any) => sum + (i.lateFee || 0), 0);
  const creditAssignments = assignments.filter((a: any) => a.type === "credits");
  const monthlyAssignments = assignments.filter((a: any) => a.type === "monthly");
  const lowCredit = creditAssignments.filter((a: any) => Number(a.creditBalance || 0) === 1);

  if (!manager) {
    const creditAssignment: any = creditAssignments[0];
    const monthlyAssignment: any = monthlyAssignments[0];
    const nextMonthlyInvoice: any = invoices
      .filter((invoice: any) => invoice.type === "monthly" && invoice.status !== "paid" && invoice.status !== "cancelled")
      .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    const nextDueDate = nextMonthlyInvoice?.dueDate ? new Date(nextMonthlyInvoice.dueDate) : nextMonthlyPaymentDate(monthlyAssignment);
    const paidInvoices = invoices.filter((invoice: any) => invoice.status === "paid");
    const unpaidInvoices = invoices.filter((invoice: any) => invoice.status !== "paid" && invoice.status !== "cancelled");

    return (
      <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Student Billing</div>
              <h1 className="text-xl font-bold text-slate-950">Credits & Payments</h1>
            </div>
            <Link href="/fees/invoices" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-white shadow-sm sm:w-auto">
              <Receipt size={16} /> View All Invoices
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card label="Credit Balance" value={creditAssignment ? creditAssignment.creditBalance : "-"} note={creditAssignment ? `${creditAssignment.totalCreditsConsumed || 0} credits used` : "No credit plan assigned"} icon={WalletCards} />
          <Card label="Monthly Plan" value={monthlyAssignment?.plan?.name || "-"} note={nextDueDate ? `Next due ${nextDueDate.toLocaleDateString("en-IN")}` : "No monthly plan assigned"} icon={CalendarClock} />
          <Card label="Unpaid Invoices" value={unpaidInvoices.length} note={unpaidInvoices[0] ? `${formatINR(unpaidInvoices[0].totalAmount)} next payment` : "No pending invoices"} icon={AlertTriangle} />
          <Card label="Paid Invoices" value={paidInvoices.length} note="Payment history" icon={Banknote} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950">Credit Usage History</h2>
                <p className="text-xs text-slate-500">Recent credit movement.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{recentCredits.length} recent</span>
                <Link href="/fees/credit-history" className="rounded-full border border-brand/15 px-3 py-1 text-xs font-bold text-brand hover:bg-brand hover:text-white">View all</Link>
              </div>
            </div>
            <div className="space-y-2">
              {recentCredits.length ? recentCredits.map((item: any) => (
                <div key={item._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <div className="font-bold text-slate-950">{item.type === "purchase" ? "Credits added" : item.type === "attendance_consumption" ? "Class credit used" : "Credit adjustment"}</div>
                    <div className="text-xs text-slate-500">{item.note || "Credit ledger entry"} - {new Date(item.createdAt).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-right">
                    <div className={item.credits > 0 ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{item.credits > 0 ? "+" : ""}{item.credits}</div>
                    <div className="text-xs text-slate-500">Balance {item.balanceAfter}</div>
                  </div>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No credit usage has been recorded yet.</div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-950">Invoices & Payment History</h2>
              <p className="text-xs text-slate-500">Latest invoices and PDFs.</p>
            </div>
            <div className="grid gap-3 md:hidden">
              {invoices.length ? invoices.slice(0, 12).map((invoice: any) => (
                <article key={invoice._id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-950">{invoice.invoiceNumber || "Invoice"}</div>
                      <div className="mt-1 text-xs text-slate-500">{invoice.title}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(invoice.status)}`}>{invoice.status}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <InfoBox label="Due" value={new Date(invoice.dueDate).toLocaleDateString("en-IN")} />
                    <InfoBox label="Amount" value={formatINR(invoice.totalAmount)} />
                  </div>
                  <a href={`/api/fees/invoices/${invoice._id}/pdf`} target="_blank" className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-brand">
                    <Download size={14} /> PDF
                  </a>
                </article>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No invoices have been generated yet.</div>
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-3 py-3">Invoice</th>
                    <th className="px-3 py-3">Due</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length ? invoices.slice(0, 12).map((invoice: any) => (
                    <tr key={invoice._id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3">
                        <div className="font-bold text-slate-950">{invoice.invoiceNumber || "Invoice"}</div>
                        <div className="text-xs text-slate-500">{invoice.title}</div>
                      </td>
                      <td className="px-3 py-3">{new Date(invoice.dueDate).toLocaleDateString("en-IN")}</td>
                      <td className="px-3 py-3 font-bold">{formatINR(invoice.totalAmount)}</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(invoice.status)}`}>{invoice.status}</span></td>
                      <td className="px-3 py-3">
                        <a href={`/api/fees/invoices/${invoice._id}/pdf`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-brand">
                          <Download size={14} /> PDF
                        </a>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">No invoices have been generated yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const quickLinks: Array<[string, string]> = [
    ...(feePlanPermissions.view || feePlanPermissions.edit ? [["/fees/fee-plans", "Fee Plans"]] as Array<[string, string]> : []),
    ...(studentFeePermissions.view || studentFeePermissions.edit ? [["/fees/student-fees", "Student Fees"]] as Array<[string, string]> : []),
    ...(creditPermissions.view || creditPermissions.credit ? [["/fees/credit-monitoring", "Credit Monitoring"]] as Array<[string, string]> : []),
    ...(invoicePermissions.view || invoicePermissions.invoice ? [["/fees/invoices", "Invoices"]] as Array<[string, string]> : []),
    ...(invoicePermissions.view ? [["/fees/deleted-invoices", "Deleted Invoices"]] as Array<[string, string]> : []),
    ...(reportPermissions.view || reportPermissions.export ? [["/fees/reports", "Reports"]] as Array<[string, string]> : []),
    ...(role === "admin" ? [["/admin/settings", "Academy Setup"]] as Array<[string, string]> : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Fees</div>
        <h1 className="text-xl font-bold text-slate-950">Fees Dashboard</h1>
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
        <Card label="Deleted Invoices" value={deletedInvoiceCount} note="Audit trail with reasons" icon={FileX2} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold">Quick Links</h2>
          <div className="grid grid-cols-1 gap-2">
            {quickLinks.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">{label}</Link>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold">Students With Low Credits</h2>
          <div className="space-y-2 text-sm">
            {lowCredit.slice(0, 8).map((a: any) => (
              <div key={a._id} className="flex items-center justify-between gap-3 rounded-md bg-rose-50 px-3 py-2 text-rose-900">
                <span>{a.student?.name || "Student"}</span><b>{a.creditBalance}</b>
              </div>
            ))}
            {lowCredit.length === 0 && <p className="text-slate-500">No low credit students.</p>}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold">Recent Transactions</h2>
          <div className="space-y-2 text-sm">
            {recentCredits.map((item: any) => (
              <div key={item._id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}
