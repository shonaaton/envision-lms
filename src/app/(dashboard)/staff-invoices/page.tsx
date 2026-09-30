import Link from "next/link";
import { BookOpenCheck, Download, Pencil, Receipt, Table2 } from "lucide-react";

import { DataPanel, EmptyState, PageHeader } from "@/components/common/PageHeader";
import { InvoiceBuilder } from "@/components/staff-invoices/InvoiceBuilder";
import { PayoutProfileForm } from "@/components/staff-invoices/PayoutProfileForm";
import { monthLabel } from "@/lib/feedback/feedbackCycleDates";
import { ACCOUNT_TYPE_LABELS, eligibleInvoiceMonths, isMonthKey } from "@/lib/staffInvoice";
import { resolveStaffInvoiceViewer } from "@/lib/staffInvoiceAccess";
import { loadInvoiceDraft, loadInvoiceHistory, loadPayoutProfile } from "@/lib/staffInvoiceData";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || "";
}

function maskAccount(number: string) {
  return number.length > 4 ? `${"x".repeat(Math.min(6, number.length - 4))}${number.slice(-4)}` : number;
}

export default async function StaffInvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveStaffInvoiceViewer();
  if (!viewer) return <div className="p-6 text-sm text-slate-600">Forbidden</div>;
  if (!viewer.canCreate) {
    return (
      <div className="p-6 text-sm text-slate-600">
        You can read staff invoices in the{" "}
        <Link href="/staff-invoices/register" className="font-bold text-brand underline">
          register
        </Link>
        .
      </div>
    );
  }

  const params = searchParams ? await searchParams : {};
  const profile = await loadPayoutProfile(viewer.userId);
  const editing = value(params, "edit") === "1";

  if (!profile || editing) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="My invoices"
          title={profile ? "My invoice details" : "Set up your invoices"}
          icon={Receipt}
          subtitle="Your name, address, PAN, bank account and signature, as they print on every invoice you raise to the academy."
        />
        <div className="mt-3 max-w-3xl">
          <PayoutProfileForm initial={profile} isFirstTime={!profile} cancelHref={profile ? "/staff-invoices" : undefined} />
        </div>
      </div>
    );
  }

  const months = eligibleInvoiceMonths();
  const requested = value(params, "month");
  const month = isMonthKey(requested) && months.some((item) => item.month === requested) ? requested : months[0].month;
  const [draft, history] = await Promise.all([loadInvoiceDraft(viewer.userId, month), loadInvoiceHistory(viewer.userId)]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="My invoices"
        title="Monthly Invoice"
        icon={Receipt}
        subtitle="Your invoice to the academy for a month, dated on its last day. Everything is calculated from the pay plan and rates the academy set for you; you can add other agreed items."
      >
        <div className="flex flex-wrap items-start gap-4 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
          <div>
            <div className="font-bold text-slate-950">{profile.fullName}</div>
            <div>PAN {profile.pan}</div>
          </div>
          <div>
            <div className="font-bold text-slate-950">{profile.bankName}</div>
            <div>
              {ACCOUNT_TYPE_LABELS[profile.accountType]} {maskAccount(profile.accountNumber)} - {profile.ifsc}
            </div>
          </div>
          <Link href="/staff-invoices?edit=1" className="btn-outline h-8 px-3 text-xs">
            <Pencil size={13} /> Edit my details
          </Link>
          {viewer.role === "instructor" && (
            <Link href="/coach-pay" className="btn-ghost h-8 px-3 text-xs">
              <BookOpenCheck size={13} /> My earnings
            </Link>
          )}
          {viewer.canViewAll && (
            <Link href="/staff-invoices/register" className="btn-ghost h-8 px-3 text-xs">
              <Table2 size={13} /> All staff invoices
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="mt-3">
        <InvoiceBuilder
          key={month}
          month={month}
          monthLabel={monthLabel(month)}
          months={months}
          fullName={profile.fullName}
          groups={draft.groups}
          pending={draft.pending}
          missing={draft.missing}
          manual={draft.manual}
          invoiceNumber={draft.invoiceNumber}
          existing={draft.existing}
        />
      </div>

      <DataPanel className="mt-3" title="My past invoices" icon={Receipt}>
        {history.length === 0 ? (
          <EmptyState title="No invoices yet" description="Invoices you generate appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Month</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Invoice no.</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Total</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Status</th>
                  <th className="border-b border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-semibold">{monthLabel(row.month)}</td>
                    <td className="px-3 py-2">{row.invoiceNumber}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{formatINR(row.total)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${
                          row.status === "paid" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-sky-200"
                        }`}
                      >
                        {row.status === "paid" ? "Paid" : "Submitted"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/api/staff-invoices/${row.id}/pdf`} download={row.fileName} className="btn-ghost h-8 px-3 text-xs">
                        <Download size={13} /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>
    </div>
  );
}
