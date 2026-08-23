import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { CreditCard, History, UserRoundCheck, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2StudentFeesPage() {
  return (
    <AdminV2Shell title="Student Billing & Credits" description="Review student balances, credits, payment status, and billing follow-ups." activeHref="/admin-v2/fees/student-fees">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Financial",
          heading: "Student Billing",
          summary: "A v2 finance page for student-level billing checks before opening the full student fees workflow.",
          stats: [
            { label: "Due", value: "18", tone: "accent" },
            { label: "Credits", value: "11" },
            { label: "Plans", value: "52" },
            { label: "History", value: "96" },
          ],
          primaryAction: { label: "Open Student Fees", href: "/fees/student-fees", description: "Manage student billing.", icon: WalletCards },
          actions: [
            { label: "Student Fees", href: "/fees/student-fees", description: "View balances, payments, and credits by student.", icon: UserRoundCheck },
            { label: "Credit Monitoring", href: "/fees/credit-monitoring", description: "Audit credit usage and carry-forward balances.", icon: CreditCard },
            { label: "Credit History", href: "/fees/credit-history", description: "Review historical credit changes.", icon: History },
          ],
          rows: [
            { label: "High-balance accounts", detail: "Review accounts before reminder messages.", status: "Focus" },
            { label: "Credit anomalies", detail: "Check unusual credit changes before invoice runs.", status: "Audit" },
            { label: "Plan assignment", detail: "Confirm new students have billing plans.", status: "Open" },
          ],
          notes: ["Validate credits before parent messages.", "Use history when changing a billing decision.", "Invoice only after plan and attendance checks are complete."],
        }}
      />
    </AdminV2Shell>
  );
}
