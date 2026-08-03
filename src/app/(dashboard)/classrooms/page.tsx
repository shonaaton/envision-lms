import { auth } from "@/lib/auth";
import { evaluateFeatureState, getFeatureAccessMap, isSuperAdminSession } from "@/lib/featureAccess";
import ClassroomManagementClient from "@/components/classroom/ClassroomManagementClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClassroomsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session?.user as any;
  const role = user.role as "student" | "instructor" | "admin" | "sub-admin";
  const [featureMap, isSuperAdmin] = await Promise.all([
    getFeatureAccessMap(),
    isSuperAdminSession(user),
  ]);
  const classroomFeature = featureMap.get("classrooms");
  const allowed = (permission: string) => Boolean(
    classroomFeature && evaluateFeatureState({
      feature: classroomFeature,
      user: { ...user, isSuperAdmin },
      permission,
    }),
  );

  return (
    <ClassroomManagementClient
      role={role}
      isSuperAdmin={isSuperAdmin}
      permissions={{
        view: allowed("view"),
        join: allowed("join"),
        create: allowed("create"),
        edit: allowed("edit"),
        cancel: allowed("cancel"),
        assign: allowed("assign"),
        attendance: allowed("attendance"),
      }}
    />
  );
}
