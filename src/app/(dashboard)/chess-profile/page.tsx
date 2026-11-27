import { redirectToLogin } from "@/lib/redirectToLogin";
import { redirect } from "next/navigation";
import { ChessDashboardClient } from "@/components/chess/ChessDashboardClient";
import { auth } from "@/lib/auth";
import { getChessDashboard } from "@/lib/chess/analytics";
import { canUseChessProfile } from "@/lib/chess/access";

export const dynamic = "force-dynamic";

export default async function StudentChessProfilePage() {
  const session = await auth();
  if (!session?.user) redirectToLogin();
  if ((session.user as any).role !== "student") redirect("/dashboard");
  if (!(await canUseChessProfile(session.user as any, "view"))) redirect("/dashboard?restricted=1");
  const dashboard = await getChessDashboard((session.user as any).id, { period: "all" });
  return <ChessDashboardClient initialDashboard={dashboard} viewerMode="student" />;
}
