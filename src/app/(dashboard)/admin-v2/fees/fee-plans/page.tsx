import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BadgeIndianRupee, CalendarClock, CreditCard, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2FeePlansPage() {
  return (
    <AdminV2Shell title="Fee Plans" description="Review billing plans, pricing rules, and cycle readiness in admin v2." activeHref="/admin-v2/fees/fee-plans">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Financial",
          heading: "Fee Plan Setup",
          summary: "A v2 command page for checking plan coverage before assigning or renewing student billing.",
          stats: [
            { label: "Plans", value: "9", tone: "accent" },
            { label: "Monthly", value: "5" },
            { label: "Custom", value: "4" },
            { label: "Audit", value: "2" },
          ],
          primaryAction: { label: "Open Fee Plans", href: "/fees/fee-plans", description: "Manage plans.", icon: CreditCard },
          actions: [
            { label: "Fee Plans", href: "/fees/fee-plans", description: "Create and update billing plans.", icon: BadgeIndianRupee },
            { label: "Student Billing", href: "/admin-v2/fees/student-fees", description: "Apply plans to student accounts.", icon: WalletCards },
            { label: "Billing Calendar", href: "/admin-v2/calendar", description: "Check fee cycles against class schedules.", icon: CalendarClock },
          ],
          rows: [
            { label: "Plan naming", detail: "Keep names consistent across invoices and reminders.", status: "Check" },
            { label: "Renewal cycle", detail: "Review students moving to the next month.", status: "Soon" },
            { label: "Custom plans", detail: "Confirm special pricing before invoice generation.", status: "Audit" },
          ],
          notes: ["Plan changes can affect future invoices.", "Keep archived plans out of new assignments.", "Confirm plan duration with attendance expectations."],
        }}
      />
    </AdminV2Shell>
  );
}
