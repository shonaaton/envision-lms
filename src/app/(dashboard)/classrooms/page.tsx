import { auth } from "@/lib/auth";
import { isSuperAdminSession } from "@/lib/featureAccess";
import ClassroomManagementClient from "@/components/classroom/ClassroomManagementClient";

export const dynamic = "force-dynamic";

export default async function ClassroomsPage() {
  const session = await auth();
  const role = (session?.user as any).role as "student" | "instructor" | "admin";
  const isSuperAdmin = await isSuperAdminSession(session?.user as any);
  return <ClassroomManagementClient role={role} isSuperAdmin={isSuperAdmin} />;
}
