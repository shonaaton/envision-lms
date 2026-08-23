import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { Medal, Star, Trophy, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2LeaderboardPage() {
  return (
    <AdminV2Shell title="Leaderboard" description="Review student ranking, reward signals, and activity highlights from admin v2." activeHref="/admin-v2/leaderboard">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Chess Tools",
          heading: "Leaderboard Review",
          summary: "A v2 achievement and leaderboard hub for checking ranking health before showcasing student progress.",
          stats: [
            { label: "Ranked", value: "72", tone: "accent" },
            { label: "Movers", value: "14" },
            { label: "Badges", value: "33" },
            { label: "Review", value: "5" },
          ],
          primaryAction: { label: "Open Leaderboard", href: "/leaderboard", description: "Open rankings.", icon: Trophy },
          actions: [
            { label: "Leaderboard", href: "/leaderboard", description: "View rankings and student activity.", icon: Medal },
            { label: "Showcase", href: "/admin-v2/showcase", description: "Promote verified achievements to the gallery.", icon: Star },
            { label: "Directory", href: "/admin-v2/directory", description: "Open student records for ranking follow-up.", icon: Users },
          ],
          rows: [
            { label: "Top movers", detail: "Review unusually large ranking jumps.", status: "14" },
            { label: "Badge checks", detail: "Confirm earned badges are displaying correctly.", status: "QA" },
            { label: "Showcase candidates", detail: "Send verified wins to the achievement gallery.", status: "5" },
          ],
          notes: ["Verify achievements before publishing them.", "Use directory records for student context.", "Keep ranking review separate from fee and attendance operations."],
        }}
      />
    </AdminV2Shell>
  );
}
