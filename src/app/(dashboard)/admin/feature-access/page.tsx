import { redirect } from "next/navigation";
import FeatureAccessClient from "@/components/admin/FeatureAccessClient";
import { requireSuperAdmin, getFeatureAccessSnapshot, getPermissionAudit, getPermissionTemplates, seedPermissionTemplates } from "@/lib/featureAccess";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";
import { PORTAL_ROLES } from "@/lib/featureRegistry";

export const dynamic = "force-dynamic";

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export default async function FeatureAccessPage() {
  const session = await requireSuperAdmin();
  if (!session) redirect("/dashboard");
  await dbConnect();
  await seedPermissionTemplates((session.user as any).id);
  const [features, audit, templates, users, batches, courses] = await Promise.all([
    getFeatureAccessSnapshot(),
    getPermissionAudit(50),
    getPermissionTemplates(),
    User.find({ isActive: { $ne: false } }, { name: 1, email: 1, username: 1, role: 1, accountStatus: 1 }).sort({ name: 1 }).limit(500).lean(),
    Batch.find({ isActive: { $ne: false } }, { name: 1, level: 1 }).sort({ name: 1 }).limit(200).lean(),
    Course.find({ isActive: { $ne: false } }, { name: 1, level: 1, category: 1 }).sort({ name: 1 }).limit(200).lean(),
  ]);

  return (
    <FeatureAccessClient
      initialData={serialize({
        roles: PORTAL_ROLES,
        features,
        audit,
        templates,
        users,
        batches,
        courses,
      }) as any}
    />
  );
}
