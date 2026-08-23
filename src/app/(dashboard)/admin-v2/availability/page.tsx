import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { CalendarClock, CalendarPlus, Clock, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2AvailabilityPage() {
  return (
    <AdminV2Shell title="Available Times" description="Coordinate booking windows, coach availability, and schedule readiness from admin v2." activeHref="/admin-v2/availability">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Schedule",
          heading: "Availability Planner",
          summary: "A v2 schedule page for checking open slots, booking readiness, and class planning before calendar changes.",
          stats: [
            { label: "Open Slots", value: "16", tone: "accent" },
            { label: "Coaches", value: "5" },
            { label: "Conflicts", value: "2" },
            { label: "Requests", value: "7" },
          ],
          primaryAction: { label: "Open Times", href: "/availability", description: "Manage availability.", icon: CalendarClock },
          actions: [
            { label: "Availability", href: "/availability", description: "Review and edit available teaching windows.", icon: Clock },
            { label: "Bookings", href: "/booking", description: "Open booking requests and student schedule selections.", icon: CalendarPlus },
            { label: "Classrooms", href: "/admin-v2/classrooms", description: "Connect available windows to classroom planning.", icon: Users },
          ],
          rows: [
            { label: "Weekend capacity", detail: "Check morning availability before confirming new trial students.", status: "Check" },
            { label: "Coach conflicts", detail: "Resolve overlapping windows before publishing the calendar.", status: "2 open" },
            { label: "Trial bookings", detail: "Confirm slots with enough prep time for onboarding.", status: "Pending" },
          ],
          notes: ["Keep availability changes synced with the unified calendar.", "Confirm coach ownership before opening new slots.", "Use bookings for student-facing schedule requests."],
        }}
      />
    </AdminV2Shell>
  );
}
