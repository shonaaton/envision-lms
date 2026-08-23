import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BarChart3, ClipboardList, FileSpreadsheet, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2ReportsPage() {
  return (
    <AdminV2Shell title="Reports Center" description="A v2 system page for operational, academic, and finance reporting entry points." activeHref="/admin-v2/reports">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "System",
          heading: "Reports Center",
          summary: "Collect the main report entry points into one v2 page for faster admin review.",
          stats: [
            { label: "Academic", value: "8" },
            { label: "Finance", value: "5", tone: "accent" },
            { label: "Activity", value: "12" },
            { label: "Exports", value: "4" },
          ],
          primaryAction: { label: "Open Reports", href: "/admin/reports", description: "Open reports center.", icon: BarChart3 },
          actions: [
            { label: "Admin Reports", href: "/admin/reports", description: "Open the current reports center.", icon: FileSpreadsheet },
            { label: "Fee Reports", href: "/admin-v2/fees/reports", description: "Review collection and billing reports.", icon: WalletCards },
            { label: "Activity Tracker", href: "/admin/activity-tracker", description: "Export and inspect activity records.", icon: ClipboardList },
          ],
          rows: [
            { label: "Weekly academic snapshot", detail: "Compare attendance, homework, and activity trends.", status: "Weekly" },
            { label: "Fee collection", detail: "Review finance reports before parent follow-up.", status: "Open" },
            { label: "Activity export", detail: "Export student activity for internal review.", status: "Ready" },
          ],
          notes: ["Use source pages for detailed report exports.", "Check attendance before academic summaries.", "Check invoices before finance summaries."],
        }}
      />
    </AdminV2Shell>
  );
}
