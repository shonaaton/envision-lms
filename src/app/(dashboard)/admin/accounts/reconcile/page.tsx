import { AlertTriangle, Landmark, Scale } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { rupees, shortMonth } from "@/components/accounts/format";
import { DataPanel, PageHeader } from "@/components/common/PageHeader";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { accountsFyOptions, accountsRangeForFy } from "@/lib/accounts/data";
import { monthsBetween } from "@/lib/accounts/metrics";
import { loadReconciliation, type ReconcileMonth } from "@/lib/accounts/reconcile";
import { financialYearLabel } from "@/lib/payPeriods";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

type Line = { label: string; value: (row: ReconcileMonth) => number; strong?: boolean; flag?: (row: ReconcileMonth) => boolean; note?: string };

function MonthGrid({ months, lines }: { months: ReconcileMonth[]; lines: Line[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-right text-sm tabular-nums">
        <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
          <tr>
            <th className="sticky left-0 border-b border-slate-200 bg-white px-3 py-2 text-left" />
            {months.map((row) => (
              <th key={row.month} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-bold">
                {shortMonth(row.month)}
                {!row.hasStatement && <div className="text-[10px] font-semibold normal-case text-amber-700">no statement</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className={cn("border-b border-slate-100 last:border-0", line.strong && "bg-brand-50/40")}>
              <th
                title={line.note}
                className={cn("sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left font-medium text-slate-700", line.strong ? "bg-brand-50 font-black text-slate-950" : "pl-6")}
              >
                {line.label}
              </th>
              {months.map((row) => {
                const value = line.value(row);
                return (
                  <td key={row.month} className={cn("whitespace-nowrap px-3 py-1.5", line.strong && "font-bold", line.flag?.(row) && "font-bold text-rose-700")}>
                    {value ? rupees(value) : "-"}
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

export default async function ReconcilePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;

  const params = searchParams ? await searchParams : {};
  const options = accountsFyOptions();
  const requested = Number(param(params, "fy"));
  const fyStart = options.includes(requested) ? requested : options[0];
  const range = accountsRangeForFy(fyStart);
  const months = monthsBetween(range.from, range.to);
  const data = await loadReconciliation(months);

  const feeLines: Line[] = [
    { label: "Portal: fees paid", value: (r) => r.portal.total, strong: true },
    { label: "Paid in cash", value: (r) => r.portal.cash, note: "Bills marked paid in Cash, or matched to the cash sheet" },
    { label: "Should have reached the bank", value: (r) => r.portal.intoBank },
    { label: "Bank: student fees received", value: (r) => r.bank.feeReceipts, strong: true },
    { label: "of which Razorpay settlements", value: (r) => r.bank.razorpay },
    { label: "Bank minus portal", value: (r) => (r.hasStatement ? r.bank.feeReceipts - r.portal.intoBank : 0), note: "Positive: fees reached the bank that the portal never billed. Negative: the portal dates a payment later than the bank." },
    {
      label: "Bank fees not in the portal (P&L)",
      value: (r) => r.notInPortal,
      strong: true,
      note: "Running total of bank minus portal, never below zero - what the P&L adds to revenue before taking out GST",
    },
    { label: "Other money in: owner, loans, refunds", value: (r) => r.bank.nonPl + r.bank.otherIncome },
    { label: "Not classified yet", value: (r) => r.bank.unclassified, flag: (r) => r.bank.unclassified > 0 },
  ];
  const gstLines: Line[] = [
    { label: "GST on the portal's GST bills", value: (r) => r.portal.gstTax },
    { label: "GST paid to the government for the month", value: (r) => r.gstPaid, strong: true },
    {
      label: "Paid beyond the portal's bills",
      value: (r) => Math.max(0, r.gstPaid - r.portal.gstTax),
      flag: (r) => r.gstPaid - r.portal.gstTax > 100_00,
      note: "GST-billed fees the portal does not have. The P&L takes this GST out of the bank fees not in the portal.",
    },
    { label: "GST-billed fees implied (GST paid / 18%)", value: (r) => Math.round(r.gstPaid / 0.18) },
    { label: "GST bills in the portal, before GST", value: (r) => r.portal.gstGross - r.portal.gstTax },
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title="Cross-check"
        icon={Landmark}
        subtitle="Portal fees against what reached the bank, GST billed against GST paid, and offline fees that may duplicate a portal bill."
      />

      <AccountsNav active="/admin/accounts/reconcile" query={`?fy=${fyStart}`} />

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

      <DataPanel className="mt-3" title="Fees: portal against bank" subtitle="Gross amounts, GST included. Google Pay settles in batches, so this compares totals, not bill by bill." icon={Scale}>
        <MonthGrid months={data.months} lines={feeLines} />
      </DataPanel>

      <DataPanel className="mt-3" title="GST: billed against paid" subtitle="GST paid is booked to the month it was for" icon={Scale}>
        <MonthGrid months={data.months} lines={gstLines} />
        <p className="mt-2 text-xs text-slate-500">
          GST paid is after input credit (on ads and software), so the GST actually charged on fees is at least this much. A red month means GST-billed fees are missing from the
          portal.
        </p>
      </DataPanel>

      <DataPanel className="mt-3" title="Offline fees against student bills" subtitle={range.label} icon={AlertTriangle}>
        {data.offlineFlags.length === 0 ? (
          <p className="text-sm text-slate-600">
            No offline fee matches a portal bill of the same amount.
            {data.unlinkedOffline ? ` ${data.unlinkedOffline} offline fee entries have no student linked, so they could not be checked.` : ""}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {data.offlineFlags.map((flag) => (
              <li key={`${flag.entryId}-${flag.invoiceNumber}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <b>{flag.student}</b> - offline {rupees(flag.amount)} on {day(flag.date)}
                </span>
                {flag.kind === "double" ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
                    Possible double count: bill {flag.invoiceNumber} was also paid in the portal
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                    May be the payment for {flag.invoiceStatus} bill {flag.invoiceNumber} ({rupees(flag.invoiceTotal)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DataPanel>
    </div>
  );
}
