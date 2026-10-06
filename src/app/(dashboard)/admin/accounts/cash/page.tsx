import { Landmark, Wallet } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { CashSettingsForm } from "@/components/accounts/CashClient";
import { rupees, shortMonth } from "@/components/accounts/format";
import { DataPanel, PageHeader, StatCard } from "@/components/common/PageHeader";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { categoryLabel } from "@/lib/accounts/categories";
import { loadCashBook } from "@/lib/accounts/cashData";
import { accountsFyOptions, accountsRangeForFy } from "@/lib/accounts/data";
import { monthsBetween } from "@/lib/accounts/metrics";
import { financialYearLabel } from "@/lib/payPeriods";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function balanceText(amount: number, holder: string) {
  return amount >= 0 ? `${rupees(amount)} with ${holder}` : `${holder} is owed ${rupees(-amount)}`;
}

export default async function CashBookPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;

  const params = searchParams ? await searchParams : {};
  const options = accountsFyOptions();
  const requested = Number(param(params, "fy"));
  const fyStart = options.includes(requested) ? requested : options[0];
  const range = accountsRangeForFy(fyStart);
  const months = monthsBetween(range.from, range.to);
  const book = await loadCashBook(months);
  const groups = Array.from(new Set(book.rows.flatMap((row) => Object.keys(row.outByGroup)))).sort();
  const totalIn = book.rows.reduce((sum, row) => sum + row.feesIn + row.otherIn, 0);
  const totalOut = book.rows.reduce((sum, row) => sum + row.out, 0);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title="Cash book"
        icon={Landmark}
        subtitle={`Cash the academy holds through ${book.holder}: cash fees in (portal bills paid in cash, and offline fees entered as cash), cash costs out. Counted by the month the cash changed hands.`}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard
            label={book.closing >= 0 ? `Cash with ${book.holder}` : `${book.holder} has paid from his own pocket`}
            value={rupees(Math.abs(book.closing))}
            note={book.closing >= 0 ? "Should be in hand today" : "The academy owes him this"}
            icon={Wallet}
            tone={book.closing >= 0 ? "green" : "rose"}
          />
          <StatCard label="Cash in" value={rupees(totalIn)} note={range.label} icon={Wallet} tone="purple" />
          <StatCard label="Cash out" value={rupees(totalOut)} note={range.label} icon={Wallet} tone="amber" />
        </div>
      </PageHeader>

      <AccountsNav active="/admin/accounts/cash" query={`?fy=${fyStart}`} />

      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Financial year
          <select name="fy" defaultValue={String(fyStart)} className="input h-9 w-36">
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
      </form>

      <DataPanel className="mt-3" title="Month by month" subtitle="A negative balance means the holder paid academy costs from his own money" icon={Wallet}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm tabular-nums">
            <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="sticky left-0 border-b border-slate-200 bg-white px-3 py-2 text-left" />
                {book.rows.map((row) => (
                  <th key={row.month} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-bold">
                    {shortMonth(row.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <th className="sticky left-0 bg-white px-3 py-1.5 text-left font-medium text-slate-700">Opening balance</th>
                {book.rows.map((row) => (
                  <td key={row.month} className={cn("px-3 py-1.5", row.opening < 0 && "text-rose-700")}>
                    {rupees(row.opening)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <th className="sticky left-0 bg-white px-3 py-1.5 pl-6 text-left font-medium text-slate-700">Cash fees received</th>
                {book.rows.map((row) => (
                  <td key={row.month} className="px-3 py-1.5 text-emerald-700">
                    {row.feesIn ? rupees(row.feesIn) : "-"}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-100">
                <th className="sticky left-0 bg-white px-3 py-1.5 pl-6 text-left font-medium text-slate-700">Other cash in</th>
                {book.rows.map((row) => (
                  <td key={row.month} className="px-3 py-1.5">
                    {row.otherIn ? rupees(row.otherIn) : "-"}
                  </td>
                ))}
              </tr>
              {groups.map((group) => (
                <tr key={group} className="border-b border-slate-100">
                  <th className="sticky left-0 bg-white px-3 py-1.5 pl-6 text-left font-normal text-slate-500">{categoryLabel(group)}</th>
                  {book.rows.map((row) => (
                    <td key={row.month} className="px-3 py-1.5 text-slate-600">
                      {row.outByGroup[group] ? `-${rupees(row.outByGroup[group])}` : "-"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-brand-50/40">
                <th className="sticky left-0 bg-brand-50 px-3 py-1.5 text-left font-black text-slate-950">Closing balance</th>
                {book.rows.map((row) => (
                  <td key={row.month} className={cn("px-3 py-1.5 font-bold", row.closing < 0 ? "text-rose-700" : "text-slate-950")} title={balanceText(row.closing, book.holder)}>
                    {rupees(row.closing)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Portal bills marked paid in &ldquo;Cash&rdquo; count as cash (&ldquo;Others&rdquo; does not - it was used for bank payments). Cash costs are entries in Costs &amp; offline income with &ldquo;Paid from: Cash&rdquo;.
          When cash is deposited in the bank, add a &ldquo;Transfer between accounts&rdquo; entry paid from cash.
        </p>
      </DataPanel>

      <DataPanel className="mt-3" title="Opening cash" icon={Wallet}>
        <CashSettingsForm openingCash={book.openingCash} cashHolder={book.holder} />
      </DataPanel>
    </div>
  );
}
