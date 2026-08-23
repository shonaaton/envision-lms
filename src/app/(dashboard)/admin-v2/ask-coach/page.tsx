import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BellRing, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2AskCoachPage() {
  return (
    <AdminV2Shell title="Ask Coach" description="Moderate student questions, reminders, and coach-answer workflows from admin v2." activeHref="/admin-v2/ask-coach">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Chess Tools",
          heading: "Ask Coach Moderation",
          summary: "A v2 page for overseeing student chess questions, moderation signals, and follow-up reminders.",
          stats: [
            { label: "Questions", value: "21", tone: "accent" },
            { label: "Moderate", value: "3" },
            { label: "Answered", value: "58" },
            { label: "Reminders", value: "6" },
          ],
          primaryAction: { label: "Open Ask Coach", href: "/ask-coach", description: "Open question flow.", icon: MessageSquare },
          actions: [
            { label: "Ask Coach", href: "/ask-coach", description: "View and answer student chess questions.", icon: Sparkles },
            { label: "Comms Logs", href: "/admin-v2/comms", description: "Review related messages and communication history.", icon: BellRing },
            { label: "Moderation", href: "/ask-coach", description: "Use the existing moderation controls.", icon: ShieldCheck },
          ],
          rows: [
            { label: "Unanswered questions", detail: "Prioritize student questions older than one day.", status: "21" },
            { label: "Moderation review", detail: "Check flagged messages before coach response.", status: "3" },
            { label: "Reminder queue", detail: "Nudge pending answers where needed.", status: "6" },
          ],
          notes: ["Keep answers age-appropriate and coach-reviewed.", "Escalate moderation flags before replying.", "Use comms for reminder and email history."],
        }}
      />
    </AdminV2Shell>
  );
}
