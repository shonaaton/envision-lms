import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { FileDown, FileText, Receipt, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2InvoicesPage() {
  return (
    <AdminV2Shell title="Invoices" description="Create, verify, download, and recover invoice records through a v2 finance command page." activeHref="/admin-v2/fees/invoices">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Financial",
          heading: "Invoice Desk",
          summary: "Monitor invoice work and jump into the full existing invoice flow for payment-sensitive actions.",
          stats: [
            { label: "Drafts", value: "6", tone: "accent" },
            { label: "Sent", value: "42" },
            { label: "Paid", value: "31" },
            { label: "Deleted", value: "2" },
          ],
          primaryAction: { label: "Open Invoices", href: "/fees/invoices", description: "Manage invoices.", icon: Receipt },
          actions: [
            { label: "Invoices", href: "/fees/invoices", description: "Create and manage invoice records.", icon: FileText },
            { label: "Reports", href: "/admin-v2/fees/reports", description: "Compare invoices against collection reports.", icon: FileDown },
            { label: "Deleted Invoices", href: "/fees/deleted-invoices", description: "Review deleted invoice records when needed.", icon: Trash2 },
          ],
          rows: [
            { label: "Draft invoices", detail: "Review draft invoices before parent delivery.", status: "6 open" },
            { label: "PDF check", detail: "Download sample PDFs after template or branding changes.", status: "QA" },
            { label: "Deleted records", detail: "Confirm deleted invoices were intentional.", status: "Audit" },
          ],
          notes: ["Invoice changes are routed to the existing finance workflow.", "Check student billing before creating invoices.", "Use reports for month-end reconciliation."],
        }}
      />
    </AdminV2Shell>
  );
}
