import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature, getFeaturePermissionState } from "@/lib/featureAccess";

export const COACH_PAY_FEATURE = "coachPay";
export const COACH_PAY_PERMISSIONS = ["view", "view_own", "manage_rates", "rule", "export"] as const;
export type CoachPayPermission = (typeof COACH_PAY_PERMISSIONS)[number];

export type CoachPayViewer = {
  userId: string;
  name: string;
  role: string;
  /** True when this viewer may see the whole academy's cost, not just their own. */
  canViewAll: boolean;
  canManageRates: boolean;
  canRule: boolean;
  canExport: boolean;
};

/**
 * Who is looking, and how much of the payroll they are entitled to see.
 *
 * A coach reading their own earnings and an admin reading the academy's wage
 * bill hit the same screens, so the scope decision is made once here and every
 * caller narrows its query by `canViewAll`. Returning null means no access at
 * all - not "show them an empty report".
 */
export async function resolveCoachPayViewer(): Promise<CoachPayViewer | null> {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) return null;

  const permissions = await getFeaturePermissionState(COACH_PAY_FEATURE, user, COACH_PAY_PERMISSIONS);
  const canViewAll = Boolean(permissions.view);
  if (!canViewAll && !permissions.view_own) return null;

  return {
    userId: String(user.id),
    name: user.name || "",
    role: String(user.role || ""),
    canViewAll,
    canManageRates: Boolean(permissions.manage_rates),
    canRule: Boolean(permissions.rule),
    canExport: Boolean(permissions.export),
  };
}

/** Guard for the money-changing routes: rate cards, overrides, and rulings. */
export async function requireCoachPayPermission(permission: CoachPayPermission) {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) return null;
  if (user.role !== "admin" && user.role !== "sub-admin") return null;
  return (await canAccessFeature(COACH_PAY_FEATURE, user, permission)) ? session : null;
}
