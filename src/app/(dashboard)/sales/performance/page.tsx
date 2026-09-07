import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { resolveRange } from "@/lib/feesAnalytics";
import { getSalesAnalytics, SALES_SECTIONS } from "@/lib/salesAnalytics";
import { logSalesView, requireSalesViewer } from "@/lib/salesAudit";
import { FinanceDashboard } from "@/components/fees/FinanceDashboard";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";

export const dynamic = "force-dynamic";

/**
 * The sales cut of the finance dashboard.
 *
 * It renders the same component admins see, with four of the six sections and no
 * export. The narrowing that matters happens in `getSalesAnalytics` - collections
 * and revenue projections are absent from the payload, not merely hidden.
 */
export default async function SalesPerformancePage() {
  const viewer = await requireSalesViewer("salesPerformance");
  if (!viewer) redirect("/dashboard");

  await dbConnect();
  const { from, to } = resolveRange(null, null);
  const analytics = await getSalesAnalytics({ from, to });
  logSalesView(viewer, "salesPerformance", { range: analytics.range });

  return (
    <NoCopyShell viewer={viewer.name}>
      <FinanceDashboard
        initial={analytics}
        quickLinks={[]}
        endpoint="/api/sales/analytics"
        sections={SALES_SECTIONS}
        canExport={false}
        showGstFilter={false}
      />
      <div className="bg-slate-50 pb-8">
        <SalesDataNotice />
      </div>
    </NoCopyShell>
  );
}
