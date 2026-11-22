import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";

/** View = the templates page; manage (clear, assign) = admin or the edit grant. */
export async function automationEventAccess() {
  const session = await auth();
  const user = session?.user as any;
  if (!session || !user) return { session: null, canView: false, canManage: false };
  const canView = await canAccessFeature("homeworkTemplates", user, "view");
  const canManage = canView && (user.role === "admin" || (await canAccessFeature("homeworkTemplates", user, "edit")));
  return { session, canView, canManage, actorId: String(user.id || "") };
}
