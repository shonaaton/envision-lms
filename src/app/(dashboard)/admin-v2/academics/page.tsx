import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2AcademicsClient from "@/components/admin-v2/AdminV2AcademicsClient";

export const dynamic = "force-dynamic";

export default function AdminV2AcademicsPage() {
  return (
    <AdminV2Shell
      title="Academics Hub"
      description="Curriculum, classroom setup, homework templates, and attendance operations with Live Classroom kept isolated in its existing route."
      activeHref="/admin-v2/academics"
    >
      <AdminV2AcademicsClient />
    </AdminV2Shell>
  );
}

