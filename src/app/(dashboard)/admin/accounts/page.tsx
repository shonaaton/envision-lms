import Link from "next/link";
import { AlertTriangle, Banknote, Calculator, Download, HandCoins, Landmark, PiggyBank, TrendingUp, Users, Wallet } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { CostMix, ProfitChart, RevenueCostChart } from "@/components/accounts/AccountsCharts";
import { margin, monthLabel, percent, rupees, shortMonth } from "@/components/accounts/format";
import { DataPanel, PageHeader, StatCard } from "@/components/common/PageHeader";
import { academyMonthOf } from "@/lib/feedback/feedbackCycleDates";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/accounts/categories";
import { accountsFyOptions, accountsRangeForFy, loadAccounts } from "@/lib/accounts/data";
import { loadCashBook, loadReceivables } from "@/lib/accounts/cashData";
import { PORTAL_TEACHER_COST_FROM, monthsBetween, type MonthAccounts } from "@/lib/accounts/metrics";
import { financialYearLabel, financialYearOf } from "@/lib/payPeriods";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

type Row = {
  label: string;
  value: (month: MonthAccounts) => number | null;
  format?: "money" | "percent" | "growth" | "count";
  strong?: boolean;
  indent?: boolean;
  /** Colour the figure by its sign (profit green, loss red). */
  signed?: boolean;
  note?: string;
  /** A section label: no figures on its row. */
  heading?: boolean;
};

function show(value: number | null, format: Row["format"] = "money") {
  if (format === "percent") return margin(value);
  if (format === "growth") return percent(value);
  if (format === "count") return value === null ? "-" : value.toLocaleString("en-IN");
  return rupees(value);
}

