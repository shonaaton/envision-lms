import { redirect } from "next/navigation";
import { ChessDashboardClient, StudentSelectorClient } from "@/components/chess/ChessDashboardClient";
import { auth } from "@/lib/auth";
import { getChessDashboard, getTeacherChessStudents } from "@/lib/chess/analytics";
import { canAccessFeature } from "@/lib/featureAccess";
import { resolveAuthorizedChessStudent } from "@/lib/chess/access";

export const dynamic = "force-dynamic";

export default async function InstructorStudentsPage({ searchParams }: { searchParams: { studentId?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as any).role !== "instructor") redirect("/dashboard");
  if (!(await canAccessFeature("playerAnalytics", session.user as any, "view_assigned"))) redirect("/dashboard?restricted=1");
  if (searchParams.studentId) {
    const access = await resolveAuthorizedChessStudent(searchParams.studentId, "view");
    if (!access) redirect("/instructor/students?forbidden=1");
    const dashboard = await getChessDashboard(access.studentId, { period: "all" });
    return <ChessDashboardClient initialDashboard={dashboard} selectedStudentId={access.studentId} viewerMode="teacher" />;
  }
  const students = await getTeacherChessStudents((session.user as any).id);
  return <StudentSelectorClient students={students} mode="teacher" />;
}
