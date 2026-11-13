import { FileSpreadsheet, Globe2 } from "lucide-react";
import { academyDateKey } from "@/lib/academyTime";
import { formatINR } from "@/lib/utils";
import { formatForeign } from "@/lib/exportInvoice";
import { financialYearOf, monthLabel, resolveExportPeriod, summarizeExportRows } from "@/lib/exportInvoiceReport";
import { loadExportRegister } from "@/lib/exportInvoiceRegister";

function previousMonth(month: string) {
  const [year, mm] = month.split("-").map(Number);
  return mm === 1 ? `${year - 1}-12` : `${year}-${String(mm - 1).padStart(2, "0")}`;
}

function previousFy(fy: string) {
  const start = Number(fy.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Fee dashboard section: this month and this financial year of export (LUT) invoices, with one-click downloads for the accounts team. */
export async function ExportInvoicesPanel({ canExport }: { canExport: boolean }) {
  const today = academyDateKey(new Date());
  const month = today.slice(0, 7);
  const fy = financialYearOf(today);
  const fyPeriod = resolveExportPeriod({ fy });
  const fyRows = await loadExportRegister(fyPeriod);
  const monthSummary = summarizeExportRows(fyRows.filter((row) => row.month === month));
  const fySummary = summarizeExportRows(fyRows);
  const downloads: Array<[string, string]> = [
    [`month=${month}`, `${monthLabel(month)}`],
    [`month=${previousMonth(month)}`, `${monthLabel(previousMonth(month))}`],
    [`fy=${fy}`, `FY ${fy}`],
    [`fy=${previousFy(fy)}`, `FY ${previousFy(fy)}`],
  ];
  const foreign = (summary: ReturnType<typeof summarizeExportRows>) =>
    summary.byCurrency.map((item) => formatForeign(item.amount, item.currency)).join(" · ") || "No foreign billing";

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 bg-sky-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700"><Globe2 size={18} /></span>
          <div>
            <h2 className="text-base font-bold text-slate-950">Export invoices (LUT) for the accounts team</h2>
            <p className="text-xs text-slate-500">Zero-rated invoices to clients abroad. Download a month for the monthly GSTR-1 (table 6A) or a financial year for the annual filing.</p>
          </div>
        </div>
        <a href="/fees/export-invoices" className="inline-flex h-9 items-center rounded-lg border border-sky-200 bg-white px-3 text-xs font-bold text-sky-800 hover:bg-sky-50">Open register</a>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {([[monthLabel(month), monthSummary], [`FY ${fy} so far`, fySummary]] as const).map(([label, summary]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xl font-black text-slate-950">{formatINR(summary.inrValue)}</span>
              <span className="text-sm font-semibold text-slate-600">{summary.invoices} invoice{summary.invoices === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{foreign(summary)}{summary.unpaid ? ` · ${summary.unpaid} unpaid` : ""}</div>
          </div>
        ))}
      </div>
      {canExport ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
          <span className="text-xs font-bold text-slate-500">Download Excel:</span>
          {downloads.map(([query, label]) => (
            <a key={query} href={`/api/fees/export-invoices?${query}&format=xlsx`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
              <FileSpreadsheet size={13} /> {label}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
