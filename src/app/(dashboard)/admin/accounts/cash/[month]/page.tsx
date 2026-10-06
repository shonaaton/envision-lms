import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Landmark, Wallet } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { monthLabel, rupees } from "@/components/accounts/format";
import { DataPanel, PageHeader, StatCard } from "@/components/common/PageHeader";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { categoryLabel } from "@/lib/accounts/categories";
import { loadCashMonth } from "@/lib/accounts/cashData";
import { ACCOUNTS_START_MONTH } from "@/lib/accounts/metrics";
import { academyMonthOf, shiftMonth } from "@/lib/feedback/feedbackCycleDates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function day(iso: string) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) : "-";
}

function groupLabel(group: string, category?: string) {
  if (group === "fees") return category === "portal_cash_fee" ? "Fee (billed in portal)" : category === "fees" ? "Fee (portal bill)" : "Fee";
  if (group === "other_in") return category ? categoryLabel(category) : "Other cash in";
  return categoryLabel(group);
}

export default async function CashMonthPage({ params }: { params: Promise<{ month: string }> }) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return <div className="p-6 text-sm text-slate-600">Unknown month.</div>;

  const data = await loadCashMonth(month);
  const cashIn = data.items.filter((item) => item.flow === "in");
  const cashOut = data.items.filter((item) => item.flow === "out");
  const totalIn = cashIn.reduce((sum, item) => sum + item.amount, 0);
  const totalOut = cashOut.reduce((sum, item) => sum + item.amount, 0);
  const outByGroup: Record<string, number> = {};
  for (const item of cashOut) outByGroup[item.group] = (outByGroup[item.group] || 0) + item.amount;
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const fy = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 4 ? 1 : 0);
  const balanceText = (amount: number) => (amount >= 0 ? `${rupees(amount)} with ${data.holder}` : `${data.holder} owed ${rupees(-amount)}`);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title={`Cash - ${monthLabel(month)}`}
        icon={Landmark}
        subtitle={`Every rupee of cash ${data.holder} took in or paid out this month, in date order, with the balance after each.`}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Opening" value={rupees(data.opening)} note={balanceText(data.opening)} icon={Wallet} tone="blue" />
          <StatCard label="Cash in" value={rupees(totalIn)} note={`${cashIn.length} items`} icon={Wallet} tone="green" />
          <StatCard label="Cash out" value={rupees(totalOut)} note={`${cashOut.length} items`} icon={Wallet} tone="amber" />
          <StatCard label="Closing" value={rupees(data.closing)} note={balanceText(data.closing)} icon={Wallet} tone={data.closing >= 0 ? "green" : "rose"} />
        </div>
      </PageHeader>

      <AccountsNav active="/admin/accounts/cash" query={`?fy=${fy}`} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/admin/accounts/cash?fy=${fy}`} className="btn-ghost h-9 px-3 text-xs">
          <ArrowLeft size={14} /> Cash book
        </Link>
        {previous >= ACCOUNTS_START_MONTH && (
          <Link href={`/admin/accounts/cash/${previous}`} className="btn-outline h-9 px-3 text-xs">
            <ChevronLeft size={14} /> {monthLabel(previous)}
          </Link>
        )}
        {next <= academyMonthOf(new Date()) && (
          <Link href={`/admin/accounts/cash/${next}`} className="btn-outline h-9 px-3 text-xs">
            {monthLabel(next)} <ChevronRight size={14} />
          </Link>
        )}
        <Link href={`/admin/accounts/month/${month}`} className="btn-ghost h-9 px-3 text-xs">
          Whole month (bank and portal too)
        </Link>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[2fr_1fr]">
        <DataPanel title="Day by day" icon={Wallet}>
          {data.items.length === 0 ? (
            <p className="text-sm text-slate-500">No cash in or out this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 py-2 pr-3 font-bold">Date</th>
                    <th className="border-b border-slate-200 py-2 pr-3 font-bold">What</th>
                    <th className="border-b border-slate-200 py-2 pr-3 font-bold">Type</th>
                    <th className="border-b border-slate-200 py-2 pr-3 text-right font-bold">In</th>
                    <th className="border-b border-slate-200 py-2 pr-3 text-right font-bold">Out</th>
                    <th className="border-b border-slate-200 py-2 text-right font-bold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <td className="py-1.5 pr-3" />
                    <td className="py-1.5 pr-3 italic">Opening balance</td>
                    <td className="py-1.5 pr-3" />
                    <td className="py-1.5 pr-3" />
                    <td className="py-1.5 pr-3" />
                    <td className="py-1.5 text-right tabular-nums">{rupees(data.opening)}</td>
                  </tr>
                  {data.items.map((item, index) => (
                    <tr key={`${item.date}-${index}`} className="border-b border-slate-100 align-top last:border-0">
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-slate-500">{day(item.date)}</td>
                      <td className="py-1.5 pr-3 text-slate-900">{item.label}</td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-xs text-slate-500">{groupLabel(item.group, item.category)}</td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-emerald-700">{item.flow === "in" ? rupees(item.amount) : ""}</td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-rose-700">{item.flow === "out" ? rupees(item.amount) : ""}</td>
                      <td className={cn("whitespace-nowrap py-1.5 text-right font-semibold tabular-nums", item.balance < 0 && "text-rose-700")}>{rupees(item.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataPanel>

        <DataPanel title="Summary" icon={Wallet}>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Opening</dt>
              <dd className="tabular-nums">{rupees(data.opening)}</dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold text-emerald-700">
              <dt>Fees and other cash in</dt>
              <dd className="tabular-nums">+{rupees(totalIn)}</dd>
            </div>
            {Object.entries(outByGroup)
              .sort((a, b) => b[1] - a[1])
              .map(([group, amount]) => (
                <div key={group} className="flex justify-between gap-3 text-slate-600">
                  <dt>{categoryLabel(group)}</dt>
                  <dd className="tabular-nums">-{rupees(amount)}</dd>
                </div>
              ))}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 font-black">
              <dt>Closing</dt>
              <dd className={cn("tabular-nums", data.closing < 0 && "text-rose-700")}>{rupees(data.closing)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Cash costs are entries paid from &ldquo;Cash (with Sayantan)&rdquo;, counted on the day they were paid - March teacher pay handed over in April is April&apos;s cash even
            though the P&amp;L books it to March.
          </p>
        </DataPanel>
      </div>
    </div>
  );
}
