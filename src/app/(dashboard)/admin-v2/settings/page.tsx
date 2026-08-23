import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { Building2, Paintbrush, Settings, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsPage() {
  return (
    <AdminV2Shell title="Academy Setup" description="Review academy configuration, branding, and system settings from admin v2." activeHref="/admin-v2/settings">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "System",
          heading: "Academy Setup",
          summary: "A v2 settings hub for checking configuration areas before opening the existing academy setup page.",
          stats: [
            { label: "Branding", value: "Live", tone: "accent" },
            { label: "Policies", value: "3" },
            { label: "Integrations", value: "4" },
            { label: "Review", value: "2" },
          ],
          primaryAction: { label: "Open Settings", href: "/admin/settings", description: "Open settings.", icon: Settings },
          actions: [
            { label: "Academy Setup", href: "/admin/settings", description: "Manage academy-level settings and branding.", icon: Building2 },
            { label: "Feature Access", href: "/admin-v2/feature-access", description: "Review feature controls tied to settings.", icon: ShieldCheck },
            { label: "Branding", href: "/admin/settings", description: "Open branding and display configuration.", icon: Paintbrush },
          ],
          rows: [
            { label: "Brand display", detail: "Confirm logo and academy name after changes.", status: "Check" },
            { label: "Policy links", detail: "Review footer and legal policy links.", status: "Open" },
            { label: "Integrations", detail: "Confirm connected services are healthy.", status: "Review" },
          ],
          notes: ["Settings changes can affect every role.", "Check feature access after changing rollout settings.", "Keep branding visible and readable across mobile views."],
        }}
      />
    </AdminV2Shell>
  );
}
