import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2CommsClient from "@/components/admin-v2/AdminV2CommsClient";

export const dynamic = "force-dynamic";

export default function AdminV2CommsPage() {
  return (
    <AdminV2Shell
      title="Comms & Logs Pilot"
      description="Broadcast announcements and audit activity from a split operations view with log filtering and legacy export support."
      activeHref="/admin-v2/comms"
    >
      <AdminV2CommsClient />
    </AdminV2Shell>
  );
}

