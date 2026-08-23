import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BrainCircuit, Gauge, Search, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2AnalysisPage() {
  return (
    <AdminV2Shell title="Analysis Board" description="Route coaches into analysis, engine checks, and review-ready chess material from admin v2." activeHref="/admin-v2/analysis">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Chess Tools",
          heading: "Analysis Board",
          summary: "A compact chess analysis command page for positions, PGNs, and engine-backed review.",
          stats: [
            { label: "Queued", value: "12", tone: "accent" },
            { label: "Reviewed", value: "38" },
            { label: "Engine", value: "On" },
            { label: "Events", value: "3" },
          ],
          primaryAction: { label: "Open Analysis", href: "/analysis", description: "Open board.", icon: Search },
          actions: [
            { label: "Analysis Board", href: "/analysis", description: "Analyze positions and PGN lines.", icon: BrainCircuit },
            { label: "Chess Engine", href: "/admin-v2/engine", description: "Check engine health before deeper analysis.", icon: Gauge },
            { label: "Tournament Games", href: "/admin-v2/tournaments", description: "Review games produced by events.", icon: Trophy },
          ],
          rows: [
            { label: "Homework positions", detail: "Analyze flagged puzzle mistakes.", status: "12 queued" },
            { label: "Tournament blunders", detail: "Pick review examples from recent tournament games.", status: "Coach" },
            { label: "Engine health", detail: "Confirm engine status before batch analysis.", status: "Check" },
          ],
          notes: ["Run sensitive game review through coach judgment.", "Use PGN library for reusable lesson material.", "Keep engine-dependent workflows behind the engine status page."],
        }}
      />
    </AdminV2Shell>
  );
}
