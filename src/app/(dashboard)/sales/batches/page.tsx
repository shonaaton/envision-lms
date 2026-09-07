import { redirect } from "next/navigation";
import { getBatchVacancy } from "@/lib/batchVacancy";
import { logSalesView, requireSalesViewer } from "@/lib/salesAudit";
import { BatchVacancyBoard } from "@/components/sales/BatchVacancyBoard";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";

export const dynamic = "force-dynamic";

export default async function BatchVacancyPage() {
  const viewer = await requireSalesViewer("batchVacancy");
  if (!viewer) redirect("/dashboard");

  const data = await getBatchVacancy();
  logSalesView(viewer, "batchVacancy", { batches: data.rows.length });

  return (
    <NoCopyShell viewer={viewer.name}>
      <BatchVacancyBoard data={data} />
      <div className="bg-slate-50 pb-8">
        <SalesDataNotice />
      </div>
    </NoCopyShell>
  );
}
