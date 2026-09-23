import { notFound } from "next/navigation";
import { BookOpenCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { PageHeader } from "@/components/common/PageHeader";
import { getAuthoringCatalog } from "@/lib/learning/adminService";
import LearningAuthoringWorkbench from "@/components/learning/LearningAuthoringWorkbench";

export const dynamic = "force-dynamic";

export default async function LearnAuthoringPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!user) notFound();

  const superAdmin = await isSuperAdminSession(user);
  const canEdit = superAdmin || (await canAccessFeature("learnChess", user, "edit"));
  if (!canEdit) notFound();

  const canPublish = superAdmin || (await canAccessFeature("learnChess", user, "manage"));
  const catalog = await getAuthoringCatalog();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Learn Chess"
        title="Curriculum authoring"
        subtitle="Edit the positions students practise on. Every change is replayed through the student engine before it can be published."
        icon={BookOpenCheck}
      />
      <LearningAuthoringWorkbench
        lessons={catalog.lessons}
        exercises={catalog.exercises}
        canPublish={canPublish}
      />
    </div>
  );
}
