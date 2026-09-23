import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";

const AUTHORING_ROLES = new Set(["instructor", "admin", "sub-admin"]);

/**
 * Gate for the Learn Chess authoring and analytics APIs.
 *
 * requireAdminApiAccess turns instructors away outright, but coaches are exactly
 * the people who should be writing chess exercises, so this checks the learnChess
 * feature permission directly instead.
 */
export async function requireLearnAuthoring(permission: "view" | "create" | "edit" | "manage" = "edit") {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return null;
  if (!AUTHORING_ROLES.has(String(user.role))) return null;
  if (await isSuperAdminSession(user)) return session;
  return (await canAccessFeature("learnChess", user, permission)) ? session : null;
}
