import Link from "next/link";
import { BadgeIndianRupee, CalendarDays, LineChart, Wallet } from "lucide-react";

import { CoachPayTabs } from "@/components/coach-pay/CoachPayTabs";
import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { resolveCoachPayViewer } from "@/lib/coachPayAccess";
import { loadCoachProfitability } from "@/lib/coachProfitability";
import { resolvePayPeriod } from "@/lib/payPeriods";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

const reportPath = "/coach-pay/profitability";

export default async function CoachProfitabilityPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveCoachPayViewer();
  if (!viewer?.canViewProfitability) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;

  const params = await searchParams ?? {};
  const preset = Array.isArray(params.period) ? params.period[0] : params.period;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const period = resolvePayPeriod({
    period: preset === "last_month" ? preset : preset === "month" && /^(?!00)\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "") ? "month" : "this_month",
    month,
  });
  const report = await loadCoachProfitability(period);
  const net = report.revenue - report.cost;

  return (
    <div className="min-h-screen space-y-3 bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <CoachPayTabs active="profitability" month={period.month} />
      <PageHeader eyebrow="Coach Pay" title="Coach Profitability" icon={LineChart} subtitle={period.label}>
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Attributed revenue" value={formatINR(report.revenue)} icon={BadgeIndianRupee} tone="blue" />
          <StatCard label="Total coach cost" value={formatINR(report.cost)} icon={Wallet} tone="purple" />
          <StatCard label="Gain / loss" value={formatINR(net)} icon={LineChart} tone={net < 0 ? "rose" : "green"} />
        </div>
      </PageHeader>

      <form action={reportPath} method="get" className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <Link href={reportPath} aria-current={period.preset === "this_month" ? "page" : undefined}
          className={`${period.preset === "this_month" ? "btn-primary" : "btn-outline"} h-9 px-4 text-xs`}>
          This month
        </Link>
        <Link href={`${reportPath}?period=last_month`} aria-current={period.preset === "last_month" ? "page" : undefined}
          className={`${period.preset === "last_month" ? "btn-primary" : "btn-outline"} h-9 px-4 text-xs`}>
          Previous month
        </Link>
        <input type="hidden" name="period" value="month" />
        <input key={period.month} type="month" name="month" aria-label="Select reporting month" defaultValue={period.month} required className="input h-9 w-auto" />
        <button type="submit" className="btn-outline h-9 px-4 text-xs"><CalendarDays size={14} /> View month</button>
      </form>

      <p className="text-sm text-slate-600">
        Revenue uses LMS fee collections excluding GST. Each student’s collections are split by completed classes with each coach in the selected month.
        Fees use the billing month, including unpaid invoices, excluding GST and late fees. Fixed monthly salary is counted once, with zero additional cost for covered substitutions. Gain or loss is before overhead and payment processing fees.
      </p>
      {report.unallocatedRevenue !== 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <strong>{formatINR(report.unallocatedRevenue)} in unallocated revenue.</strong>{" "}
          These monthly fees had no matching completed class for the student this month.
        </p>
      )}
      {report.missingFees > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {report.missingFees} students have no applicable fee invoice. Their class revenue needs review.
        </p>
      )}
      {(report.pendingReview > 0 || report.unpriced > 0) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Coach cost may increase once {report.pendingReview} pending rulings and {report.unpriced} missing rates are resolved.
        </p>
      )}

      <DataPanel title="Profitability by coach">
        {report.rows.length === 0 ? (
          <EmptyState title="No coach activity for this month" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th scope="col" className="p-3">Coach</th>
                  <th scope="col" className="p-3 text-right">Revenue</th>
                  <th scope="col" className="p-3 text-right">Coach cost</th>
                  <th scope="col" className="p-3 text-right">Gain / loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((coach) => {
                  const balance = coach.revenue - coach.cost;
                  const needsReview = coach.pendingReview > 0 || coach.unpriced > 0;
                  return (
                    <tr key={coach.coachId}>
                      <th scope="row" className="p-3 font-medium">
                        <Link href={`/coach-pay?period=month&month=${period.month}&coach=${encodeURIComponent(coach.coachId)}`} className="text-brand hover:underline">
                          {coach.name}
                        </Link>
                                                <span className="block text-xs text-slate-500">{coach.classes.length} classes · {coach.substitutions} substitutions</span>
                        {coach.monthlyCost > 0 && <span className="block text-xs text-slate-500">Fixed salary {formatINR(coach.monthlyCost)}</span>}
                        {needsReview && <span className="block text-xs text-amber-800">Cost pending review</span>}
                      </th>
                      <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatINR(coach.revenue)}</td>
                      <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatINR(coach.cost)}</td>
                      <td className={`whitespace-nowrap p-3 text-right font-semibold tabular-nums ${balance < 0 ? "text-rose-700" : balance > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                        {formatINR(balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>

      <DataPanel title="Class revenue and cost">
        <div className="space-y-3">
          {report.rows.filter((coach) => coach.classes.length > 0).map((coach) => (
            <details key={coach.coachId} className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer font-medium">{coach.name} · {coach.classes.length} classes</summary>
              {coach.monthlyCost > 0 && <p className="mt-2 text-sm text-slate-600">Monthly salary of {formatINR(coach.monthlyCost)} is included in the coach total. Covered classes below show zero additional cost.</p>}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr>
                    <th className="p-2">Class</th><th className="p-2">Student revenue</th>
                    <th className="p-2 text-right">Revenue</th><th className="p-2 text-right">Class cost</th><th className="p-2 text-right">Gain / loss</th>
                  </tr></thead>
                  <tbody>
                    {coach.classes.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="p-2">
                          {item.title}
                          <span className="block text-xs text-slate-500">{item.date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}{item.substitute ? " · Substitution" : ""}</span>
                        </td>
                        <td className="p-2">{item.students.map((student) => (
                          <div key={student.id}>{student.name} · {student.missingFee ? "Fee missing" : formatINR(student.revenue)}</div>
                        ))}</td>
                        <td className="whitespace-nowrap p-2 text-right">{formatINR(item.revenue)}</td>
                        <td className="whitespace-nowrap p-2 text-right">{item.unpriced ? "Rate missing" : formatINR(item.cost)}{item.fixedSalary && <span className="block text-xs text-slate-500">Covered by salary</span>}</td>
                        <td className="whitespace-nowrap p-2 text-right">{item.unpriced ? "Pending rate" : formatINR(item.revenue - item.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </DataPanel>
    </div>
  );
}
