import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Landmark } from "lucide-react";

import { AccountsNav, Forbidden } from "@/components/accounts/AccountsNav";
import { rupees } from "@/components/accounts/format";
import { AcceptAllButton, StatementFilter, StatementRows } from "@/components/accounts/StatementClient";
import { DataPanel, PageHeader } from "@/components/common/PageHeader";
import { resolveAccountsViewer } from "@/lib/accounts/access";
import { ACCOUNT_CATEGORIES } from "@/lib/accounts/categories";
import { loadStatementRows } from "@/lib/accounts/statementData";

export const dynamic = "force-dynamic";

const STATUSES = ["unclassified", "classified", "matched_portal", "ignored"];
const SURE = new Set(["portal", "razorpay", "fee_receipt", "staff_invoice", "ledger", "category"]);

export default async function StatementReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await resolveAccountsViewer();
  if (!viewer) return <Forbidden />;
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const raw = typeof query.status === "string" ? query.status : "";
  const status = raw === "all" ? "" : STATUSES.includes(raw) ? raw : "unclassified";

  const all = await loadStatementRows(id);
  if (!all.summary) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Statement not found. <Link href="/admin/accounts/statements" className="text-brand underline">Back to statements</Link>
      </div>
    );
  }
  const rows = status ? all.rows.filter((row) => row.status === status) : all.rows;
  const counts: Record<string, number> = {};
  for (const row of all.rows) counts[row.status] = (counts[row.status] || 0) + 1;
  const acceptable = all.rows.filter((row) => row.status === "unclassified" && row.suggestion && SURE.has(row.suggestion.type)).length;
  const categoryLabels = Object.fromEntries(ACCOUNT_CATEGORIES.map((category) => [category.key, category.label]));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin only"
        title={all.summary.fileName}
        icon={Landmark}
        subtitle={`${all.rows.length} rows - ${rupees(all.summary.totalCredit)} in, ${rupees(all.summary.totalDebit)} out. Accept the suggestions you agree with, and choose for the rest. Undo is always available.`}
      >
        <Link href="/admin/accounts/statements" className="btn-ghost h-9 px-3 text-xs">
          <ArrowLeft size={14} /> All statements
        </Link>
      </PageHeader>

      <AccountsNav active="/admin/accounts/statements" />

      <DataPanel
        className="mt-3"
        title="Rows"
        icon={FileSpreadsheet}
        action={<AcceptAllButton importId={id} count={acceptable} />}
      >
        <div className="mb-3">
          <StatementFilter importId={id} status={status} counts={counts} />
        </div>
        <StatementRows rows={rows} categories={ACCOUNT_CATEGORIES} categoryLabels={categoryLabels} />
      </DataPanel>
    </div>
  );
}
