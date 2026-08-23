import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { Bell, BellRing, MailCheck, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2NotificationsPage() {
  return (
    <AdminV2Shell title="Notifications History" description="Review notification delivery, reminders, and communication logs from admin v2." activeHref="/admin-v2/notifications">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "System",
          heading: "Notifications History",
          summary: "A v2 system page for checking notification history and routing into communication tools.",
          stats: [
            { label: "Sent", value: "186" },
            { label: "Failed", value: "4", tone: "accent" },
            { label: "Reminders", value: "21" },
            { label: "Drafts", value: "3" },
          ],
          primaryAction: { label: "Open History", href: "/admin/notifications", description: "Open notifications.", icon: Bell },
          actions: [
            { label: "Notification History", href: "/admin/notifications", description: "Review sent and failed notifications.", icon: BellRing },
            { label: "Comms & Logs", href: "/admin-v2/comms", description: "Open announcement and message operations.", icon: MessageSquare },
            { label: "Email Reminders", href: "/admin-v2/comms", description: "Check reminder workflows from the comms page.", icon: MailCheck },
          ],
          rows: [
            { label: "Failed notifications", detail: "Review delivery failures before resending.", status: "4" },
            { label: "Homework reminders", detail: "Confirm pending reminders match active assignments.", status: "21" },
            { label: "Draft messages", detail: "Complete or discard stale message drafts.", status: "3" },
          ],
          notes: ["Check target audiences before resending messages.", "Use comms for new announcements.", "Review failed delivery before parent escalation."],
        }}
      />
    </AdminV2Shell>
  );
}