function MonthTable({ months, total, rows, totalLabel = "Total" }: { months: MonthAccounts[]; total: MonthAccounts; rows: Row[]; totalLabel?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-right text-sm tabular-nums">
        <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
          <tr>
            <th className="sticky left-0 border-b border-slate-200 bg-white px-3 py-2 text-left font-bold" />
            {months.map((month) => (
              <th key={month.month} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-bold">
                {shortMonth(month.month)}
              </th>
            ))}
            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 font-black text-slate-700">{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={cn("border-b border-slate-100 last:border-0", row.strong && "bg-brand-50/40")}>
              <th
                className={cn(
                  "sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left font-medium text-slate-700",
                  row.strong && "bg-brand-50 font-black text-slate-950",
                  row.indent && "pl-7 font-normal text-slate-500"
                )}
                title={row.note}
              >
                {row.label}
              </th>
              {[...months, total].map((month) => {
                const value = row.value(month);
                return (
                  <td
                    key={month.month}
                    className={cn(
                      "whitespace-nowrap px-3 py-1.5",
                      row.strong && "font-bold text-slate-950",
                      month.month === "total" && "bg-slate-50 font-semibold",
                      row.signed && value !== null && value < 0 && "text-rose-700",
                      row.signed && value !== null && value > 0 && "text-emerald-700"
                    )}
                  >
                    {row.heading ? "" : show(value, row.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AccountsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;

  const params = searchParams ? await searchParams : {};
  const options = accountsFyOptions();
  const requested = Number(param(params, "fy"));
  const fyStart = options.includes(requested) ? requested : options[0] ?? financialYearOf(new Date());
  const range = accountsRangeForFy(fyStart);
  const [data, receivables, cash] = await Promise.all([loadAccounts(range), loadReceivables(), loadCashBook(monthsBetween(range.from, range.to))]);
  const { months, total } = data.report;
  // The running month is only partly in, so the cards compare the last full month.
  const current = academyMonthOf(new Date());
  const complete = months.filter((m) => m.month < current);
  const latest = complete[complete.length - 1] || months[months.length - 1];

  // Only categories with money in them, so the P&L is not a wall of zeros.
  const usedCategories = EXPENSE_CATEGORIES.filter((category) => category.key !== "teacher_pay" && (total.cost.byCategory[category.key] || 0) !== 0);
  const hasOther = total.revenue.otherPortal !== 0 || total.revenue.refunds !== 0 || total.revenue.otherIncome !== 0;

  const pnl: Row[] = [
    { label: "GST invoices (net of GST)", value: (m) => m.revenue.gstPortalNet, indent: true },
    { label: "Non-GST invoices (portal)", value: (m) => m.revenue.nonGstPortal, indent: true },
    { label: "Offline fees (non-GST)", value: (m) => m.revenue.offline, indent: true },
    {
      label: "Bank fees not in the portal",
      value: (m) => m.revenue.bankNotInPortal,
      indent: true,
      note: "Student fees that reached HDFC beyond the portal's paid bills (students never billed in the portal), less the GST paid beyond the portal's GST bills. A negative month gives back an earlier surplus when the portal's payment dates trail the bank.",
    },
    ...(hasOther
      ? ([
          { label: "Other portal payments", value: (m) => m.revenue.otherPortal, indent: true, note: "Razorpay payments with no invoice: enrolments, bookings, tournaments" },
          { label: "Refunds", value: (m) => (m.revenue.refunds ? -m.revenue.refunds : 0), indent: true },
          { label: "Other income", value: (m) => m.revenue.otherIncome, indent: true },
        ] as Row[])
      : []),
    { label: "Revenue", value: (m) => m.revenue.total, strong: true },
    { label: "Teacher pay (gross)", value: (m) => m.cost.teacher, indent: true, note: `From portal staff invoices from ${monthLabel(PORTAL_TEACHER_COST_FROM)}; entered by hand before` },
    { label: "Gross profit", value: (m) => m.grossProfit, strong: true, signed: true },
    { label: "Gross margin", value: (m) => m.grossMargin, format: "percent", indent: true },
    ...usedCategories.map((category) => ({ label: category.label, value: (m: MonthAccounts) => m.cost.byCategory[category.key] || 0, indent: true })),
    { label: "Total cost", value: (m) => m.cost.total, strong: true },
    { label: "Net profit / loss", value: (m) => m.netProfit, strong: true, signed: true },
    { label: "Net margin", value: (m) => m.netMargin, format: "percent", indent: true },
    { label: "Revenue growth (MoM)", value: (m) => m.growth.revenue, format: "growth", signed: true },
    { label: "Cost growth (MoM)", value: (m) => m.growth.cost, format: "growth" },
    { label: "Profit growth (MoM)", value: (m) => m.growth.profit, format: "growth", signed: true },
  ];

  const perStudent: Row[] = [
    { label: "Active students", value: (m) => m.students.active, format: "count", note: "Enrolled during the month, not demo, not on a break for the whole month" },
    { label: "Paying students", value: (m) => m.students.paying, format: "count", note: "Paid a portal invoice or an offline fee that month" },
    { label: "New students", value: (m) => m.students.new, format: "count" },
    { label: "Students left", value: (m) => m.students.left, format: "count" },
    { label: "Active student growth (MoM)", value: (m) => m.growth.activeStudents, format: "growth", signed: true },
    { label: "Per paying student", value: () => null, strong: true, heading: true },
    { label: "Revenue", value: (m) => m.perPaying.revenue, indent: true },
    { label: "Teacher cost", value: (m) => m.perPaying.teacherCost, indent: true },
    { label: "Total cost", value: (m) => m.perPaying.cost, indent: true },
    { label: "Profit / loss", value: (m) => m.perPaying.profit, indent: true, signed: true },
    { label: "Per active student", value: () => null, strong: true, heading: true },
    { label: "Revenue", value: (m) => m.perActive.revenue, indent: true },
    { label: "Teacher cost", value: (m) => m.perActive.teacherCost, indent: true },
    { label: "Total cost", value: (m) => m.perActive.cost, indent: true },
    { label: "Profit / loss", value: (m) => m.perActive.profit, indent: true, signed: true },
    { label: "Marketing cost per new student", value: (m) => m.cac, note: "Marketing / ads spend divided by new students that month" },
    { label: "Break-even paying students", value: (m) => m.breakEvenStudents, format: "count", note: "Fixed costs divided by what each paying student leaves after variable costs" },
  ];

  const liabilities: Row[] = [
    { label: "GST collected", value: (m) => m.liabilities.gstCollected },
    { label: "GST paid to government", value: (m) => m.liabilities.gstPaid },
    { label: "TDS withheld from coaches", value: (m) => m.liabilities.tdsWithheld, note: "10% of gross coach pay" },
    { label: "TDS deposited", value: (m) => m.liabilities.tdsDeposited },
  ];

  const gstOwed = total.liabilities.gstCollected - total.liabilities.gstPaid;
  const tdsOwed = total.liabilities.tdsWithheld - total.liabilities.tdsDeposited;
  const costMix = EXPENSE_CATEGORIES.map((category) => ({ label: categoryLabel(category.key), value: total.cost.byCategory[category.key] || 0 }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const chartPoints = months.map((m) => ({ month: m.month, revenue: m.revenue.total, cost: m.cost.total, profit: m.netProfit }));
  const { gaps } = data;
  const gapCount =
    gaps.missingTeacherMonths.length + gaps.handTeacherInPortalMonths.length + gaps.monthsWithoutStatement.length + (gaps.unclassifiedBankRows ? 1 : 0) + (data.teacherGaps.length ? 1 : 0);
  const fyQuery = `?fy=${fyStart}`;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title="Accounts"
        icon={Landmark}
        subtitle={`Profit and loss for ${range.label}, ${monthLabel(range.from)} to ${monthLabel(range.to)}. Revenue is money received, net of GST.`}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Revenue"
            value={rupees(total.revenue.total)}
            note={latest ? `${shortMonth(latest.month)}: ${rupees(latest.revenue.total)} (${percent(latest.growth.revenue)} MoM)` : undefined}
            icon={Banknote}
            tone="purple"
          />
          <StatCard
            label="Total cost"
            value={rupees(total.cost.total)}
            note={`Teacher pay ${rupees(total.cost.teacher)}`}
            icon={Calculator}
            tone="amber"
          />
          <StatCard
            label={total.netProfit >= 0 ? "Net profit" : "Net loss"}
            value={rupees(total.netProfit)}
            note={`Margin ${margin(total.netMargin)}`}
            icon={PiggyBank}
            tone={total.netProfit >= 0 ? "green" : "rose"}
          />
          <StatCard
            label="Profit per paying student / month"
            value={rupees(total.perPaying.profit)}
            note={`Revenue ${rupees(total.perPaying.revenue)} - cost ${rupees(total.perPaying.cost)}`}
            icon={TrendingUp}
            tone="blue"
          />
          <StatCard
            label="Students (monthly average)"
            value={`${total.students.active} active`}
            note={`${total.students.paying} paying - ${total.students.new} joined, ${total.students.left} left`}
            icon={Users}
            tone="purple"
          />
          <StatCard
            label="Owed to government"
            value={rupees(Math.max(0, gstOwed) + Math.max(0, tdsOwed))}
            note={`GST ${rupees(gstOwed)} - TDS ${rupees(tdsOwed)}`}
            icon={Landmark}
            tone="amber"
          />
          <StatCard
            label="Receivables (collectable)"
            value={rupees(receivables.summary.collectable)}
            note={`+ ${rupees(receivables.summary.doubtful + receivables.summary.left)} from students who probably left`}
            icon={HandCoins}
            tone="blue"
          />
          <StatCard
            label={cash.closing >= 0 ? `Cash with ${cash.holder}` : `Owed to ${cash.holder}`}
            value={rupees(Math.abs(cash.closing))}
            note={cash.closing >= 0 ? "Cash fees held, less cash costs paid" : "He paid academy costs from his own money"}
            icon={Wallet}
            tone={cash.closing >= 0 ? "green" : "rose"}
          />
        </div>
      </PageHeader>

      <AccountsNav active="/admin/accounts" query={fyQuery} />

      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Financial year
          <select name="fy" defaultValue={String(fyStart)} className="input h-9 w-40">
            {options.map((year) => (
              <option key={year} value={year}>
                {financialYearLabel(year)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-outline h-9 px-4 text-xs">
          Show
        </button>
        <a href={`/api/admin/accounts/export${fyQuery}`} className="btn-ghost h-9 px-4 text-xs">
          <Download size={14} /> Download Excel
        </a>
      </form>

      {gapCount > 0 && (
        <DataPanel className="mt-3 border-amber-200 bg-amber-50/60" title="Missing data - these months are not complete yet" icon={AlertTriangle}>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {gaps.missingTeacherMonths.length > 0 && (
              <li>
                No teacher pay entered for <b>{gaps.missingTeacherMonths.map((month) => shortMonth(month)).join(", ")}</b>. Coach pay is only in the portal from{" "}
                {monthLabel(PORTAL_TEACHER_COST_FROM)}; add earlier months in{" "}
                <Link className="font-semibold text-brand underline" href="/admin/accounts/ledger">
                  Costs &amp; offline income
                </Link>
                .
              </li>
            )}
            {gaps.handTeacherInPortalMonths.length > 0 && (
              <li>
                Teacher pay typed in by hand for{" "}
                <b>{gaps.handTeacherInPortalMonths.map((gap) => `${shortMonth(gap.month)} (${rupees(gap.amount)})`).join(", ")}</b> is added on top of the portal staff
                invoices. If those payments are already on a staff invoice, change them to &ldquo;Coach pay already on a staff invoice&rdquo; so they are not counted twice.
              </li>
            )}
            {gaps.monthsWithoutStatement.length > 0 && (
              <li>
                No bank statement rows for <b>{gaps.monthsWithoutStatement.map((month) => shortMonth(month)).join(", ")}</b> -{" "}
                <Link className="font-semibold text-brand underline" href="/admin/accounts/statements">
                  upload a statement
                </Link>{" "}
                to cross-check revenue.
              </li>
            )}
            {gaps.unclassifiedBankRows > 0 && (
              <li>
                <b>{gaps.unclassifiedBankRows}</b> bank statement rows are not classified yet, so their costs or income are not in these figures.
              </li>
            )}
            {data.teacherGaps.length > 0 && (
              <li>
                Coach pay earned but not invoiced yet is included as an estimate from Coach Pay:{" "}
                {data.teacherGaps
                  .slice(0, 8)
                  .map((gap) => `${gap.coachName} (${shortMonth(gap.month)}) ${rupees(gap.amount)}${gap.unpriced ? `, ${gap.unpriced} unpriced classes` : ""}`)
                  .join("; ")}
                {data.teacherGaps.length > 8 ? ` and ${data.teacherGaps.length - 8} more` : ""}.
              </li>
            )}
          </ul>
        </DataPanel>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <DataPanel title="Revenue and cost by month" icon={Banknote}>
          <RevenueCostChart points={chartPoints} />
        </DataPanel>
        <DataPanel title="Profit or loss by month" icon={PiggyBank}>
          <ProfitChart points={chartPoints} />
        </DataPanel>
      </div>

      <DataPanel className="mt-3" title="Profit and loss" subtitle="Hover a row name for how it is counted" icon={Calculator}>
        <MonthTable months={months} total={total} rows={pnl} />
      </DataPanel>

      <div className="mt-3 grid gap-3 xl:grid-cols-[2fr_1fr]">
        <DataPanel title="Students and per-student economics" subtitle="Total column: monthly averages and per student per month" icon={Users}>
          <MonthTable months={months} total={total} rows={perStudent} totalLabel="Year" />
        </DataPanel>
        <DataPanel title="Where the money went" subtitle={range.label} icon={Calculator}>
          <CostMix rows={costMix} />
        </DataPanel>
      </div>

      <DataPanel className="mt-3" title="GST and TDS" subtitle="Money held for the government - not revenue and not cost" icon={Landmark}>
        <MonthTable months={months} total={total} rows={liabilities} />
      </DataPanel>
    </div>
  );
}
