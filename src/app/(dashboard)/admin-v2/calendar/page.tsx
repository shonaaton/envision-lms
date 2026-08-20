import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2UnifiedCalendarClient from "@/components/admin-v2/AdminV2UnifiedCalendarClient";

export const dynamic = "force-dynamic";

export default function AdminV2CalendarPage() {
  return (
    <AdminV2Shell
      title="Unified Calendar"
      description="Classes, homework deadlines, tournaments, and operational follow-ups in one compact schedule workspace."
      activeHref="/admin-v2/calendar"
    >
      <AdminV2UnifiedCalendarClient />
    </AdminV2Shell>
  );
}

