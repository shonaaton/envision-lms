import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Inbox, Receipt, RotateCcw, Users } from "lucide-react";

import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { academyDateKey } from "@/lib/academyTime";
import { academyMonthOf, monthLabel, shiftMonth } from "@/lib/feedback/feedbackCycleDates";
import { isMonthKey } from "@/lib/staffInvoice";
import { resolveStaffInvoiceViewer } from "@/lib/staffInvoiceAccess";
import { loadInvoiceRegister } from "@/lib/staffInvoiceData";
import { formatINR } from "@/lib/utils";
import { markInvoicePaid } from "../actions";

export const dynamic = "force-dynamic";

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function formatDate(iso: string) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-";
}

export default async function StaffInvoiceRegisterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveStaffInvoiceViewer();
  if (!viewer?.canViewAll) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = searchParams ? await searchParams : {};
  const current = academyMonthOf(new Date());
  const requested = value(params, "month");
  // Staff invoice a month once it ends, so the month just gone is what the
  // office is usually collecting.
  const month = isMonthKey(requested) ? requested : shiftMonth(current, -1);
  const months = Array.from({ length: 13 }, (_, index) => shiftMonth(current, -index));
  const { rows, notInvoiced } = await loadInvoiceRegister(month);

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const unpaid = rows.filter((row) => row.status !== "paid");
  const today = academyDateKey(new Date());

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Payroll workspace"
        title="Staff Invoices"
        icon={Receipt}
        subtitle="Invoices coaches and staff raised for a month, checked against what Coach Pay says their classes cost."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Invoiced" value={formatINR(total)} note={`${rows.length} invoices - ${monthLabel(month)}`} icon={Receipt} tone="purple" />
          <StatCard label="Awaiting payment" value={unpaid.length} note={formatINR(unpaid.reduce((sum, row) => sum + row.total, 0))} icon={CheckCircle2} tone="amber" />
          <StatCard label="Not invoiced yet" value={notInvoiced.length} note="Coaches with classes this month" icon={Users} tone="blue" />
        </div>
      </PageHeader>

      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Month
          <select name="month" defaultValue={month} className="input h-9 w-48">
            {months.map((item) => (
              <option key={item} value={item}>
                {monthLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-outline h-9 px-4 text-xs">
          Show
        </button>
        <Link href="/coach-pay/proposals" className="btn-ghost h-9 px-4 text-xs">
          <Inbox size={14} /> Coach submissions
        </Link>
      </form>

      <DataPanel className="mt-3" title={`Invoices for ${monthLabel(month)}`} icon={Receipt}>
        {rows.length === 0 ? (
          <EmptyState title="No invoices for this month" description="Invoices appear here as staff generate them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Staff</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Invoice no.</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Classes</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Other items</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Invoice total</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Coach Pay says</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Status</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const payroll = row.payrollTotal ?? 0;
                  const mismatch = row.classTotal !== payroll;
                  return (
                    <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-950">{row.staffName}</div>
                        <div className="text-xs text-slate-500">Generated {formatDate(row.generatedAt)}</div>
                        {row.coachEnteredLines > 0 && (
                          <div className="mt-0.5 text-xs text-amber-700">
                            {row.coachEnteredLines} {row.coachEnteredLines === 1 ? "row" : "rows"} priced by them
                            {row.pendingProposals > 0 && (
                              <>
                                {" - "}
                                <Link href="/coach-pay/proposals" className="font-bold underline">
                                  {row.pendingProposals} awaiting approval
                                </Link>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">{row.invoiceNumber}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatINR(row.classTotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.manualTotal ? formatINR(row.manualTotal) : "-"}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{formatINR(row.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatINR(payroll)}
                        {mismatch && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                            <AlertTriangle size={12} /> differs by {formatINR(Math.abs(row.classTotal - payroll))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${
                            row.status === "paid" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-sky-200"
                          }`}
                        >
                          {row.status === "paid" ? "Paid" : "Submitted"}
                        </span>
                        {row.status === "paid" && (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {formatDate(row.paidAt)}
                            {row.paymentReference ? ` - ${row.paymentReference}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-end gap-2">
                          <a href={`/api/staff-invoices/${row.id}/pdf`} className="btn-ghost h-8 px-3 text-xs">
                            <Download size={13} /> PDF
                          </a>
                          {viewer.canManage && row.status !== "paid" && (
                            <form action={markInvoicePaid} className="flex flex-wrap items-center justify-end gap-1">
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="decision" value="paid" />
                              <input name="reference" className="input h-8 w-32 text-xs" placeholder="Payment ref" aria-label="Payment reference" />
                              <input name="paidOn" type="date" defaultValue={today} className="input h-8 w-32 text-xs" aria-label="Paid on" />
                              <button type="submit" className="btn-primary h-8 px-3 text-xs">
                                <CheckCircle2 size={13} /> Mark paid
                              </button>
                            </form>
                          )}
                          {viewer.canManage && row.status === "paid" && (
                            <form action={markInvoicePaid}>
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="decision" value="reopen" />
                              <button type="submit" className="btn-ghost h-8 px-3 text-xs">
                                <RotateCcw size={13} /> Reopen
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>

      {notInvoiced.length > 0 && (
        <DataPanel className="mt-3" title="Taught this month, no invoice yet" subtitle="From Coach Pay" icon={Users}>
          <ul className="divide-y divide-slate-100 text-sm">
            {notInvoiced.map((row) => (
              <li key={row.coachId} className="flex items-center justify-between gap-3 py-2">
                <span className="font-semibold text-slate-950">{row.coachName}</span>
                <span className="text-xs text-slate-500">
                  {formatINR(row.payrollTotal)}
                  {row.unpriced ? ` - ${row.unpriced} classes without a rate` : ""}
                </span>
              </li>
            ))}
          </ul>
        </DataPanel>
      )}
    </div>
  );
}
