import "server-only";

import { auth } from "@/lib/auth";
import { resolveAccessRole } from "@/lib/accessRoles";
import { canAccessFeature } from "@/lib/featureAccess";
import { canApplyForLeave, canFileLeaveForOthers, isMarketingRoleName, type LeaveViewer } from "./leaveRules";
import { isNamedLeaveApprover } from "./leaveRecipients";

/**
 * The signed-in staff member as the leave system sees them, or null when the
 * page and its APIs are closed to them (students, marketing staff, anyone the
 * feature is switched off for).
 */
export async function resolveLeaveViewer(): Promise<LeaveViewer | null> {
  const user = (await auth())?.user as any;
  if (!user?.id || !["instructor", "admin", "sub-admin"].includes(user.role)) return null;
  if (!(await canAccessFeature("leaveManagement", user, "view"))) return null;
  const roleName = user.roleName ?? (await resolveAccessRole(String(user.id)))?.roleName;
  if (isMarketingRoleName(roleName)) return null;
  const canCreate = await canAccessFeature("leaveManagement", user, "create");
  return {
    id: String(user.id),
    name: String(user.name || ""),
    role: user.role,
    canApply: canCreate && canApplyForLeave(user.role, roleName),
    canApplyForOthers: canCreate && canFileLeaveForOthers(user.role, roleName),
    isApprover: user.role === "admin" || isNamedLeaveApprover(user.email),
    canManageCredits: user.role === "admin",
  };
}
