import { redirect } from "next/navigation";
import { getSalesDirectory } from "@/lib/salesDirectory";
import { logSalesView, requireSalesViewer } from "@/lib/salesAudit";
import { SalesDirectory } from "@/components/sales/SalesDirectory";
import { NoCopyShell, SalesDataNotice } from "@/components/sales/NoCopyShell";

export const dynamic = "force-dynamic";

export default async function SalesDirectoryPage() {
  const viewer = await requireSalesViewer("salesDirectory");
  if (!viewer) redirect("/dashboard");

  const data = await getSalesDirectory();
  logSalesView(viewer, "salesDirectory", {
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
