import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { findFeatureByApiPath } from "@/lib/featureRegistry";

export async function requireAdminApiAccess(req: Request, permission = "view") {
  const session = await auth();
  if (!session?.user) return null;
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "sub-admin") return null;
  if (await isSuperAdminSession(session.user as any)) return session;
  const pathname = new URL(req.url).pathname;
  const feature = findFeatureByApiPath(pathname);
  if (!feature) return role === "admin" ? session : null;
  return (await canAccessFeature(feature.key, session.user as any, permission)) ? session : null;
}
