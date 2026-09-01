import { redirect } from "next/navigation";
import { ChessDashboardClient } from "@/components/chess/ChessDashboardClient";
import { auth } from "@/lib/auth";
import { getChessDashboard } from "@/lib/chess/analytics";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

export default async function StudentChessProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as any).role !== "student") redirect("/dashboard");
  if (!(await canAccessFeature("playerAnalytics", session.user as any, "view"))) redirect("/dashboard?restricted=1");
  const dashboard = await getChessDashboard((session.user as any).id, { period: "30d" });
  return <ChessDashboardClient initialDashboard={dashboard} viewerMode="student" />;
}
