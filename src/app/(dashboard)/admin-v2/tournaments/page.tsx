import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { Medal, PlusCircle, ShieldCheck, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2TournamentsPage() {
  return (
    <AdminV2Shell title="Tournaments" description="Plan events, monitor participation, and route into the existing tournament engine from admin v2." activeHref="/admin-v2/tournaments">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Schedule",
          heading: "Tournament Control",
          summary: "A v2 event hub for tournament setup, participation readiness, announcements, and fair-play review.",
          stats: [
            { label: "Upcoming", value: "3", tone: "accent" },
            { label: "Players", value: "86" },
            { label: "Reports", value: "4" },
            { label: "Drafts", value: "2" },
          ],
          primaryAction: { label: "Open Tournaments", href: "/tournaments", description: "View tournaments.", icon: Trophy },
          actions: [
            { label: "Tournament List", href: "/tournaments", description: "Open live, upcoming, and completed tournaments.", icon: Medal },
            { label: "New Tournament", href: "/tournaments/new", description: "Create a tournament and configure rounds.", icon: PlusCircle },
            { label: "Fair Play Review", href: "/tournaments", description: "Use event reports to inspect participation and results.", icon: ShieldCheck },
          ],
          rows: [
            { label: "Saturday arena", detail: "Confirm player list and round timing.", status: "Prep" },
            { label: "Parent announcement", detail: "Send event details after final schedule lock.", status: "Draft" },
            { label: "Result export", detail: "Download participation report for completed events.", status: "Ready" },
          ],
          notes: ["Use the existing tournament engine for pairings and play.", "Confirm start and end times before announcements.", "Keep fair-play checks close to event completion."],
        }}
      />
    </AdminV2Shell>
  );
}
