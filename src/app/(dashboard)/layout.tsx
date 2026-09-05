import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardFrame from "@/components/layout/DashboardFrame";
import { getNavigationFeatureState, isSuperAdminSession } from "@/lib/featureAccess";
import { findFeatureByPath } from "@/lib/featureRegistry";
import { headers } from "next/headers";
import { isInactiveRestrictedPath } from "@/lib/inactiveAccess";
import { dbConnect } from "@/lib/db";
import { FeeAssignment } from "@/models/Fee";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as "student" | "instructor" | "admin" | "sub-admin";
  const accountStatus = (session.user as any).accountStatus;
  const isSuperAdmin = await isSuperAdminSession(session.user as any);
  const featureState = await getNavigationFeatureState({ ...(session.user as any), isSuperAdmin });
  const pathname = headers().get("x-pathname") || "";
  const isActive = (session.user as any).isActive !== false;
  const isPaused = (session.user as any).isPaused === true;
  let hasCreditPlan = true;
  if (role === "student") {
    try {
      await dbConnect();
      hasCreditPlan = Boolean(await FeeAssignment.exists({ student: (session.user as any).id, type: "credits" }));
    } catch (error) {
      console.error("Dashboard credit-plan lookup failed; continuing without blocking the page.", error);
      hasCreditPlan = true;
    }
  }
  if (!isActive && isInactiveRestrictedPath(pathname)) redirect("/dashboard?inactive=1");
  if (isPaused && isInactiveRestrictedPath(pathname)) redirect("/dashboard?paused=1");
  const currentFeature = findFeatureByPath(pathname);
  const currentFeatureState = currentFeature ? featureState[currentFeature.key] : null;
  if (currentFeatureState && (!currentFeatureState.visible || currentFeatureState.status === "coming_soon") && pathname !== "/dashboard") {
    redirect("/dashboard?restricted=1");
  }
  return (
    <DashboardFrame role={role} accountStatus={accountStatus} isSuperAdmin={isSuperAdmin} featureState={featureState} hasCreditPlan={hasCreditPlan} user={{ name: session.user.name, role, isActive, isPaused }}>
      {children}
    </DashboardFrame>
  );
}
