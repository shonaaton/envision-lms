import { auth } from "@/lib/auth";
import ClassroomManagementClient from "@/components/classroom/ClassroomManagementClient";

export const dynamic = "force-dynamic";

export default async function ClassroomsPage() {
  const session = await auth();
  const role = (session?.user as any).role as "student" | "instructor" | "admin";
  return <ClassroomManagementClient role={role} />;
}
