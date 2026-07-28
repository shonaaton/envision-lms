import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardFrame from "@/components/layout/DashboardFrame";
import { getNavigationFeatureState, isSuperAdminSession } from "@/lib/featureAccess";
import { findFeatureByPath } from "@/lib/featureRegistry";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as "student" | "instructor" | "admin";
  const accountStatus = (session.user as any).accountStatus;
  const isSuperAdmin = await isSuperAdminSession(session.user as any);
  const featureState = await getNavigationFeatureState({ ...(session.user as any), isSuperAdmin });
  const pathname = headers().get("x-pathname") || "";
  const currentFeature = findFeatureByPath(pathname);
  const currentFeatureState = currentFeature ? featureState[currentFeature.key] : null;
  if (currentFeatureState && (!currentFeatureState.visible || currentFeatureState.status === "coming_soon") && pathname !== "/dashboard") {
    redirect("/dashboard?restricted=1");
  }
  return (
    <DashboardFrame role={role} accountStatus={accountStatus} isSuperAdmin={isSuperAdmin} featureState={featureState} user={{ name: session.user.name, role }}>
      {children}
    </DashboardFrame>
  );
}
