import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { CreditCard, FileText, Receipt, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2FeesPage() {
  return (
    <AdminV2Shell title="Fees Dashboard" description="A v2 financial hub for billing, credits, invoices, and fee reports." activeHref="/admin-v2/fees">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Financial",
          heading: "Fees Dashboard",
          summary: "Track billing health and jump into the existing finance workflows for invoice creation and student credit work.",
          stats: [
            { label: "Due", value: "18", tone: "accent" },
            { label: "Paid", value: "64" },
            { label: "Credits", value: "11" },
            { label: "Invoices", value: "42" },
          ],
          primaryAction: { label: "Open Fees", href: "/fees", description: "Open fees dashboard.", icon: WalletCards },
          actions: [
            { label: "Fee Plans", href: "/admin-v2/fees/fee-plans", description: "Review plan setup and billing cycles.", icon: CreditCard },
            { label: "Student Billing", href: "/admin-v2/fees/student-fees", description: "Open student balances, credits, and collection status.", icon: WalletCards },
            { label: "Invoices", href: "/admin-v2/fees/invoices", description: "Create, verify, and download invoices.", icon: Receipt },
            { label: "Reports", href: "/admin-v2/fees/reports", description: "Review collection and monthly finance reports.", icon: FileText },
          ],
          rows: [
            { label: "Monthly reminders", detail: "Check unpaid accounts before reminders run.", status: "Today" },
            { label: "Credit review", detail: "Validate carry-forward credits for affected students.", status: "Open" },
            { label: "Invoice PDFs", detail: "Spot-check recent invoice downloads.", status: "QA" },
          ],
          notes: ["Use existing finance pages for payment-affecting edits.", "Verify credits before generating invoices.", "Reconcile reports before parent follow-ups."],
        }}
      />
    </AdminV2Shell>
  );
}
