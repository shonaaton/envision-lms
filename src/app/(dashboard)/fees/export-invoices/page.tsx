import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, Globe2, Plus } from "lucide-react";
import { getFeaturePermissionState } from "@/lib/featureAccess";
import { isFeesManager } from "@/lib/feesAccess";
import { academyDateKey } from "@/lib/academyTime";
import { formatINR } from "@/lib/utils";
import { formatForeign } from "@/lib/exportInvoice";
import { financialYearOf, monthLabel, monthlyBreakdown, resolveExportPeriod, summarizeExportRows } from "@/lib/exportInvoiceReport";
import { loadExportRegister } from "@/lib/exportInvoiceRegister";

export const dynamic = "force-dynamic";

/** Financial years from the first LUT (FY 2026-27) to the current one, newest first. */
function financialYearOptions(now = new Date()) {
  const current = Number(financialYearOf(academyDateKey(now)).slice(0, 4));
  const years: string[] = [];
  for (let start = current; start >= 2026; start -= 1) years.push(`${start}-${String((start + 1) % 100).padStart(2, "0")}`);
  return years;
}

function statusTone(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-slate-100 text-slate-500";
  if (status === "overdue") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

function shortDate(key: string) {
  if (!key) return "-";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function ExportInvoicesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!(session?.user as any)?.id) redirect("/login");
  const permissions = await getFeaturePermissionState("feeReports", session!.user as any, ["view", "export"]);
  if (!isFeesManager((session!.user as any).role) || !(permissions.view || permissions.export)) redirect("/fees");
  const params = searchParams ? await searchParams : {};
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const period = resolveExportPeriod({ month: one("month"), fy: one("fy") });
  const rows = await loadExportRegister(period);
  const summary = summarizeExportRows(rows);
  const months = period.kind === "fy" ? monthlyBreakdown(rows, period) : [];
  const query = period.kind === "fy" ? `fy=${period.fy}` : `month=${period.month}`;
  const fyOptions = financialYearOptions();
  const currentMonth = academyDateKey(new Date()).slice(0, 7);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700"><Globe2 size={20} /></span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">For the accounts team</div>
              <h1 className="text-xl font-bold">Export invoices (LUT)</h1>
              <p className="mt-0.5 max-w-xl text-sm text-slate-500">
                Zero-rated invoices to clients outside India, for GSTR-1 table 6A (WOPAY) and the LUT records. Download a month for the monthly return or a full financial year for the annual filing.
              </p>
            </div>
          </div>
          <a href="/fees/invoices/new" className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-brand/30 hover:text-brand"><Plus size={14} /> New export invoice</a>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="min-w-0 flex-1 text-xs font-bold text-slate-600">
              Month
              <input type="month" name="month" defaultValue={period.kind === "month" ? period.month : currentMonth} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-950" />
            </label>
            <button className="h-10 rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-700">Show month</button>
          </form>
          <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="min-w-0 flex-1 text-xs font-bold text-slate-600">
              Financial year (April to March)
              <select name="fy" defaultValue={period.kind === "fy" ? period.fy : fyOptions[0]} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-950">
                {fyOptions.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
              </select>
            </label>
            <button className="h-10 rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-700">Show year</button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Showing</div>
            <h2 className="text-lg font-bold">{period.label}</h2>
          </div>
          {permissions.export ? (
            <div className="flex flex-wrap gap-2">
              <a href={`/api/fees/export-invoices?${query}&format=xlsx`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"><FileSpreadsheet size={16} /> Download Excel</a>
              <a href={`/api/fees/export-invoices?${query}&format=csv`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:border-emerald-300"><Download size={16} /> CSV</a>
            </div>
          ) : (
            <span className="text-xs text-slate-500">You can view this register but not download it.</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Invoices" value={String(summary.invoices)} note={summary.cancelled ? `${summary.cancelled} cancelled, not counted` : "Excludes cancelled"} />
          <Stat label="Taxable value" value={formatINR(summary.inrValue)} note="IGST nil under LUT" />
          <Stat label="Foreign value" value={summary.byCurrency.length ? summary.byCurrency.map((item) => formatForeign(item.amount, item.currency)).join(" · ") : "-"} note={summary.byCurrency.length > 1 ? `${summary.byCurrency.length} currencies` : "As invoiced"} />
          <Stat label="Received" value={formatINR(summary.inrReceived)} note={summary.unpaid ? `${summary.unpaid} invoice${summary.unpaid === 1 ? "" : "s"} unpaid` : "All paid"} />
        </div>

        {months.length ? (
          <div className="mt-5 overflow-x-auto">
            <h3 className="mb-2 text-sm font-bold">Month by month</h3>
            <table className="min-w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Invoices</th>
                  <th className="px-3 py-2 text-right">Taxable value</th>
                  <th className="px-3 py-2">Foreign value</th>
                  <th className="px-3 py-2 text-right">Received</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {months.map((item) => (
                  <tr key={item.month} className={`border-b border-slate-50 ${item.invoices ? "" : "text-slate-400"}`}>
                    <td className="px-3 py-2 font-semibold">{monthLabel(item.month)}</td>
                    <td className="px-3 py-2 text-right">{item.invoices}</td>
                    <td className="px-3 py-2 text-right">{formatINR(item.inrValue)}</td>
                    <td className="px-3 py-2">{item.byCurrency.map((entry) => formatForeign(entry.amount, entry.currency)).join(" · ") || "-"}</td>
                    <td className="px-3 py-2 text-right">{formatINR(item.inrReceived)}</td>
                    <td className="px-3 py-2 text-right">
                      {item.invoices && permissions.export ? <a href={`/api/fees/export-invoices?month=${item.month}&format=xlsx`} className="text-xs font-bold text-emerald-700 hover:underline">Excel</a> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-5">
          <h3 className="mb-2 text-sm font-bold">Invoices</h3>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">In INR</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={`border-b border-slate-50 ${row.counts ? "" : "text-slate-400 line-through"}`}>
                      <td className="px-3 py-2 font-bold">{row.invoiceNumber}</td>
                      <td className="px-3 py-2">{shortDate(row.invoiceDate)}</td>
                      <td className="px-3 py-2"><div className="font-semibold">{row.clientName || "-"}</div><div className="text-xs text-slate-500">{row.country}</div></td>
                      <td className="px-3 py-2 text-right font-semibold">{formatForeign(row.foreignAmount, row.currency)}</td>
                      <td className="px-3 py-2 text-right">₹{row.exchangeRate}</td>
                      <td className="px-3 py-2 text-right">{formatINR(row.inrValue)}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone(row.status)}`}>{row.status}</span>{row.paidOn ? <div className="mt-0.5 text-[11px] text-slate-500">{shortDate(row.paidOn)}</div> : null}</td>
                      <td className="px-3 py-2 text-right"><a href={`/api/fees/invoices/${row.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand hover:underline">PDF</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No export invoices in {period.label}.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-lg font-black text-slate-950">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{note}</div>
    </div>
  );
}
