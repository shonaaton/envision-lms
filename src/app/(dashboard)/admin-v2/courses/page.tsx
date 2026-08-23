import { AdminV2Shell } from "@/components/admin-v2/AdminV2Shell";
import AdminV2WorkspacePage from "@/components/admin-v2/AdminV2WorkspacePage";
import { BookMarked, FilePlus2, GraduationCap, Layers } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminV2CoursesPage() {
  return (
    <AdminV2Shell title="Courses & Curriculum" description="Plan curriculum, lesson structure, and course maintenance from the v2 academic workspace." activeHref="/admin-v2/courses">
      <AdminV2WorkspacePage
        config={{
          eyebrow: "Academics",
          heading: "Courses & Curriculum",
          summary: "A compact command page for course setup, curriculum hygiene, and lesson publishing without entering live classroom.",
          stats: [
            { label: "Tracks", value: "6" },
            { label: "Review", value: "12" },
            { label: "Templates", value: "28", tone: "accent" },
            { label: "Drafts", value: "4" },
          ],
          primaryAction: { label: "Open Courses", href: "/admin/courses", description: "Manage course records.", icon: GraduationCap },
          actions: [
            { label: "Course Manager", href: "/admin/courses", description: "Create courses, organize modules, and update curriculum details.", icon: Layers },
            { label: "New Homework", href: "/instructor/homework/new", description: "Assign practice from the current curriculum flow.", icon: FilePlus2 },
            { label: "Homework Templates", href: "/admin-v2/homework-templates", description: "Review reusable assignments linked to lessons.", icon: BookMarked },
          ],
          rows: [
            { label: "Beginner track refresh", detail: "Check lesson order and first-month practice coverage.", status: "Review" },
            { label: "Middle-game module", detail: "Add sample positions before assigning to active batches.", status: "Draft" },
            { label: "Template cleanup", detail: "Remove duplicate homework templates after import.", status: "Queued" },
          ],
          notes: ["Keep lesson names aligned with student-facing Learn pages.", "Publish only after templates and practice links are verified.", "Use the old course manager for data edits until v2 forms are connected."],
        }}
      />
    </AdminV2Shell>
  );
}
