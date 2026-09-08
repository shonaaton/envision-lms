import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardFrame from "@/components/layout/DashboardFrame";
import { getNavigationFeatureState, isSuperAdminSession } from "@/lib/featureAccess";
import { findFeatureByPath } from "@/lib/featureRegistry";
import { headers } from "next/headers";
import { isInactiveRestrictedPath } from "@/lib/inactiveAccess";
import { dbConnect } from "@/lib/db";
import { FeeAssignment } from "@/models/Fee";
import { Classroom } from "@/models/Classroom";

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
  // A demo account's navigation is a deliberately short list, but once the
  // academy approves their demo they have a real classroom to join - so
  // Classrooms is added to that list exactly when there is one to show.
  let hasScheduledClassroom = false;
  if (role === "student") {
    try {
      await dbConnect();
      hasCreditPlan = Boolean(await FeeAssignment.exists({ student: (session.user as any).id, type: "credits" }));
    } catch (error) {
      console.error("Dashboard credit-plan lookup failed; continuing without blocking the page.", error);
      hasCreditPlan = true;
    }
  }
  if (role === "student" && accountStatus === "demo") {
    try {
      await dbConnect();
      hasScheduledClassroom = Boolean(
        await Classroom.exists({
          students: (session.user as any).id,
          isActive: { $ne: false },
          isSessionInstance: { $ne: true },
          isTestClassroom: { $ne: true },
          status: { $ne: "cancelled" },
        })
      );
    } catch (error) {
      console.error("Demo classroom lookup failed; continuing without the Classrooms link.", error);
      hasScheduledClassroom = false;
    }
  }
  if (!isActive && isInactiveRestrictedPath(pathname)) redirect("/dashboard?inactive=1");
  if (isPaused && isInactiveRestrictedPath(pathname)) redirect("/dashboard?paused=1");
  const currentFeature = findFeatureByPath(pathname);
  const namedRole = (session.user as any).accessRoleId;
  if (namedRole && pathname !== "/dashboard" && !pathname.startsWith("/profile") && (!currentFeature || !isActive || !(session.user as any).roleEnabled)) redirect("/dashboard?restricted=1");
  const currentFeatureState = currentFeature ? featureState[currentFeature.key] : null;
  if (currentFeatureState && (!currentFeatureState.visible || currentFeatureState.status === "coming_soon") && pathname !== "/dashboard") {
    redirect("/dashboard?restricted=1");
  }
  return (
    <DashboardFrame role={role} accountStatus={accountStatus} isSuperAdmin={isSuperAdmin} featureState={featureState} hasCreditPlan={hasCreditPlan} hasScheduledClassroom={hasScheduledClassroom} user={{ name: session.user.name, role: (session.user as any).roleName || role, isActive, isPaused }}>
      {children}
    </DashboardFrame>
  );
}
