import { BookOpen, Landmark } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { rupees, shortMonth } from "@/components/accounts/format";
import { LedgerImport, LedgerWorkspace } from "@/components/accounts/LedgerWorkspace";
import { DataPanel, PageHeader, StatCard } from "@/components/common/PageHeader";
import { academyDateKey } from "@/lib/academyTime";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { ACCOUNT_CATEGORIES, accountCategory } from "@/lib/accounts/categories";
import { accountsFyOptions, accountsRangeForFy } from "@/lib/accounts/data";
import { listEntries } from "@/lib/accounts/ledger";
import { monthsBetween } from "@/lib/accounts/metrics";
import { financialYearLabel } from "@/lib/payPeriods";

export const dynamic = "force-dynamic";

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

export default async function AccountsLedgerPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;

  const params = searchParams ? await searchParams : {};
  const options = accountsFyOptions();
  const requested = Number(param(params, "fy"));
  const fyStart = options.includes(requested) ? requested : options[0];
  const range = accountsRangeForFy(fyStart);
  const months = monthsBetween(range.from, range.to);
  const month = months.includes(param(params, "month")) ? param(params, "month") : "";
  const category = accountCategory(param(params, "category"))?.key || "";

  const rows = await listEntries({ month, months, category });
  const totals = { income: 0, expense: 0, non_pl: 0 } as Record<string, number>;
  for (const row of rows) totals[accountCategory(row.category)?.kind || row.kind] += row.amount;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title="Costs & offline income"
        icon={Landmark}
        subtitle="Everything the portal does not already know: costs, coach pay before September 2026, offline fees, and GST / TDS paid to the government."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Costs" value={rupees(totals.expense)} note={`${month ? shortMonth(month) : range.label}`} icon={BookOpen} tone="amber" />
          <StatCard label="Offline / other income" value={rupees(totals.income)} note={`${rows.filter((row) => accountCategory(row.category)?.kind === "income").length} entries`} icon={BookOpen} tone="green" />
          <StatCard label="Not profit / loss" value={rupees(totals.non_pl)} note="GST, TDS, owner money, transfers" icon={BookOpen} tone="blue" />
        </div>
      </PageHeader>

      <AccountsNav active="/admin/accounts/ledger" query={`?fy=${fyStart}`} />

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
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Month
          <select name="month" defaultValue={month} className="input h-9 w-36">
            <option value="">All months</option>
            {months.map((item) => (
              <option key={item} value={item}>
                {shortMonth(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Category
          <select name="category" defaultValue={category} className="input h-9 w-56">
            <option value="">All categories</option>
            {ACCOUNT_CATEGORIES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-outline h-9 px-4 text-xs">
          Show
        </button>
      </form>

      <div className="mt-3">
        <LedgerImport />
      </div>

      <DataPanel className="mt-3" title="Entries" subtitle={`${rows.length} entries`} icon={BookOpen}>
        <LedgerWorkspace rows={rows} categories={ACCOUNT_CATEGORIES} today={academyDateKey(new Date())} />
      </DataPanel>
    </div>
  );
}
