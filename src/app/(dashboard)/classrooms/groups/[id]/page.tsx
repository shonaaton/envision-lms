import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { evaluateFeatureState, getFeatureAccessMap, isSuperAdminSession } from "@/lib/featureAccess";
import ClassroomManagementClient from "@/components/classroom/ClassroomManagementClient";

export const dynamic = "force-dynamic";

export default async function ClassroomGroupPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as any;
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

  if (!allowed("view")) notFound();

  await dbConnect();
  const batch: any = await Batch.findById(params.id)
    .populate("students", "name email username isActive")
    .lean();
  if (!batch) notFound();

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
      groupFocus={{
        id: String(batch._id),
        name: String(batch.name || "Group"),
        level: batch.level ? String(batch.level) : "",
        students: Array.isArray(batch.students)
          ? batch.students.map((student: any) => ({
              _id: String(student._id),
              name: String(student.name || "Student"),
              email: student.email ? String(student.email) : "",
              username: student.username ? String(student.username) : "",
              isActive: student.isActive !== false,
            }))
          : [],
      }}
    />
  );
}
