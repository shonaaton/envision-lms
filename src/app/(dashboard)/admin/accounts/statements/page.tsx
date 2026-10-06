import Link from "next/link";
import { FileSpreadsheet, Landmark, ListFilter } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { rupees } from "@/components/accounts/format";
import { DeleteRuleButton, DeleteStatementButton, StatementUpload } from "@/components/accounts/StatementClient";
import { DataPanel, EmptyState, PageHeader } from "@/components/common/PageHeader";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { categoryLabel } from "@/lib/accounts/categories";
import { listRules, listStatements } from "@/lib/accounts/statementData";

export const dynamic = "force-dynamic";

function day(iso: string) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-";
}

export default async function StatementsPage() {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;
  const [statements, rules] = await Promise.all([listStatements(), listRules()]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title="Bank statements"
        icon={Landmark}
        subtitle="Upload the academy's bank statement from net banking. Each row is matched to a portal payment, a staff invoice or a cost, and you confirm what it is. Rows already uploaded are recognised and skipped, so overlapping statements are safe."
      >
        <StatementUpload />
      </PageHeader>

      <AccountsNav active="/admin/accounts/statements" />

      <DataPanel className="mt-3" title="Uploaded statements" icon={FileSpreadsheet}>
        {statements.length === 0 ? (
          <EmptyState title="No statements yet" description="Upload an .xlsx or .csv statement to start checking revenue against the bank." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">File</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Period</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Rows</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">In</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Out</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">To do</th>
                  <th className="border-b border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {statements.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/admin/accounts/statements/${item.id}`} className="font-semibold text-brand hover:underline">
                        {item.fileName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {item.accountLabel ? `${item.accountLabel} - ` : ""}uploaded {day(item.createdAt)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      {day(item.periodFrom)} to {day(item.periodTo)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.newRows}
                      {item.duplicateRows ? <div className="text-xs text-slate-500">{item.duplicateRows} seen before</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{rupees(item.totalCredit)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{rupees(item.totalDebit)}</td>
                    <td className="px-3 py-2">
                      {item.unclassified ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">{item.unclassified} rows</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Done</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DeleteStatementButton id={item.id} label={item.fileName} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>

      <DataPanel className="mt-3" title="Remembered rules" subtitle="Narration text that books a row automatically. Added from the statement review." icon={ListFilter}>
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. Built-in rules already recognise Facebook / Google ads, CESC, Airtel / Jio, Razorpay, bank charges, GST and TDS payments.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  Money {rule.direction === "debit" ? "out" : "in"} containing <b>&ldquo;{rule.pattern}&rdquo;</b> is <b>{categoryLabel(rule.category)}</b>
                </span>
                <DeleteRuleButton id={rule.id} />
              </li>
            ))}
          </ul>
        )}
      </DataPanel>
    </div>
  );
}
