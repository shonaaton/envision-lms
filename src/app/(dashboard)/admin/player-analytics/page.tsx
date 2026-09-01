import { redirect } from "next/navigation";
import { ChessDashboardClient, StudentSelectorClient } from "@/components/chess/ChessDashboardClient";
import { auth } from "@/lib/auth";
import { getAdminChessStudents, getChessDashboard } from "@/lib/chess/analytics";
import { canAccessFeature } from "@/lib/featureAccess";
import { resolveAuthorizedChessStudent } from "@/lib/chess/access";

export const dynamic = "force-dynamic";

export default async function AdminPlayerAnalyticsPage({ searchParams }: { searchParams: { studentId?: string; q?: string; status?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await canAccessFeature("playerAnalytics", session.user as any, "view_all"))) redirect("/dashboard?restricted=1");
  if (searchParams.studentId) {
    const access = await resolveAuthorizedChessStudent(searchParams.studentId, "view");
    if (!access) redirect("/admin/player-analytics?forbidden=1");
    const dashboard = await getChessDashboard(access.studentId, { period: "30d" });
    return <ChessDashboardClient initialDashboard={dashboard} selectedStudentId={access.studentId} viewerMode="admin" />;
  }
  const students = await getAdminChessStudents(searchParams.q, searchParams.status);
  return <StudentSelectorClient students={students} mode="admin" />;
}
