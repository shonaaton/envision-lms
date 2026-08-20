import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2DirectoryClient from "@/components/admin-v2/AdminV2DirectoryClient";

export const dynamic = "force-dynamic";

export default function AdminV2DirectoryPage() {
  return (
    <AdminV2Shell
      title="Operations Hub"
      description="A parallel admin surface for testing the redesigned directory, onboarding, showcase, and communications workflows while the current admin UI remains available."
      activeHref="/admin-v2/directory"
    >
      <AdminV2DirectoryClient />
    </AdminV2Shell>
  );
}

