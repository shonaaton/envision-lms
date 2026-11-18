import { Download } from "lucide-react";

import { shortMonth } from "@/components/accounts/format";
import { DataPanel } from "@/components/common/PageHeader";
import { financialYearLabel } from "@/lib/payPeriods";

type Props = {
  /** Newest first: [{ fyStart, months }]. */
  years: { fyStart: number; months: string[] }[];
  account?: "cash" | "bank";
  /** "fy:2026" or "2026-10"; the newest year when blank. */
  period?: string;
  className?: string;
};

/**
 * Download the cash or HDFC statement for one month or the whole financial
 * year. A plain GET form, so the browser saves the file the route returns.
 */
export function StatementDownload({ years, account = "cash", period = "", className }: Props) {
  return (
    <DataPanel
      className={className}
      title="Download account statement"
      subtitle="Every debit and credit with the balance after each, and a month-by-month summary (Excel). CSV has the lines only."
      icon={Download}
    >
      <form method="get" action="/api/admin/accounts/statement" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Account
          <select name="account" defaultValue={account} className="input h-9 w-52">
            <option value="cash">Cash (with Sayantan)</option>
            <option value="bank">HDFC bank</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          Period
          <select name="period" defaultValue={period || (years[0] ? `fy:${years[0].fyStart}` : "")} className="input h-9 w-48">
            {years.map((year) => (
              <optgroup key={year.fyStart} label={financialYearLabel(year.fyStart)}>
                <option value={`fy:${year.fyStart}`}>Whole {financialYearLabel(year.fyStart)}</option>
                {[...year.months].reverse().map((item) => (
                  <option key={item} value={item}>
                    {shortMonth(item)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">
          File
          <select name="format" defaultValue="xlsx" className="input h-9 w-28">
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <button type="submit" className="btn-primary h-9 px-4 text-xs">
          <Download size={14} />
          Download
        </button>
      </form>
    </DataPanel>
  );
}
