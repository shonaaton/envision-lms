import { redirect } from "next/navigation";
import { getCrmPayload } from "@/lib/crm/leads";
import { logSalesView, requireSalesViewer } from "@/lib/salesAudit";
import { CrmWorkspace } from "@/components/sales/CrmWorkspace";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";

export const dynamic = "force-dynamic";

export default async function SalesCrmPage() {
  const viewer = await requireSalesViewer("salesCrm", ["view", "stage", "note"]);
  if (!viewer) redirect("/dashboard");

  const data = await getCrmPayload();
  logSalesView(viewer, "salesCrm", { leads: data.leads.length });

  return (
    <NoCopyShell viewer={viewer.name}>
      <CrmWorkspace initial={data} canChangeStage={viewer.permissions.stage} canLog={viewer.permissions.note} />
      <div className="bg-slate-50 pb-8">
        <SalesDataNotice />
      </div>
    </NoCopyShell>
  );
}
