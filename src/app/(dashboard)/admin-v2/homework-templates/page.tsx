import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { ClipboardList, FilePlus2, Library, SearchCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2HomeworkTemplatesPage() {
  return (
    <AdminV2Shell title="Homework Templates" description="Curate reusable practice sets, imports, previews, and assignment readiness from admin v2." activeHref="/admin-v2/homework-templates">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Academics",
          heading: "Homework Template Library",
          summary: "Review template health, create new homework, and jump into the existing editor for detailed PGN and MCQ work.",
          stats: [
            { label: "Ready", value: "34" },
            { label: "Needs PGN", value: "5" },
            { label: "Assigned", value: "19", tone: "accent" },
            { label: "Imports", value: "7" },
          ],
          primaryAction: { label: "Open Templates", href: "/admin/homework-templates", description: "Manage reusable homework.", icon: Library },
          actions: [
            { label: "Template Library", href: "/admin/homework-templates", description: "Edit, preview, import, and assign homework templates.", icon: ClipboardList },
            { label: "Create Homework", href: "/instructor/homework/new", description: "Build a new homework assignment for a batch or student.", icon: FilePlus2 },
            { label: "Template Options", href: "/instructor/homework/templates/new", description: "Start a new reusable template from instructor tools.", icon: SearchCheck },
          ],
          rows: [
            { label: "Opening principles", detail: "Confirm diagrams and answer keys before assigning.", status: "QA" },
            { label: "Endgame basics", detail: "Match imported JSON titles with curriculum names.", status: "Rename" },
            { label: "Weekly tactics", detail: "Convert repeated exercises into reusable templates.", status: "Plan" },
          ],
          notes: ["Preview every imported template before assigning it.", "Keep template names short enough for mobile student views.", "Leave live classroom homework prompts in the existing classroom flow."],
        }}
      />
    </AdminV2Shell>
  );
}
