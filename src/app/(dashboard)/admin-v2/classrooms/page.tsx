import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BookOpenCheck, ClipboardCheck, PlusCircle, UsersRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2ClassroomsPage() {
  return (
    <AdminV2Shell title="Classrooms" description="Manage classroom setup and summaries in admin v2. Live classroom remains on the existing classroom route." activeHref="/admin-v2/classrooms">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Academics",
          heading: "Classroom Operations",
          summary: "A non-live classroom hub for rosters, summaries, group pages, and setup actions while the live classroom page stays separate.",
          stats: [
            { label: "Active", value: "18", tone: "accent" },
            { label: "Groups", value: "9" },
            { label: "Summaries", value: "24" },
            { label: "Setup", value: "3" },
          ],
          primaryAction: { label: "Open Classrooms", href: "/classrooms", description: "View classroom list.", icon: UsersRound },
          actions: [
            { label: "Classroom List", href: "/classrooms", description: "Open class pages, rosters, and post-class summaries.", icon: BookOpenCheck },
            { label: "Create Classroom", href: "/instructor/classrooms/new", description: "Set up a class session or recurring classroom.", icon: PlusCircle },
            { label: "Attendance", href: "/admin-v2/attendance", description: "Move from classroom setup into attendance operations.", icon: ClipboardCheck },
          ],
          rows: [
            { label: "Roster checks", detail: "Confirm new students are attached to the right groups.", status: "Today" },
            { label: "Class summaries", detail: "Review completed classroom summaries before parent follow-up.", status: "Open" },
            { label: "Group pages", detail: "Audit batch-level classroom links for stale sessions.", status: "Check" },
          ],
          notes: ["This v2 page intentionally excludes live classroom controls.", "Use summaries for post-class review and parent updates.", "Create sessions from the existing instructor classroom form."],
        }}
      />
    </AdminV2Shell>
  );
}
