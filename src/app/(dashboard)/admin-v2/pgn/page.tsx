import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BookOpen, FolderOpen, Search, UploadCloud } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2PgnPage() {
  return (
    <AdminV2Shell title="PGN Library" description="Organize chess games, folders, and study material entry points from admin v2." activeHref="/admin-v2/pgn">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Chess Tools",
          heading: "PGN Library",
          summary: "A v2 chess content hub for PGN organization, search, and study-board routing.",
          stats: [
            { label: "Games", value: "248", tone: "accent" },
            { label: "Folders", value: "18" },
            { label: "Shared", value: "64" },
            { label: "Review", value: "9" },
          ],
          primaryAction: { label: "Open PGN", href: "/pgn", description: "Open PGN library.", icon: BookOpen },
          actions: [
            { label: "PGN Library", href: "/pgn", description: "Browse games, folders, and study material.", icon: FolderOpen },
            { label: "Analysis Board", href: "/admin-v2/analysis", description: "Analyze selected positions and games.", icon: Search },
            { label: "Import Games", href: "/pgn", description: "Use the existing PGN import workflow.", icon: UploadCloud },
          ],
          rows: [
            { label: "Unsorted imports", detail: "Move recent PGNs into curriculum folders.", status: "9 open" },
            { label: "Shared studies", detail: "Confirm student visibility before sending links.", status: "Check" },
            { label: "Tournament games", detail: "Archive completed event games for review.", status: "Ready" },
          ],
          notes: ["Keep folder names aligned with lesson naming.", "Use analysis board for deeper review.", "Check sharing before using PGNs in homework."],
        }}
      />
    </AdminV2Shell>
  );
}
