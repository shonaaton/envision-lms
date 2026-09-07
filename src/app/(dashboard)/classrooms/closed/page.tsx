import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import ClosedClassroomsClient from "@/components/classroom/ClosedClassroomsClient";

export const dynamic = "force-dynamic";

export default async function ClosedClassroomsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = String((session.user as any).role || "");
  if (!["admin", "sub-admin", "instructor"].includes(role)) redirect("/classrooms");
  if (!(await canAccessFeature("classrooms", session.user as any, "view"))) redirect("/dashboard?restricted=1");
  return <ClosedClassroomsClient role={role as "admin" | "sub-admin" | "instructor"} />;
}
