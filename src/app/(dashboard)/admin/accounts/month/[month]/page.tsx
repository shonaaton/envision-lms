import Link from "next/link";
import { ArrowLeft, Banknote, Calculator, ChevronLeft, ChevronRight, Landmark, PiggyBank, Wallet } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { margin, monthLabel, rupees } from "@/components/accounts/format";
import { DataPanel, PageHeader, StatCard } from "@/components/common/PageHeader";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { ACCOUNT_CATEGORIES, EXPENSE_CATEGORIES, NON_PL_CATEGORIES, categoryLabel, moneyAccountLabel } from "@/lib/accounts/categories";
import { loadMonthDetail, type DetailLine } from "@/lib/accounts/monthDetail";
import { ACCOUNTS_START_MONTH } from "@/lib/accounts/metrics";
import { academyMonthOf, shiftMonth } from "@/lib/feedback/feedbackCycleDates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function day(iso: string) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) : "-";
}

function Lines({ lines, empty = "Nothing this month." }: { lines: DetailLine[]; empty?: string }) {
  if (!lines.length) return <p className="py-1 text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-slate-100 align-top last:border-0">
              <td className="w-16 whitespace-nowrap py-1.5 pr-3 tabular-nums text-slate-500">{day(line.date)}</td>
              <td className="py-1.5 pr-3">
                <div className="break-words text-slate-900">{line.title}</div>
                {line.detail && <div className="text-xs text-slate-500">{line.detail}</div>}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-xs text-slate-500">
                {line.account ? moneyAccountLabel(line.account) : ""}
                {line.tag ? <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{line.tag}</span> : null}
              </td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                <div className={cn("font-semibold", line.amount < 0 ? "text-rose-700" : "text-slate-950")}>{rupees(line.amount)}</div>
                {line.tax ? <div className="text-xs text-slate-500">incl. tax {rupees(line.tax)}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ id, title, total, note, children }: { id: string; title: string; total: number; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-slate-200 pt-3 first:border-0 first:pt-0 target:rounded-md target:bg-accent-50/60 target:px-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        <span className="text-sm font-black tabular-nums text-slate-950">{rupees(total)}</span>
      </div>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

const sum = (lines: DetailLine[]) => lines.reduce((total, line) => total + line.amount, 0);

export default async function MonthDetailPage({ params }: { params: Promise<{ month: string }> }) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return <div className="p-6 text-sm text-slate-600">Unknown month.</div>;

  const data = await loadMonthDetail(month);
  const m = data.report;
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const current = academyMonthOf(new Date());
  const fy = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 4 ? 1 : 0);

  const costCategories = EXPENSE_CATEGORIES.filter((category) => (m.cost.byCategory[category.key] || 0) !== 0 || data.ledgerByCategory[category.key]?.length);
  const otherIncomeKeys = ACCOUNT_CATEGORIES.filter((category) => category.kind === "income" && category.key !== "offline_fees").map((category) => category.key);
  const nonPl = NON_PL_CATEGORIES.filter((category) => data.ledgerByCategory[category.key]?.length);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Admin only" title={monthLabel(month)} icon={Landmark} subtitle="Every figure behind this month on the overview, down to the bill, bank row or entry.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Revenue (net of GST)" value={rupees(m.revenue.total)} note={`GST collected ${rupees(m.gstCollected)}`} icon={Banknote} tone="purple" />
          <StatCard label="Total cost" value={rupees(m.cost.total)} note={`Teacher pay ${rupees(m.cost.teacher)}`} icon={Calculator} tone="amber" />
          <StatCard
            label={m.netProfit >= 0 ? "Net profit" : "Net loss"}
            value={rupees(m.netProfit)}
            note={`Margin ${margin(m.netMargin)}`}
            icon={PiggyBank}
            tone={m.netProfit >= 0 ? "green" : "rose"}
          />
          <StatCard label="Students" value={`${m.students.paying} paying`} note={`${m.students.active} active - ${m.students.new} new, ${m.students.left} left`} icon={Wallet} tone="blue" />
        </div>
      </PageHeader>

      <AccountsNav active="/admin/accounts" query={`?fy=${fy}`} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/admin/accounts?fy=${fy}`} className="btn-ghost h-9 px-3 text-xs">
          <ArrowLeft size={14} /> Overview
        </Link>
        {previous >= ACCOUNTS_START_MONTH && (
          <Link href={`/admin/accounts/month/${previous}`} className="btn-outline h-9 px-3 text-xs">
            <ChevronLeft size={14} /> {monthLabel(previous)}
          </Link>
        )}
        {next <= current && (
          <Link href={`/admin/accounts/month/${next}`} className="btn-outline h-9 px-3 text-xs">
            {monthLabel(next)} <ChevronRight size={14} />
          </Link>
        )}
        <Link href={`/admin/accounts/cash/${month}`} className="btn-ghost h-9 px-3 text-xs">
          <Wallet size={14} /> Cash dealings this month
        </Link>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <DataPanel title={`Revenue - ${rupees(m.revenue.total)}`} subtitle="Amounts shown with GST; the revenue line takes GST out" icon={Banknote}>
          <div className="space-y-4">
            <Block id="revenue-gst" title="Portal GST bills paid" total={sum(data.portalGst)} note={`Counts as ${rupees(m.revenue.gstPortalNet)} after GST`}>
              <Lines lines={data.portalGst} />
            </Block>
            <Block id="revenue-nongst" title="Portal non-GST bills paid" total={sum(data.portalNonGst)}>
              <Lines lines={data.portalNonGst} />
            </Block>
            <Block id="revenue-offline" title="Offline fees" total={sum(data.ledgerByCategory.offline_fees || [])} note="Fees never billed in the portal">
              <Lines lines={data.ledgerByCategory.offline_fees || []} />
            </Block>
            <Block
              id="revenue-bank"
              title="Bank fees not in the portal"
              total={m.revenue.bankNotInPortal}
              note={
                data.bankVsPortal
                  ? `Student fees into HDFC ${rupees(data.bankVsPortal.bank)} against portal bills paid into the bank ${rupees(data.bankVsPortal.portal)}, on the running total since April${
                      data.bankVsPortal.notInPortal !== m.revenue.bankNotInPortal
                        ? ` (${rupees(data.bankVsPortal.notInPortal)}), less ${rupees(data.bankVsPortal.notInPortal - m.revenue.bankNotInPortal)} GST paid beyond the portal's GST bills`
                        : ""
                    }. The bank's fee receipts this month:`
                  : "No bank statement covers this month."
              }
            >
              <Lines lines={data.bankReceipts} empty="No fee receipts on the statement this month." />
            </Block>
            {(data.otherPortal.length > 0 || data.portalRefunds.length > 0 || otherIncomeKeys.some((key) => data.ledgerByCategory[key]?.length)) && (
              <Block
                id="revenue-other"
                title="Other income and refunds"
                total={sum(data.otherPortal) + sum(data.portalRefunds) + otherIncomeKeys.reduce((total, key) => total + sum(data.ledgerByCategory[key] || []), 0)}
              >
                <Lines lines={[...data.otherPortal, ...data.portalRefunds, ...otherIncomeKeys.flatMap((key) => data.ledgerByCategory[key] || [])]} />
              </Block>
            )}
          </div>
        </DataPanel>

        <DataPanel title={`Costs - ${rupees(m.cost.total)}`} subtitle="Pay to people is the full amount before TDS" icon={Calculator}>
          <div className="space-y-4">
            {costCategories.length === 0 && <p className="text-sm text-slate-500">No costs recorded for this month.</p>}
            {costCategories.map((category) => {
              const lines = [...(data.staffByCategory[category.key] || []), ...(data.estimatesByCategory[category.key] || []), ...(data.ledgerByCategory[category.key] || [])];
              return (
                <Block key={category.key} id={`cost-${category.key}`} title={category.label} total={m.cost.byCategory[category.key] || 0}>
                  <Lines lines={lines} />
                </Block>
              );
            })}
          </div>
        </DataPanel>
      </div>

      {nonPl.length > 0 && (
        <DataPanel className="mt-3" title="Not profit or loss" subtitle="GST and TDS paid, owner money, loans, transfers, and pay already on a staff invoice" icon={Landmark}>
          <div className="space-y-4">
            {nonPl.map((category) => (
              <Block key={category.key} id={`nonpl-${category.key}`} title={categoryLabel(category.key)} total={sum(data.ledgerByCategory[category.key] || [])}>
                <Lines lines={data.ledgerByCategory[category.key] || []} />
              </Block>
            ))}
          </div>
        </DataPanel>
      )}
    </div>
  );
}
