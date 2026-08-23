import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BarChart3, Download, FileSpreadsheet, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2FeeReportsPage() {
  return (
    <AdminV2Shell title="Financial Reports" description="Review fee collection, invoices, credits, and month-end finance signals from admin v2." activeHref="/admin-v2/fees/reports">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Financial",
          heading: "Fee Reports",
          summary: "A compact reporting page for finance checks before exporting or reconciling fee data.",
          stats: [
            { label: "Collected", value: "82%" },
            { label: "Due", value: "18%", tone: "accent" },
            { label: "Credits", value: "11" },
            { label: "Exports", value: "5" },
          ],
          primaryAction: { label: "Open Reports", href: "/fees/reports", description: "Open fee reports.", icon: BarChart3 },
          actions: [
            { label: "Fee Reports", href: "/fees/reports", description: "Review collection summaries and monthly reports.", icon: FileSpreadsheet },
            { label: "Student Billing", href: "/admin-v2/fees/student-fees", description: "Trace report issues back to student accounts.", icon: WalletCards },
            { label: "Export Data", href: "/fees/reports", description: "Use the existing report export workflow.", icon: Download },
          ],
          rows: [
            { label: "Monthly collection", detail: "Confirm totals before sharing internal summaries.", status: "Review" },
            { label: "Credit impact", detail: "Explain collection variance caused by credit usage.", status: "Trace" },
            { label: "Invoice mismatch", detail: "Resolve invoice totals that differ from report totals.", status: "Check" },
          ],
          notes: ["Reports should follow invoice and credit verification.", "Use student billing to investigate mismatches.", "Export only after month-end checks are complete."],
        }}
      />
    </AdminV2Shell>
  );
}
