import { HandCoins, Landmark, UserX } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { ReceivableRow } from "@/components/accounts/CashClient";
import { rupees } from "@/components/accounts/format";
import { DataPanel, EmptyState, PageHeader, StatCard } from "@/components/common/PageHeader";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { loadReceivables } from "@/lib/accounts/cashData";
import type { ReceivableStudent } from "@/lib/accounts/receivables";

export const dynamic = "force-dynamic";

const GROUPS: { key: ReceivableStudent["group"][]; title: string; subtitle: string; label: Record<string, string> }[] = [
  {
    key: ["active", "paused"],
    title: "Collectable",
    subtitle: "Current students' unpaid bills",
    label: { active: "active", paused: "on a break" },
  },
  {
    key: ["probably_left"],
    title: "Probably left",
    subtitle: "Still active in the portal, but nothing paid for 60+ days and a bill over 30 days overdue. Check, then cancel the bills and deactivate the student.",
    label: { probably_left: "no payment for 60+ days" },
  },
  {
    key: ["left"],
    title: "Left",
    subtitle: "Deactivated students whose bills were never cancelled. Not money the academy will collect.",
    label: { left: "deactivated" },
  },
];

const HEADER = ["Student", "Bills", "Not yet due", "1-30 days late", "31-60 days late", "60+ days late", "Total", "Last paid"];

export default async function ReceivablesPage() {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;
  const { students, summary } = await loadReceivables();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title="Receivables"
        icon={Landmark}
        subtitle="Fees billed in the portal and not yet paid. Bills for students who have left are kept apart, so the money you can expect is not overstated."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <StatCard label="Collectable" value={rupees(summary.collectable)} note="Current students" icon={HandCoins} tone="green" />
          <StatCard label="Probably left" value={rupees(summary.doubtful)} note="Check and cancel" icon={UserX} tone="amber" />
          <StatCard label="Left (not collectable)" value={rupees(summary.left)} note="Bills to cancel" icon={UserX} tone="rose" />
        </div>
      </PageHeader>

      <AccountsNav active="/admin/accounts/receivables" />

      {GROUPS.map((group) => {
        const rows = students.filter((row) => group.key.includes(row.group));
        const total = rows.reduce((sum, row) => sum + row.total, 0);
        return (
          <DataPanel key={group.title} className="mt-3" title={`${group.title} - ${rupees(total)}`} subtitle={group.subtitle} icon={HandCoins}>
            {rows.length === 0 ? (
              <EmptyState title="Nothing here" />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
                    <tr>
                      {HEADER.map((label, index) => (
                        <th key={label} className={`border-b border-slate-200 px-3 py-2 font-bold ${index > 0 && index < 7 ? "text-right" : ""}`}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <ReceivableRow
                        key={row.studentId}
                        name={row.name}
                        username={row.username}
                        groupLabel={group.label[row.group] || row.group}
                        total={row.total}
                        buckets={row.buckets}
                        lastPaidAt={row.lastPaidAt ? row.lastPaidAt.toISOString() : ""}
                        invoices={row.invoices.map((invoice) => ({ ...invoice, dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : "" }))}
                        canCancel
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataPanel>
        );
      })}
    </div>
  );
}
