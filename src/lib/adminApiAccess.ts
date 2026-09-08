import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { findFeatureByApiPath } from "@/lib/featureRegistry";
import { namedRoleApiFeature } from "@/lib/accessRoleRequests";

export async function requireAdminApiAccess(req: Request, permission = "view") {
  const session = await auth();
  if (!session?.user) return null;
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "sub-admin") return null;
  if (await isSuperAdminSession(session.user as any)) return session;
  const pathname = new URL(req.url).pathname;
  if ((session.user as any).accessRoleId) {
    const key = namedRoleApiFeature(pathname);
    return key && await canAccessFeature(key, session.user as any, permission) ? session : null;
  }
  const feature = findFeatureByApiPath(pathname);
  if (!feature) return role === "admin" ? session : null;
  return (await canAccessFeature(feature.key, session.user as any, permission)) ? session : null;
}
