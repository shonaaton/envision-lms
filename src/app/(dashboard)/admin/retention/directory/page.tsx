import { redirect } from "next/navigation";

import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";
import { SalesDirectory } from "@/components/sales/SalesDirectory";
import { requireRetentionViewer } from "@/lib/retention/retentionAccess";
import { logSalesView } from "@/lib/salesAudit";
import { getSalesDirectory } from "@/lib/salesDirectory";

export const dynamic = "force-dynamic";

/** The Contact Directory on the Retention grant, logged and watermarked like the Sales one. */
export default async function RetentionDirectoryPage() {
  const viewer = await requireRetentionViewer();
  if (!viewer) redirect("/dashboard?restricted=1");

  const data = await getSalesDirectory();
  logSalesView(viewer, "salesDirectory", {
    from: "retention",
    students: data.students.length,
    coaches: data.coaches.length,
    demos: data.demos.length,
  });

  return (
    <NoCopyShell viewer={viewer.name}>
      <SalesDirectory data={data} />
      <div className="bg-slate-50 pb-8">
        <SalesDataNotice />
      </div>
    </NoCopyShell>
  );
}
