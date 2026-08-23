import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BellRing, CalendarCheck, ClipboardCheck, ListChecks } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2AttendancePage() {
  return (
    <AdminV2Shell title="Attendance" description="Track pending, marked, missed, and completed attendance tasks from the admin v2 academic hub." activeHref="/admin-v2/attendance">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Academics",
          heading: "Attendance Workspace",
          summary: "A fast overview for attendance follow-up with direct access to the existing attendance views.",
          stats: [
            { label: "Pending", value: "8", tone: "accent" },
            { label: "Marked", value: "31" },
            { label: "Missed", value: "3" },
            { label: "Done", value: "44" },
          ],
          primaryAction: { label: "Open Attendance", href: "/attendance", description: "Open attendance dashboard.", icon: ClipboardCheck },
          actions: [
            { label: "Pending", href: "/attendance/pending", description: "Resolve classes waiting for attendance.", icon: ListChecks, badge: "Focus" },
            { label: "Marked", href: "/attendance/marked", description: "Review recently marked attendance records.", icon: CalendarCheck },
            { label: "Missed", href: "/attendance/missed", description: "Find classes where attendance needs recovery.", icon: BellRing },
          ],
          rows: [
            { label: "Pending attendance", detail: "Prioritize classes completed in the last 24 hours.", status: "Now" },
            { label: "Missed class review", detail: "Send reminders after coach confirmation.", status: "Follow up" },
            { label: "Completed archive", detail: "Spot-check weekly attendance before reports.", status: "Weekly" },
          ],
          notes: ["Mark attendance before fee and progress reporting.", "Resolve missed sessions before reminder messages go out.", "Use completed records for parent-visible summaries."],
        }}
      />
    </AdminV2Shell>
  );
}
