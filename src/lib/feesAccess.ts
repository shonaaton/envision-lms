import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";

export type FeesPermission = "view" | "invoice" | "edit" | "delete" | "payment" | "credit" | "export";

export async function requireFeesAccess(permission: FeesPermission, featureKey = "fees") {
  const session = await auth();
  if (!session?.user) return null;
  return (await canAccessFeature(featureKey, session.user as any, permission)) ? session : null;
}

export function isFeesManager(role?: string) {
  return role === "admin" || role === "sub-admin";
}
