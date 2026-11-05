import { redirect } from "next/navigation";

import { BatchVacancyBoard } from "@/components/sales/BatchVacancyBoard";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";
import { getBatchVacancy } from "@/lib/batchVacancy";
import { requireRetentionViewer } from "@/lib/retention/retentionAccess";
import { logSalesView } from "@/lib/salesAudit";

export const dynamic = "force-dynamic";

/** Batch Vacancy for retention calls: also lists group batches down to one student. */
export default async function RetentionBatchesPage() {
  const viewer = await requireRetentionViewer();
  if (!viewer) redirect("/dashboard?restricted=1");

  const data = await getBatchVacancy({ includeSingleStudent: true });
  logSalesView(viewer, "batchVacancy", { from: "retention", batches: data.rows.length });

  return (
    <NoCopyShell viewer={viewer.name}>
      <BatchVacancyBoard data={data} variant="retention" />
      <div className="bg-slate-50 pb-8">
        <SalesDataNotice />
      </div>
    </NoCopyShell>
  );
}
