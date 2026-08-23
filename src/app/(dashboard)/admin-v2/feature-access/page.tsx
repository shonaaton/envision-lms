import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { KeyRound, LockKeyhole, ShieldCheck, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2FeatureAccessPage() {
  return (
    <AdminV2Shell title="Feature Access" description="Manage feature gates, role access, and rollout checks from admin v2." activeHref="/admin-v2/feature-access">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "System",
          heading: "Feature Access",
          summary: "A v2 system page for reviewing feature access before opening the existing access control editor.",
          stats: [
            { label: "Features", value: "14", tone: "accent" },
            { label: "Limited", value: "5" },
            { label: "Roles", value: "4" },
            { label: "Review", value: "2" },
          ],
          primaryAction: { label: "Open Access", href: "/admin/feature-access", description: "Manage feature access.", icon: ShieldCheck },
          actions: [
            { label: "Feature Access", href: "/admin/feature-access", description: "Update feature gates and allowed users.", icon: LockKeyhole },
            { label: "Directory", href: "/admin-v2/directory", description: "Review user roles and account context.", icon: Users },
            { label: "Settings", href: "/admin-v2/settings", description: "Check academy-level configuration.", icon: KeyRound },
          ],
          rows: [
            { label: "Pilot features", detail: "Confirm who should see v2-only tools.", status: "Review" },
            { label: "Sub-admin access", detail: "Audit admin and sub-admin capabilities.", status: "Audit" },
            { label: "Student tools", detail: "Check play and learning feature availability.", status: "Open" },
          ],
          notes: ["Use least-access changes for pilots.", "Confirm roles in directory before granting access.", "Keep rollout notes close to settings changes."],
        }}
      />
    </AdminV2Shell>
  );
}
